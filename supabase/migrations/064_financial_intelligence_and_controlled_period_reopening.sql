begin;

-- Bank reconciliation RPCs require an authenticated session; keep their
-- existing in-function business-role and same-account checks.
revoke all on function public.import_bank_statement_lines(uuid,jsonb) from public, anon;
grant execute on function public.import_bank_statement_lines(uuid,jsonb) to authenticated;
revoke all on function public.match_bank_statement_line(uuid,uuid) from public, anon;
grant execute on function public.match_bank_statement_line(uuid,uuid) to authenticated;

-- Receivables/payables ageing: based only on outstanding, non-void obligations.
create index if not exists financial_obligations_business_due_idx
  on public.financial_obligations(business_id,due_date)
  where status in ('open','part_paid');

create or replace function public.accounting_obligation_aging(
  p_business_id uuid,
  p_as_of date default current_date
)
returns table(
  obligation_id uuid,
  obligation_type text,
  party_name text,
  description text,
  reference text,
  due_date date,
  total_amount numeric,
  amount_paid numeric,
  outstanding numeric,
  days_overdue integer,
  aging_bucket text
)
language plpgsql
stable
security invoker
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.has_business_role(
    p_business_id,array['owner','admin','manager','accountant']::public.business_role[]
  ) then
    raise exception 'You are not authorised to view financial obligations for this business';
  end if;
  if p_as_of is null then raise exception 'A reporting date is required'; end if;

  return query
  select o.id,o.obligation_type,o.party_name,o.description,o.reference,o.due_date,
    o.amount,o.amount_paid,round(o.amount-o.amount_paid,2),
    greatest(p_as_of-coalesce(o.due_date,p_as_of),0)::integer,
    case
      when o.due_date is null or o.due_date>=p_as_of then 'Not due'
      when p_as_of-o.due_date<=30 then '1–30 days'
      when p_as_of-o.due_date<=60 then '31–60 days'
      when p_as_of-o.due_date<=90 then '61–90 days'
      else 'Over 90 days'
    end
  from public.financial_obligations o
  where o.business_id=p_business_id
    and o.status in ('open','part_paid')
    and o.amount>o.amount_paid
  order by o.due_date nulls last,o.party_name;
end;
$function$;

revoke all on function public.accounting_obligation_aging(uuid,date) from public, anon;
grant execute on function public.accounting_obligation_aging(uuid,date) to authenticated;

-- Contractual cash commitments forecast. This deliberately excludes
-- speculative future sales and expenses not yet entered as obligations.
create or replace function public.accounting_cash_commitments_forecast(
  p_business_id uuid,
  p_from date,
  p_to date
)
returns table(
  due_date date,
  expected_inflows numeric,
  expected_outflows numeric,
  receivable_count bigint,
  payable_count bigint
)
language plpgsql
stable
security invoker
set search_path to ''
as $function$
begin
  if auth.uid() is null or not public.has_business_role(
    p_business_id,array['owner','admin','manager','accountant']::public.business_role[]
  ) then
    raise exception 'You are not authorised to view this business cash forecast';
  end if;
  if p_from is null or p_to is null or p_to<p_from or p_to>p_from+365 then
    raise exception 'Choose a valid forecast window of up to 365 days';
  end if;

  return query
  select o.due_date,
    round(sum(case when o.obligation_type='receivable' then o.amount-o.amount_paid else 0 end),2),
    round(sum(case when o.obligation_type='payable' then o.amount-o.amount_paid else 0 end),2),
    count(*) filter(where o.obligation_type='receivable'),
    count(*) filter(where o.obligation_type='payable')
  from public.financial_obligations o
  where o.business_id=p_business_id
    and o.status in ('open','part_paid')
    and o.amount>o.amount_paid
    and o.due_date between p_from and p_to
  group by o.due_date
  order by o.due_date;
end;
$function$;

revoke all on function public.accounting_cash_commitments_forecast(uuid,date,date) from public, anon;
grant execute on function public.accounting_cash_commitments_forecast(uuid,date,date) to authenticated;

-- Append-only audit events for authorised period reopening.
create table if not exists public.accounting_period_reopen_events(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_close_id uuid not null references public.accounting_period_closes(id) on delete restrict,
  reason text not null check(length(trim(reason))>=10),
  reopened_by uuid not null references auth.users(id),
  reopened_at timestamptz not null default now()
);
create index if not exists accounting_period_reopen_events_close_idx
  on public.accounting_period_reopen_events(period_close_id,reopened_at desc);
alter table public.accounting_period_reopen_events enable row level security;
revoke all on public.accounting_period_reopen_events from public, anon, authenticated;

-- A period remains locked until a later authorised reopen event. Re-closing
-- the same period advances closed_at and locks it again.
create or replace function public.guard_closed_accounting_period()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.source_type <> 'period_close' and exists (
    select 1
    from public.accounting_period_closes c
    where c.business_id=new.business_id
      and new.journal_date between c.period_start and c.period_end
      and c.closed_at > coalesce((
        select max(e.reopened_at)
        from public.accounting_period_reopen_events e
        where e.period_close_id=c.id
      ),'-infinity'::timestamptz)
  ) then
    raise exception 'This accounting period is closed. An authorised reopening is required before posting into it.';
  end if;
  return new;
end;
$function$;

create or replace function public.reopen_accounting_period(
  p_business_id uuid,
  p_period_close_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_close public.accounting_period_closes%rowtype;
  v_event uuid;
  v_latest_reopen timestamptz;
begin
  if auth.uid() is null or not public.has_business_role(
    p_business_id,array['owner','admin']::public.business_role[]
  ) then
    raise exception 'Only a business owner or administrator can reopen an accounting period';
  end if;
  if length(trim(coalesce(p_reason,'')))<10 then
    raise exception 'Provide a clear reopening reason of at least 10 characters';
  end if;

  select * into v_close
  from public.accounting_period_closes
  where id=p_period_close_id and business_id=p_business_id
  for update;
  if not found then raise exception 'Accounting period close record not found'; end if;

  select max(e.reopened_at) into v_latest_reopen
  from public.accounting_period_reopen_events e
  where e.period_close_id=v_close.id;
  if v_latest_reopen is not null and v_latest_reopen>v_close.closed_at then
    raise exception 'This accounting period is already reopened';
  end if;

  insert into public.accounting_period_reopen_events(
    business_id,period_close_id,reason,reopened_by
  ) values(p_business_id,v_close.id,trim(p_reason),auth.uid())
  returning id into v_event;

  -- Reverse the original close journal inside the now-authorised period.
  -- The original journal remains immutable; the reversal is fully linked.
  perform public.reverse_accounting_journal(
    p_business_id,v_close.closing_journal_id,v_close.period_end,
    'Authorised period reopening: '||trim(p_reason)
  );

  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(p_business_id,auth.uid(),'accounting_period_reopened','accounting_period_closes',v_close.id::text,
    jsonb_build_object('reopen_event_id',v_event,'period_start',v_close.period_start,
      'period_end',v_close.period_end,'reason',trim(p_reason),
      'reversed_closing_journal_id',v_close.closing_journal_id));

  return v_event;
end;
$function$;

revoke all on function public.reopen_accounting_period(uuid,uuid,text) from public, anon;
grant execute on function public.reopen_accounting_period(uuid,uuid,text) to authenticated;

-- Permit a previously reopened period to be closed again. Other overlapping
-- periods remain prohibited. The existing close row is updated, preserving
-- its stable ID and all reopening/reversal audit history.
create or replace function public.close_accounting_period(
  p_business_id uuid,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lines jsonb:='[]'::jsonb;
  r record;
  v_profit numeric(18,2):=0;
  v_journal uuid;
  v_source text;
  v_existing public.accounting_period_closes%rowtype;
  v_latest_reopen timestamptz;
begin
  if auth.uid() is null or not public.has_business_role(
    p_business_id,array['owner','admin','accountant']::public.business_role[]
  ) then raise exception 'Only an owner, administrator or accountant can close an accounting period'; end if;
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start then
    raise exception 'A valid accounting period is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text||p_period_start::text||p_period_end::text));

  select * into v_existing from public.accounting_period_closes
  where business_id=p_business_id and period_start=p_period_start and period_end=p_period_end
  order by closed_at desc limit 1 for update;

  if exists(
    select 1 from public.accounting_period_closes c
    where c.business_id=p_business_id
      and not (c.period_end<p_period_start or c.period_start>p_period_end)
      and (v_existing.id is null or c.id<>v_existing.id)
  ) then raise exception 'This period overlaps a different already closed period'; end if;

  if v_existing.id is not null then
    select max(e.reopened_at) into v_latest_reopen
    from public.accounting_period_reopen_events e where e.period_close_id=v_existing.id;
    if v_latest_reopen is null or v_latest_reopen<=v_existing.closed_at then
      raise exception 'This period is already closed';
    end if;
  end if;

  for r in
    select a.account_code,a.account_name,a.account_type,
      round(coalesce(sum(case when a.account_type='income' then l.credit-l.debit else l.debit-l.credit end),0),2) as balance
    from public.chart_of_accounts a
    left join public.journal_lines l on l.account_id=a.id and l.business_id=a.business_id
    left join public.journal_entries j on j.id=l.journal_entry_id and j.business_id=l.business_id
      and j.status='posted' and j.journal_date between p_period_start and p_period_end
    where a.business_id=p_business_id and a.is_active and a.account_type in ('income','expense')
    group by a.account_code,a.account_name,a.account_type
    having abs(coalesce(sum(case when a.account_type='income' then l.credit-l.debit else l.debit-l.credit end),0))>0.005
    order by a.account_code
  loop
    if r.account_type='income' then
      if r.balance>0 then
        v_lines:=v_lines||jsonb_build_array(jsonb_build_object('code',r.account_code,'debit',r.balance,'credit',0,'description','Period close · '||r.account_name));
      else
        v_lines:=v_lines||jsonb_build_array(jsonb_build_object('code',r.account_code,'debit',0,'credit',abs(r.balance),'description','Period close · '||r.account_name));
      end if;
      v_profit:=v_profit+r.balance;
    else
      if r.balance>0 then
        v_lines:=v_lines||jsonb_build_array(jsonb_build_object('code',r.account_code,'debit',0,'credit',r.balance,'description','Period close · '||r.account_name));
      else
        v_lines:=v_lines||jsonb_build_array(jsonb_build_object('code',r.account_code,'debit',abs(r.balance),'credit',0,'description','Period close · '||r.account_name));
      end if;
      v_profit:=v_profit-r.balance;
    end if;
  end loop;

  if abs(v_profit)>0.005 then
    if v_profit>0 then
      v_lines:=v_lines||jsonb_build_array(jsonb_build_object('code','3200','debit',0,'credit',v_profit,'description','Net income transferred to retained earnings'));
    else
      v_lines:=v_lines||jsonb_build_array(jsonb_build_object('code','3200','debit',abs(v_profit),'credit',0,'description','Net loss transferred to retained earnings'));
    end if;
  end if;
  if jsonb_array_length(v_lines)<2 then raise exception 'There are no income or expense balances to close'; end if;

  v_source:=p_period_start::text||'|'||p_period_end::text;
  v_journal:=public.post_system_journal(p_business_id,p_period_end,
    'Period close · '||v_source,'period_close',v_source,v_lines);

  if v_existing.id is null then
    insert into public.accounting_period_closes(business_id,period_start,period_end,closing_journal_id,closed_by)
    values(p_business_id,p_period_start,p_period_end,v_journal,auth.uid());
  else
    update public.accounting_period_closes
    set closing_journal_id=v_journal,closed_by=auth.uid(),closed_at=now()
    where id=v_existing.id;
  end if;

  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(p_business_id,auth.uid(),'accounting_period_closed','accounting_period_closes',v_journal::text,
    jsonb_build_object('period_start',p_period_start,'period_end',p_period_end,'net_result',v_profit,
      'reclosed',v_existing.id is not null));
  return v_journal;
end;
$function$;

revoke all on function public.close_accounting_period(uuid,date,date) from public, anon;
grant execute on function public.close_accounting_period(uuid,date,date) to authenticated;

commit;