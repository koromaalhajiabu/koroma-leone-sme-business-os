begin;
CREATE OR REPLACE FUNCTION public.close_accounting_period(p_business_id uuid, p_period_start date, p_period_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists (
    select 1 from public.daily_cash_closings d
    where d.business_id=p_business_id
      and d.close_date between p_period_start and p_period_end
      and d.status <> 'approved'
  ) then
    raise exception 'All submitted daily branch cash closes in this period must be approved before month-end accounting close';
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
$function$
;
revoke all on function public.close_accounting_period(uuid,date,date) from public,anon;
grant execute on function public.close_accounting_period(uuid,date,date) to authenticated;
commit;