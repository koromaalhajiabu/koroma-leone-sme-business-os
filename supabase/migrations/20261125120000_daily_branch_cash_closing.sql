-- Koroma Leone Tech SME Business OS
-- Daily branch cash close, controls and audit history.
-- This migration is safe to rerun and uses the platform's shared role/approval gate.
begin;

create table if not exists public.daily_cash_closings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  close_date date not null,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','reopened')),
  client_request_id uuid not null,
  opening_cash_float numeric(14,2) not null default 0 check (opening_cash_float >= 0),
  cash_sales numeric(14,2) not null default 0 check (cash_sales >= 0),
  cashbook_cash_income numeric(14,2) not null default 0 check (cashbook_cash_income >= 0),
  cashbook_cash_expense numeric(14,2) not null default 0 check (cashbook_cash_expense >= 0),
  expense_module_cash_expense numeric(14,2) not null default 0 check (expense_module_cash_expense >= 0),
  expected_cash numeric(14,2) not null default 0,
  counted_cash numeric(14,2) not null default 0 check (counted_cash >= 0),
  cash_variance numeric(14,2) not null default 0,
  sales_by_tender jsonb not null default '{}'::jsonb,
  cashbook_by_tender jsonb not null default '{}'::jsonb,
  sales_count integer not null default 0 check (sales_count >= 0),
  cashbook_count integer not null default 0 check (cashbook_count >= 0),
  expense_count integer not null default 0 check (expense_count >= 0),
  unmatched_statement_count integer not null default 0 check (unmatched_statement_count >= 0),
  unmatched_statement_amount numeric(14,2) not null default 0 check (unmatched_statement_amount >= 0),
  flags jsonb not null default '[]'::jsonb,
  note text not null default '' check (length(note) <= 1000),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 1000),
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopen_reason text check (reopen_reason is null or length(reopen_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  unique (business_id,branch_id,close_date),
  unique (business_id,client_request_id),
  foreign key (branch_id,business_id)
    references public.branches(id,business_id) on delete restrict
);

create index if not exists daily_cash_closings_business_date_idx
  on public.daily_cash_closings(business_id,close_date desc);
create index if not exists daily_cash_closings_branch_status_idx
  on public.daily_cash_closings(business_id,branch_id,status,close_date desc);

alter table public.daily_cash_closings enable row level security;
drop policy if exists daily_cash_closings_member_read on public.daily_cash_closings;
create policy daily_cash_closings_member_read
on public.daily_cash_closings for select to authenticated
using (
  public.is_business_member(business_id)
  and (
    public.has_business_role(
      business_id,
      array['owner','admin','manager','accountant']::public.business_role[]
    )
    or submitted_by = auth.uid()
    or exists (
      select 1 from public.branch_members bm
      where bm.business_id = daily_cash_closings.business_id
        and bm.branch_id = daily_cash_closings.branch_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
    )
  )
);
revoke all on public.daily_cash_closings from anon,public,authenticated;
grant select on public.daily_cash_closings to authenticated;

CREATE OR REPLACE FUNCTION public.assert_daily_cash_close_open(p_business_id uuid, p_branch_id uuid, p_close_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_business_id is null or p_branch_id is null or p_close_date is null then return; end if;
  if exists (
    select 1 from public.daily_cash_closings c
    where c.business_id=p_business_id and c.branch_id=p_branch_id
      and c.close_date=p_close_date and c.status in ('submitted','approved')
  ) then
    raise exception 'This branch and date have a submitted or approved daily close. An owner or administrator must reopen it before changing transactions.';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_daily_cash_close_preview(p_business_id uuid, p_branch_id uuid, p_close_date date, p_opening_cash_float numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.business_role;
  v_cash_sales numeric(14,2) := 0;
  v_cashbook_income numeric(14,2) := 0;
  v_cashbook_expense numeric(14,2) := 0;
  v_expense_cash numeric(14,2) := 0;
  v_expected numeric(14,2) := 0;
  v_sales_count integer := 0;
  v_cashbook_count integer := 0;
  v_expense_count integer := 0;
  v_unmatched_count integer := 0;
  v_unmatched_amount numeric(14,2) := 0;
  v_sales_by_tender jsonb := '{}'::jsonb;
  v_cashbook_by_tender jsonb := '{}'::jsonb;
  v_flags jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_business_id is null or p_branch_id is null or p_close_date is null then
    raise exception 'Business, branch and close date are required';
  end if;
  if coalesce(p_opening_cash_float,0) < 0 then
    raise exception 'Opening cash float cannot be negative';
  end if;

  if not public.has_business_role(
    p_business_id,array['owner','admin','manager','accountant','cashier']::public.business_role[]
  ) then
    raise exception 'Your account is not authorised to prepare a daily cash close';
  end if;
  select bm.role into v_role
  from public.business_members bm
  where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true;
  if not found or v_role not in ('owner','admin','manager','accountant','cashier') then
    raise exception 'Your account is not authorised to prepare a daily cash close';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id=p_branch_id and b.business_id=p_business_id and b.is_active=true
  ) then raise exception 'Select an active branch belonging to this business'; end if;
  if v_role='cashier' and not exists (
    select 1 from public.branch_members bm
    where bm.business_id=p_business_id and bm.branch_id=p_branch_id
      and bm.user_id=auth.uid() and bm.is_active=true
  ) then raise exception 'You are not assigned to this branch'; end if;

  select round(coalesce(sum(s.total),0),2),count(*)::integer
  into v_cash_sales,v_sales_count
  from public.offline_sales s
  where s.business_id=p_business_id and s.branch_id=p_branch_id
    and s.transaction_date=p_close_date
    and lower(trim(coalesce(s.payment_method,'')))='cash';

  select coalesce(jsonb_object_agg(tender,total),'{}'::jsonb)
  into v_sales_by_tender
  from (
    select coalesce(nullif(lower(trim(s.payment_method)),''),'unspecified') as tender,
      round(sum(s.total),2) as total
    from public.offline_sales s
    where s.business_id=p_business_id and s.branch_id=p_branch_id
      and s.transaction_date=p_close_date
    group by 1
  ) t;

  select
    round(coalesce(sum(case when c.entry_type='income' then c.amount else 0 end),0),2),
    round(coalesce(sum(case when c.entry_type='expense' then c.amount else 0 end),0),2),
    count(*)::integer
  into v_cashbook_income,v_cashbook_expense,v_cashbook_count
  from public.cashbook_entries c
  where c.business_id=p_business_id and c.branch_id=p_branch_id
    and c.entry_date=p_close_date
    and lower(trim(coalesce(c.payment_method,'')))='cash';

  select coalesce(jsonb_object_agg(tender,jsonb_build_object(
    'income',income,'expense',expense
  )),'{}'::jsonb)
  into v_cashbook_by_tender
  from (
    select coalesce(nullif(lower(trim(c.payment_method)),''),'unspecified') as tender,
      round(coalesce(sum(c.amount) filter(where c.entry_type='income'),0),2) as income,
      round(coalesce(sum(c.amount) filter(where c.entry_type='expense'),0),2) as expense
    from public.cashbook_entries c
    where c.business_id=p_business_id and c.branch_id=p_branch_id
      and c.entry_date=p_close_date
    group by 1
  ) t;

  select round(coalesce(sum(e.amount),0),2),count(*)::integer
  into v_expense_cash,v_expense_count
  from public.expenses e
  where e.business_id=p_business_id and e.branch_id=p_branch_id
    and e.expense_date=p_close_date
    and lower(trim(coalesce(e.payment_method,'')))='cash';

  select count(*)::integer,round(coalesce(sum(l.amount),0),2)
  into v_unmatched_count,v_unmatched_amount
  from public.bank_statement_lines l
  join public.bank_accounts a
    on a.id=l.bank_account_id and a.business_id=l.business_id
  where l.business_id=p_business_id and a.branch_id=p_branch_id
    and l.transaction_date=p_close_date and l.status='unmatched';

  v_expected := round(
    coalesce(p_opening_cash_float,0) + v_cash_sales + v_cashbook_income
    - v_cashbook_expense - v_expense_cash,2
  );
  if v_unmatched_count>0 then
    v_flags := v_flags || jsonb_build_array('unmatched_bank_statement_lines');
  end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'branch_id',p_branch_id,
    'close_date',p_close_date,
    'currency_code',(select b.currency_code from public.businesses b where b.id=p_business_id),
    'opening_cash_float',round(coalesce(p_opening_cash_float,0),2),
    'cash_sales',v_cash_sales,
    'cashbook_cash_income',v_cashbook_income,
    'cashbook_cash_expense',v_cashbook_expense,
    'expense_module_cash_expense',v_expense_cash,
    'expected_cash',v_expected,
    'sales_count',v_sales_count,
    'cashbook_count',v_cashbook_count,
    'expense_count',v_expense_count,
    'sales_by_tender',v_sales_by_tender,
    'cashbook_by_tender',v_cashbook_by_tender,
    'unmatched_statement_count',v_unmatched_count,
    'unmatched_statement_amount',v_unmatched_amount,
    'flags',v_flags,
    'duplicate_statement_references_protected',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_daily_cash_close_bank_statement_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_data jsonb;
  v_account_id uuid;
  v_business_id uuid;
  v_close_date date;
  v_branch_id uuid;
begin
  if tg_op<>'INSERT' then
    v_data:=to_jsonb(old);
    v_account_id:=(v_data->>'bank_account_id')::uuid;
    v_business_id:=(v_data->>'business_id')::uuid;
    v_close_date:=(v_data->>'transaction_date')::date;
    select a.branch_id into v_branch_id from public.bank_accounts a
      where a.id=v_account_id and a.business_id=v_business_id;
    perform public.assert_daily_cash_close_open(v_business_id,v_branch_id,v_close_date);
  end if;
  if tg_op<>'DELETE' then
    v_data:=to_jsonb(new);
    v_account_id:=(v_data->>'bank_account_id')::uuid;
    v_business_id:=(v_data->>'business_id')::uuid;
    v_close_date:=(v_data->>'transaction_date')::date;
    select a.branch_id into v_branch_id from public.bank_accounts a
      where a.id=v_account_id and a.business_id=v_business_id;
    perform public.assert_daily_cash_close_open(v_business_id,v_branch_id,v_close_date);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_daily_cash_close_source_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_data jsonb;
  v_business_id uuid;
  v_branch_id uuid;
  v_close_date date;
begin
  if tg_op<>'INSERT' then
    v_data:=to_jsonb(old);
    v_business_id:=(v_data->>'business_id')::uuid;
    v_branch_id:=nullif(v_data->>'branch_id','')::uuid;
    if tg_table_name='offline_sales' then
      v_close_date:=(v_data->>'transaction_date')::date;
    elsif tg_table_name='cashbook_entries' then
      v_close_date:=(v_data->>'entry_date')::date;
    elsif tg_table_name='expenses' then
      v_close_date:=(v_data->>'expense_date')::date;
    elsif tg_table_name='offline_sale_returns' then
      v_close_date:=((v_data->>'created_at')::timestamptz at time zone 'Africa/Freetown')::date;
    end if;
    perform public.assert_daily_cash_close_open(v_business_id,v_branch_id,v_close_date);
  end if;

  if tg_op<>'DELETE' then
    v_data:=to_jsonb(new);
    v_business_id:=(v_data->>'business_id')::uuid;
    v_branch_id:=nullif(v_data->>'branch_id','')::uuid;
    if tg_table_name='offline_sales' then
      v_close_date:=(v_data->>'transaction_date')::date;
    elsif tg_table_name='cashbook_entries' then
      v_close_date:=(v_data->>'entry_date')::date;
    elsif tg_table_name='expenses' then
      v_close_date:=(v_data->>'expense_date')::date;
    elsif tg_table_name='offline_sale_returns' then
      v_close_date:=((v_data->>'created_at')::timestamptz at time zone 'Africa/Freetown')::date;
    end if;
    perform public.assert_daily_cash_close_open(v_business_id,v_branch_id,v_close_date);
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reopen_daily_cash_close(p_close_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_close public.daily_cash_closings%rowtype;
  v_reason text:=trim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_close from public.daily_cash_closings where id=p_close_id for update;
  if not found then raise exception 'Daily cash close not found'; end if;
  if not public.has_business_role(
    v_close.business_id,array['owner','admin']::public.business_role[]
  ) then raise exception 'Only a business owner or administrator can reopen a daily close'; end if;
  if v_close.status not in ('submitted','approved') then
    raise exception 'Only a submitted or approved close can be reopened';
  end if;
  if length(v_reason)<10 or length(v_reason)>1000 then
    raise exception 'Provide a reopening reason of at least 10 characters';
  end if;

  update public.daily_cash_closings
  set status='reopened',reopened_by=auth.uid(),reopened_at=now(),
      reopen_reason=v_reason,updated_at=now()
  where id=v_close.id;

  insert into public.audit_logs(
    business_id,actor_user_id,action,entity_table,entity_id,details
  ) values (
    v_close.business_id,auth.uid(),'daily_cash_close_reopened',
    'daily_cash_closings',v_close.id::text,
    jsonb_build_object('branch_id',v_close.branch_id,'close_date',v_close.close_date,'reason',v_reason)
  );
  return v_close.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_daily_cash_close(p_close_id uuid, p_decision text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_close public.daily_cash_closings%rowtype;
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_note text:=trim(coalesce(p_note,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_close from public.daily_cash_closings where id=p_close_id for update;
  if not found then raise exception 'Daily cash close not found'; end if;
  if not public.has_business_role(
    v_close.business_id,array['owner','admin','manager','accountant']::public.business_role[]
  ) then raise exception 'Only authorised management can review a daily close'; end if;
  if v_close.status<>'submitted' then raise exception 'Only submitted daily closes can be reviewed'; end if;
  if v_close.submitted_by=auth.uid() then
    raise exception 'The person who submitted a daily close cannot approve their own close';
  end if;
  if v_decision not in ('approved','rejected') then raise exception 'Choose approve or reject'; end if;
  if length(v_note)>1000 then raise exception 'Review note is too long'; end if;
  if v_decision='rejected' and length(v_note)<10 then
    raise exception 'Provide a rejection reason of at least 10 characters';
  end if;
  if v_decision='approved'
    and (abs(v_close.cash_variance)>0.01 or v_close.unmatched_statement_count>0)
    and length(v_note)<10 then
    raise exception 'A variance or unmatched bank line requires a review note of at least 10 characters';
  end if;

  update public.daily_cash_closings
  set status=v_decision,reviewed_by=auth.uid(),reviewed_at=now(),
      review_note=nullif(v_note,''),updated_at=now()
  where id=v_close.id;

  insert into public.audit_logs(
    business_id,actor_user_id,action,entity_table,entity_id,details
  ) values (
    v_close.business_id,auth.uid(),'daily_cash_close_'||v_decision,
    'daily_cash_closings',v_close.id::text,
    jsonb_build_object(
      'branch_id',v_close.branch_id,'close_date',v_close.close_date,
      'cash_variance',v_close.cash_variance,
      'unmatched_statement_count',v_close.unmatched_statement_count,
      'review_note',nullif(v_note,'')
    )
  );
  return v_close.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_daily_cash_close(p_business_id uuid, p_branch_id uuid, p_close_date date, p_opening_cash_float numeric, p_counted_cash numeric, p_note text, p_client_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_preview jsonb;
  v_existing public.daily_cash_closings%rowtype;
  v_close_id uuid;
  v_expected numeric(14,2);
  v_variance numeric(14,2);
  v_flags jsonb;
  v_note text := coalesce(trim(p_note),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_client_request_id is null then raise exception 'A secure request ID is required'; end if;
  if p_counted_cash is null or p_counted_cash<0 then raise exception 'Counted cash must be zero or greater'; end if;
  if coalesce(p_opening_cash_float,0)<0 then raise exception 'Opening cash float cannot be negative'; end if;
  if p_close_date>current_date then raise exception 'A future date cannot be closed'; end if;
  if length(v_note)>1000 then raise exception 'Closing note is too long'; end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text||p_branch_id::text||p_close_date::text));
  select * into v_existing
  from public.daily_cash_closings
  where business_id=p_business_id and branch_id=p_branch_id and close_date=p_close_date
  for update;

  if found and v_existing.status='submitted' then
    if v_existing.client_request_id=p_client_request_id then return v_existing.id; end if;
    raise exception 'This branch has already submitted a close for this date';
  end if;
  if found and v_existing.status='approved' then
    raise exception 'This daily close is approved. An owner or administrator must reopen it first';
  end if;

  if exists (
    select 1 from public.daily_cash_closings
    where business_id=p_business_id and client_request_id=p_client_request_id
      and (v_existing.id is null or id<>v_existing.id)
  ) then raise exception 'This request ID has already been used'; end if;

  v_preview:=public.get_daily_cash_close_preview(
    p_business_id,p_branch_id,p_close_date,coalesce(p_opening_cash_float,0)
  );
  v_expected:=round((v_preview->>'expected_cash')::numeric,2);
  v_variance:=round(p_counted_cash-v_expected,2);
  v_flags:=coalesce(v_preview->'flags','[]'::jsonb);
  if abs(v_variance)>0.01 then
    v_flags:=v_flags||jsonb_build_array('cash_variance_requires_review');
  end if;

  if v_existing.id is null then
    insert into public.daily_cash_closings(
      business_id,branch_id,close_date,status,client_request_id,
      opening_cash_float,cash_sales,cashbook_cash_income,cashbook_cash_expense,
      expense_module_cash_expense,expected_cash,counted_cash,cash_variance,
      sales_by_tender,cashbook_by_tender,sales_count,cashbook_count,expense_count,
      unmatched_statement_count,unmatched_statement_amount,flags,note,submitted_by,submitted_at,
      reviewed_by,reviewed_at,review_note
    ) values (
      p_business_id,p_branch_id,p_close_date,'submitted',p_client_request_id,
      coalesce(p_opening_cash_float,0),
      (v_preview->>'cash_sales')::numeric,
      (v_preview->>'cashbook_cash_income')::numeric,
      (v_preview->>'cashbook_cash_expense')::numeric,
      (v_preview->>'expense_module_cash_expense')::numeric,
      v_expected,p_counted_cash,v_variance,
      coalesce(v_preview->'sales_by_tender','{}'::jsonb),
      coalesce(v_preview->'cashbook_by_tender','{}'::jsonb),
      coalesce((v_preview->>'sales_count')::integer,0),
      coalesce((v_preview->>'cashbook_count')::integer,0),
      coalesce((v_preview->>'expense_count')::integer,0),
      coalesce((v_preview->>'unmatched_statement_count')::integer,0),
      coalesce((v_preview->>'unmatched_statement_amount')::numeric,0),
      v_flags,v_note,auth.uid(),now(),null,null,null
    ) returning id into v_close_id;
  else
    update public.daily_cash_closings set
      status='submitted',client_request_id=p_client_request_id,
      opening_cash_float=coalesce(p_opening_cash_float,0),
      cash_sales=(v_preview->>'cash_sales')::numeric,
      cashbook_cash_income=(v_preview->>'cashbook_cash_income')::numeric,
      cashbook_cash_expense=(v_preview->>'cashbook_cash_expense')::numeric,
      expense_module_cash_expense=(v_preview->>'expense_module_cash_expense')::numeric,
      expected_cash=v_expected,counted_cash=p_counted_cash,cash_variance=v_variance,
      sales_by_tender=coalesce(v_preview->'sales_by_tender','{}'::jsonb),
      cashbook_by_tender=coalesce(v_preview->'cashbook_by_tender','{}'::jsonb),
      sales_count=coalesce((v_preview->>'sales_count')::integer,0),
      cashbook_count=coalesce((v_preview->>'cashbook_count')::integer,0),
      expense_count=coalesce((v_preview->>'expense_count')::integer,0),
      unmatched_statement_count=coalesce((v_preview->>'unmatched_statement_count')::integer,0),
      unmatched_statement_amount=coalesce((v_preview->>'unmatched_statement_amount')::numeric,0),
      flags=v_flags,note=v_note,submitted_by=auth.uid(),submitted_at=now(),
      reviewed_by=null,reviewed_at=null,review_note=null,updated_at=now()
    where id=v_existing.id returning id into v_close_id;
  end if;

  insert into public.audit_logs(
    business_id,actor_user_id,action,entity_table,entity_id,details
  ) values (
    p_business_id,auth.uid(),'daily_cash_close_submitted','daily_cash_closings',v_close_id::text,
    jsonb_build_object(
      'branch_id',p_branch_id,'close_date',p_close_date,'expected_cash',v_expected,
      'counted_cash',p_counted_cash,'cash_variance',v_variance,
      'unmatched_statement_count',(v_preview->>'unmatched_statement_count')::integer,
      'flags',v_flags
    )
  );
  return v_close_id;
end;
$function$
;

drop trigger if exists trg_guard_daily_cash_close_sales on public.offline_sales;
drop trigger if exists trg_z_guard_daily_cash_close_sales on public.offline_sales;
create trigger trg_z_guard_daily_cash_close_sales
before insert or update or delete on public.offline_sales
for each row execute function public.guard_daily_cash_close_source_mutation();

drop trigger if exists trg_guard_daily_cash_close_cashbook on public.cashbook_entries;
create trigger trg_guard_daily_cash_close_cashbook
before insert or update or delete on public.cashbook_entries
for each row execute function public.guard_daily_cash_close_source_mutation();

drop trigger if exists trg_guard_daily_cash_close_expenses on public.expenses;
create trigger trg_guard_daily_cash_close_expenses
before insert or update or delete on public.expenses
for each row execute function public.guard_daily_cash_close_source_mutation();

drop trigger if exists trg_guard_daily_cash_close_returns on public.offline_sale_returns;
create trigger trg_guard_daily_cash_close_returns
before insert or update or delete on public.offline_sale_returns
for each row execute function public.guard_daily_cash_close_source_mutation();

drop trigger if exists trg_guard_daily_cash_close_bank_lines on public.bank_statement_lines;
create trigger trg_guard_daily_cash_close_bank_lines
before insert or update or delete on public.bank_statement_lines
for each row execute function public.guard_daily_cash_close_bank_statement_mutation();

revoke all on function public.get_daily_cash_close_preview(uuid,uuid,date,numeric) from public,anon;
revoke all on function public.submit_daily_cash_close(uuid,uuid,date,numeric,numeric,text,uuid) from public,anon;
revoke all on function public.review_daily_cash_close(uuid,text,text) from public,anon;
revoke all on function public.reopen_daily_cash_close(uuid,text) from public,anon;
revoke all on function public.assert_daily_cash_close_open(uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.guard_daily_cash_close_source_mutation() from public,anon,authenticated;
revoke all on function public.guard_daily_cash_close_bank_statement_mutation() from public,anon,authenticated;

grant execute on function public.get_daily_cash_close_preview(uuid,uuid,date,numeric) to authenticated;
grant execute on function public.submit_daily_cash_close(uuid,uuid,date,numeric,numeric,text,uuid) to authenticated;
grant execute on function public.review_daily_cash_close(uuid,text,text) to authenticated;
grant execute on function public.reopen_daily_cash_close(uuid,text) to authenticated;

comment on table public.daily_cash_closings is
'Branch- and date-scoped cash closing snapshots. Source records are locked while a close is submitted or approved.';

commit;
