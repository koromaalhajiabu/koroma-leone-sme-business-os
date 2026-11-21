begin;

-- Keep sales header arithmetic internally consistent, even if a client
-- attempts direct table writes instead of using post_sale().
alter table public.sales
  add constraint sales_discount_not_exceed_subtotal
    check (discount <= subtotal),
  add constraint sales_amount_paid_not_exceed_total
    check (amount_paid <= total),
  add constraint sales_total_matches_subtotal_discount
    check (total = greatest(subtotal - discount, 0));

-- Keep persisted item totals consistent with their quantities and prices.
alter table public.sale_items
  add constraint sale_items_line_total_matches_quantity_price
    check (line_total = round(quantity * unit_price, 2));

alter table public.purchases
  add constraint purchases_amount_paid_not_exceed_total
    check (amount_paid <= total);

alter table public.purchase_items
  add constraint purchase_items_line_total_matches_quantity_cost
    check (line_total = round(quantity * unit_cost, 2));

-- Internal posting helpers must not be callable through the public API.
-- SECURITY DEFINER business workflows invoke them as their function owner.
revoke all on function public.post_system_journal(uuid,date,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.seed_default_chart_of_accounts(uuid)
  from public, anon, authenticated;

-- These RPCs already enforce auth.uid() and business-role checks.
-- Remove the unnecessary anonymous grants while preserving signed-in use.
revoke all on function public.accounting_cash_flow(uuid,date,date) from public, anon;
grant execute on function public.accounting_cash_flow(uuid,date,date) to authenticated;

revoke all on function public.backfill_accounting_history(uuid) from public, anon;
grant execute on function public.backfill_accounting_history(uuid) to authenticated;

revoke all on function public.initialize_accounting(uuid) from public, anon;
grant execute on function public.initialize_accounting(uuid) to authenticated;

revoke all on function public.post_accounting_opening_balances(uuid,date,jsonb) from public, anon;
grant execute on function public.post_accounting_opening_balances(uuid,date,jsonb) to authenticated;

revoke all on function public.post_general_journal(uuid,date,text,jsonb) from public, anon;
grant execute on function public.post_general_journal(uuid,date,text,jsonb) to authenticated;

revoke all on function public.close_accounting_period(uuid,date,date) from public, anon;
grant execute on function public.close_accounting_period(uuid,date,date) to authenticated;

revoke all on function public.reverse_accounting_journal(uuid,uuid,date,text) from public, anon;
grant execute on function public.reverse_accounting_journal(uuid,uuid,date,text) to authenticated;

-- Enforce the discount ceiling inside the canonical POS transaction too.
create or replace function public.post_sale(
  p_business_id uuid,
  p_branch_id uuid,
  p_reference text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_amount_paid numeric default 0,
  p_payment_method text default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_sale_id uuid := gen_random_uuid();
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric(18,3);
  v_price numeric(18,2);
  v_cost numeric(18,2);
  v_stock numeric(18,3);
  v_subtotal numeric(18,2) := 0;
  v_total numeric(18,2);
  v_line numeric(18,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_business_role(p_business_id, array['owner','admin','manager','cashier']::public.business_role[]) then
    raise exception 'Not authorised to record sales';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;
  if trim(coalesce(p_reference,'')) = '' then raise exception 'Sale reference is required'; end if;
  if p_discount is null or p_amount_paid is null or p_discount < 0 or p_amount_paid < 0 then
    raise exception 'Invalid discount or payment';
  end if;

  perform 1 from public.branches where id=p_branch_id and business_id=p_business_id and is_active=true;
  if not found then raise exception 'Invalid branch'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Sale quantity must be positive'; end if;
    select selling_price, cost_price into v_price, v_cost
      from public.products where id=v_product_id and business_id=p_business_id and is_active=true;
    if not found then raise exception 'Product not found or inactive'; end if;
    select quantity_on_hand into v_stock from public.branch_inventory
      where branch_id=p_branch_id and product_id=v_product_id and business_id=p_business_id
      for update;
    if not found or v_stock < v_qty then raise exception 'Insufficient stock for product %', v_product_id; end if;
    v_line := round(v_qty * coalesce((v_item->>'unit_price')::numeric, v_price),2);
    if v_line < 0 then raise exception 'Invalid line amount'; end if;
    v_subtotal := v_subtotal + v_line;
  end loop;

  if p_discount > v_subtotal then
    raise exception 'Discount cannot exceed the sale subtotal';
  end if;

  v_total := round(v_subtotal - p_discount, 2);
  if p_amount_paid > v_total then raise exception 'Payment cannot exceed sale total'; end if;

  insert into public.sales(id,business_id,branch_id,customer_id,reference,subtotal,discount,total,amount_paid,payment_method)
  values(v_sale_id,p_business_id,p_branch_id,p_customer_id,trim(p_reference),v_subtotal,p_discount,v_total,p_amount_paid,coalesce(p_payment_method,'cash'));

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    select selling_price,cost_price into v_price,v_cost from public.products
      where id=v_product_id and business_id=p_business_id;
    v_price := coalesce((v_item->>'unit_price')::numeric,v_price);
    v_line := round(v_qty*v_price,2);
    insert into public.sale_items(business_id,sale_id,product_id,quantity,unit_price,unit_cost,line_total)
      values(p_business_id,v_sale_id,v_product_id,v_qty,v_price,v_cost,v_line);
    update public.branch_inventory set quantity_on_hand=quantity_on_hand-v_qty,updated_at=now()
      where branch_id=p_branch_id and product_id=v_product_id and business_id=p_business_id;
    insert into public.inventory_movements(business_id,branch_id,product_id,movement_type,quantity_delta,reference_table,reference_id)
      values(p_business_id,p_branch_id,v_product_id,'sale',-v_qty,'sales',v_sale_id);
  end loop;

  insert into public.audit_logs(business_id,action,entity_table,entity_id,details)
    values(p_business_id,'sale_posted','sales',v_sale_id::text,jsonb_build_object('reference',p_reference,'total',v_total));
  return v_sale_id;
end;
$function$;

commit;
