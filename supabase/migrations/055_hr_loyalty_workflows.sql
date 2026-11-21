-- HR/Payroll UI support already uses the employees, payroll_runs and payroll_items tables.
-- Add a transactional, RLS-respecting RPC for customer loyalty point changes.
create or replace function public.apply_customer_loyalty_points(
  p_business_id uuid,
  p_customer_id uuid,
  p_points_delta bigint,
  p_entry_type text,
  p_note text default null,
  p_source_reference text default null
)
returns public.customer_loyalty_accounts
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account public.customer_loyalty_accounts;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_points_delta = 0 then raise exception 'Points change must not be zero'; end if;
  if p_entry_type not in ('earned','redeemed','adjustment','expired') then raise exception 'Invalid loyalty entry type'; end if;
  if p_entry_type = 'earned' and p_points_delta < 0 then raise exception 'Earned points must be positive'; end if;
  if p_entry_type in ('redeemed','expired') and p_points_delta > 0 then raise exception 'Redeemed or expired points must be negative'; end if;

  insert into public.customer_loyalty_accounts (business_id, customer_id)
  values (p_business_id, p_customer_id)
  on conflict (business_id, customer_id) do nothing;

  update public.customer_loyalty_accounts
  set points_balance = points_balance + p_points_delta,
      lifetime_points = lifetime_points + case when p_entry_type = 'earned' then p_points_delta else 0 end,
      tier = case
        when points_balance + p_points_delta >= 1000 then 'gold'
        when points_balance + p_points_delta >= 500 then 'silver'
        when points_balance + p_points_delta >= 100 then 'bronze'
        else 'standard'
      end,
      updated_at = now()
  where business_id = p_business_id
    and customer_id = p_customer_id
    and points_balance + p_points_delta >= 0
  returning * into v_account;

  if not found then raise exception 'Customer loyalty account not found or insufficient points'; end if;

  insert into public.customer_loyalty_ledger
    (business_id, customer_id, points_delta, entry_type, source_reference, note, created_by)
  values
    (p_business_id, p_customer_id, p_points_delta, p_entry_type, p_source_reference, p_note, auth.uid());

  return v_account;
end;
$$;

revoke all on function public.apply_customer_loyalty_points(uuid,uuid,bigint,text,text,text) from public;
grant execute on function public.apply_customer_loyalty_points(uuid,uuid,bigint,text,text,text) to authenticated;
