-- Koroma Leone Tech SME Business OS
-- Count cash refunds in daily branch reconciliation and store the closing snapshot.
-- Existing role, branch-access, idempotency, audit and source-locking checks are preserved.

begin;

alter table public.daily_cash_closings
  add column if not exists cash_refunds numeric(14,2) not null default 0
    check (cash_refunds >= 0),
  add column if not exists cash_refund_count integer not null default 0
    check (cash_refund_count >= 0);

do $$
begin
  if to_regprocedure('public.get_daily_cash_close_preview_base(uuid,uuid,date,numeric)') is null
     and to_regprocedure('public.get_daily_cash_close_preview(uuid,uuid,date,numeric)') is not null then
    alter function public.get_daily_cash_close_preview(uuid,uuid,date,numeric)
      rename to get_daily_cash_close_preview_base;
  end if;
  if to_regprocedure('public.submit_daily_cash_close_base(uuid,uuid,date,numeric,numeric,text,uuid)') is null
     and to_regprocedure('public.submit_daily_cash_close(uuid,uuid,date,numeric,numeric,text,uuid)') is not null then
    alter function public.submit_daily_cash_close(uuid,uuid,date,numeric,numeric,text,uuid)
      rename to submit_daily_cash_close_base;
  end if;
end;
$$;

revoke all on function public.get_daily_cash_close_preview_base(uuid,uuid,date,numeric)
  from public, anon, authenticated;
revoke all on function public.submit_daily_cash_close_base(uuid,uuid,date,numeric,numeric,text,uuid)
  from public, anon, authenticated;

create or replace function public.get_daily_cash_close_preview(
  p_business_id uuid,
  p_branch_id uuid,
  p_close_date date,
  p_opening_cash_float numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preview jsonb;
  v_cash_refunds numeric(14,2) := 0;
  v_cash_refund_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- The base preview checks the caller's active business role and branch access.
  v_preview := public.get_daily_cash_close_preview_base(
    p_business_id, p_branch_id, p_close_date, coalesce(p_opening_cash_float,0)
  );

  -- Refunds are timestamped; use Sierra Leone local date for daily close reporting.
  select
    round(coalesce(sum(r.refund_total),0),2),
    count(*)::integer
  into v_cash_refunds, v_cash_refund_count
  from public.offline_sale_returns r
  where r.business_id = p_business_id
    and r.branch_id = p_branch_id
    and (r.created_at at time zone 'Africa/Freetown')::date = p_close_date
    and lower(trim(coalesce(r.refund_method,''))) = 'cash';

  return v_preview || jsonb_build_object(
    'cash_refunds', v_cash_refunds,
    'cash_refund_count', v_cash_refund_count,
    'expected_cash', round(
      coalesce((v_preview->>'expected_cash')::numeric,0) - v_cash_refunds, 2
    )
  );
end;
$function$;

create or replace function public.submit_daily_cash_close(
  p_business_id uuid,
  p_branch_id uuid,
  p_close_date date,
  p_opening_cash_float numeric,
  p_counted_cash numeric,
  p_note text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_close_id uuid;
  v_preview jsonb;
  v_expected numeric(14,2);
  v_cash_refunds numeric(14,2);
  v_cash_refund_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Retain the existing idempotency, role, branch and audit protections.
  -- The renamed implementation calls the upgraded preview function above.
  v_close_id := public.submit_daily_cash_close_base(
    p_business_id, p_branch_id, p_close_date, p_opening_cash_float,
    p_counted_cash, p_note, p_client_request_id
  );

  v_preview := public.get_daily_cash_close_preview(
    p_business_id, p_branch_id, p_close_date, coalesce(p_opening_cash_float,0)
  );
  v_expected := round((v_preview->>'expected_cash')::numeric,2);
  v_cash_refunds := round(coalesce((v_preview->>'cash_refunds')::numeric,0),2);
  v_cash_refund_count := coalesce((v_preview->>'cash_refund_count')::integer,0);

  update public.daily_cash_closings
  set cash_refunds = v_cash_refunds,
      cash_refund_count = v_cash_refund_count,
      expected_cash = v_expected,
      cash_variance = round(counted_cash - v_expected,2),
      updated_at = now()
  where id = v_close_id
    and business_id = p_business_id;

  return v_close_id;
end;
$function$;

revoke all on function public.get_daily_cash_close_preview(uuid,uuid,date,numeric)
  from public, anon;
grant execute on function public.get_daily_cash_close_preview(uuid,uuid,date,numeric)
  to authenticated, service_role;

revoke all on function public.submit_daily_cash_close(uuid,uuid,date,numeric,numeric,text,uuid)
  from public, anon;
grant execute on function public.submit_daily_cash_close(uuid,uuid,date,numeric,numeric,text,uuid)
  to authenticated, service_role;

commit;