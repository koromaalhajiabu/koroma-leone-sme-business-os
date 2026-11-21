-- Read-only monthly summary for the Koroma Leone Business Assistant preview.
create or replace function public.get_business_assistant_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_currency text;
  v_month_start date := date_trunc('month', current_date)::date;
  v_next_month date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_sales numeric(16,2) := 0;
  v_expenses numeric(16,2) := 0;
  v_pending bigint := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_business_member(p_business_id) then
    raise exception 'You do not have access to this business workspace';
  end if;
  select b.currency_code into v_currency from public.businesses b where b.id = p_business_id;
  if v_currency is null then raise exception 'Business workspace not found'; end if;

  select coalesce(sum(s.total), 0)::numeric(16,2) into v_sales
    from public.sales s
   where s.business_id = p_business_id
     and s.created_at >= v_month_start::timestamptz
     and s.created_at < v_next_month::timestamptz;
  select coalesce(sum(e.amount), 0)::numeric(16,2) into v_expenses
    from public.expenses e
   where e.business_id = p_business_id
     and e.expense_date >= v_month_start and e.expense_date < v_next_month;
  select count(*) into v_pending
    from public.business_approval_requests r
   where r.business_id = p_business_id and r.status = 'pending';

  return jsonb_build_object(
    'currency_code', v_currency, 'month_start', v_month_start,
    'sales_month', v_sales, 'expenses_month', v_expenses,
    'pending_requests_visible', v_pending, 'as_of', now()
  );
end;
$function$;
revoke all on function public.get_business_assistant_snapshot(uuid) from public;
revoke all on function public.get_business_assistant_snapshot(uuid) from anon;
grant execute on function public.get_business_assistant_snapshot(uuid) to authenticated;
comment on function public.get_business_assistant_snapshot(uuid) is
  'Read-only, row-level-security-respecting monthly summary for the Koroma Leone Business Assistant preview.';
