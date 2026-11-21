-- Per-business optional approvals and server-side execution gates.
-- Switches default OFF to preserve existing workspace behaviour.
create table if not exists public.business_approval_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  require_purchase_approvals boolean not null default false,
  require_expense_approvals boolean not null default false,
  require_refund_approvals boolean not null default false,
  require_stock_adjustment_approvals boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.business_approval_settings enable row level security;
drop policy if exists business_approval_settings_read on public.business_approval_settings;
create policy business_approval_settings_read on public.business_approval_settings
for select to authenticated using (public.is_business_member(business_id));
drop policy if exists business_approval_settings_update on public.business_approval_settings;
create policy business_approval_settings_update on public.business_approval_settings
for update to authenticated
using (public.has_business_role(business_id,array['owner','admin']::public.business_role[]))
with check (public.has_business_role(business_id,array['owner','admin']::public.business_role[]));
revoke all on public.business_approval_settings from anon;
revoke insert,delete on public.business_approval_settings from authenticated;
grant select,update on public.business_approval_settings to authenticated;

alter table public.business_approval_requests add column if not exists request_payload jsonb;
alter table public.business_approval_requests add column if not exists execution_result jsonb;
alter table public.business_approval_requests add column if not exists executed_at timestamptz;
create index if not exists business_approval_requests_execution_idx
on public.business_approval_requests(business_id,request_type,status,executed_at);

create or replace function public.get_business_approval_settings(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_row public.business_approval_settings%rowtype;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Active business membership required'; end if;
 insert into public.business_approval_settings(business_id) values(p_business_id) on conflict(business_id) do nothing;
 select * into v_row from public.business_approval_settings where business_id=p_business_id;
 return jsonb_build_object(
  'business_id',v_row.business_id,
  'require_purchase_approvals',v_row.require_purchase_approvals,
  'require_expense_approvals',v_row.require_expense_approvals,
  'require_refund_approvals',v_row.require_refund_approvals,
  'require_stock_adjustment_approvals',v_row.require_stock_adjustment_approvals,
  'updated_at',v_row.updated_at
 );
end;$function$;

create or replace function public.set_business_approval_settings(
 p_business_id uuid,p_require_purchase_approvals boolean,p_require_expense_approvals boolean,
 p_require_refund_approvals boolean,p_require_stock_adjustment_approvals boolean
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_row public.business_approval_settings%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.has_business_role(p_business_id,array['owner','admin']::public.business_role[]) then
  raise exception 'Only a business owner or administrator can change approval settings';
 end if;
 insert into public.business_approval_settings(
  business_id,require_purchase_approvals,require_expense_approvals,require_refund_approvals,
  require_stock_adjustment_approvals,updated_by,updated_at
 ) values(
  p_business_id,coalesce(p_require_purchase_approvals,false),coalesce(p_require_expense_approvals,false),
  coalesce(p_require_refund_approvals,false),coalesce(p_require_stock_adjustment_approvals,false),auth.uid(),now()
 )
 on conflict(business_id) do update set
  require_purchase_approvals=excluded.require_purchase_approvals,
  require_expense_approvals=excluded.require_expense_approvals,
  require_refund_approvals=excluded.require_refund_approvals,
  require_stock_adjustment_approvals=excluded.require_stock_adjustment_approvals,
  updated_by=auth.uid(),updated_at=now()
 returning * into v_row;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'business_approval_settings_updated','business_approval_settings',p_business_id::text,
  jsonb_build_object('purchase_approvals',v_row.require_purchase_approvals,
   'expense_approvals',v_row.require_expense_approvals,'refund_approvals',v_row.require_refund_approvals,
   'stock_adjustment_approvals',v_row.require_stock_adjustment_approvals));
 return jsonb_build_object(
  'business_id',v_row.business_id,'require_purchase_approvals',v_row.require_purchase_approvals,
  'require_expense_approvals',v_row.require_expense_approvals,'require_refund_approvals',v_row.require_refund_approvals,
  'require_stock_adjustment_approvals',v_row.require_stock_adjustment_approvals,'updated_at',v_row.updated_at
 );
end;$function$;

create or replace function public.create_business_operation_approval(
 p_business_id uuid,p_client_request_id uuid,p_request_type text,p_title text,p_description text,
 p_amount numeric,p_currency_code text,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid:=auth.uid(); v_settings public.business_approval_settings%rowtype;
 v_role public.business_role; v_request_id uuid; v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
 v_amount numeric(14,2):=p_amount; v_branch uuid; v_sale_exists boolean;
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 if not public.is_business_member(p_business_id) then raise exception 'Active membership in this business is required'; end if;
 if p_client_request_id is null then raise exception 'A request reference is required'; end if;
 if p_request_type not in ('purchase','expense','refund') then raise exception 'Unsupported operation approval type'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 3 and 160 then raise exception 'Enter a request title between 3 and 160 characters'; end if;
 if coalesce(pg_column_size(v_payload),0)>20000 then raise exception 'Request details are too large'; end if;
 if v_amount is not null and v_amount<0 then raise exception 'Invalid request amount'; end if;
 select role into v_role from public.business_members where business_id=p_business_id and user_id=v_user_id and is_active=true;
 select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 if not found then
  insert into public.business_approval_settings(business_id) values(p_business_id) on conflict(business_id) do nothing;
  select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 end if;

 if p_request_type='purchase' then
  if not v_settings.require_purchase_approvals then raise exception 'Purchase approvals are not enabled for this workspace'; end if;
  if v_role not in ('owner','admin','manager','storekeeper','accountant') then raise exception 'Your role cannot submit purchase requests'; end if;
  if v_payload->>'operation'='purchase' then
   v_branch:=nullif(v_payload->>'branch_id','')::uuid;
   if v_branch is null or not exists(select 1 from public.branches b where b.id=v_branch and b.business_id=p_business_id and b.is_active) then raise exception 'Choose an active receiving branch'; end if;
   if jsonb_typeof(v_payload->'items')<>'array' or jsonb_array_length(v_payload->'items')=0 then raise exception 'At least one purchase item is required'; end if;
   if coalesce(btrim(v_payload->>'client_transaction_id'),'')='' then raise exception 'Purchase reference is missing'; end if;
   if exists(select 1 from jsonb_array_elements(v_payload->'items') i where
    coalesce(btrim(i->>'product_client_record_id'),'')='' or coalesce((i->>'quantity')::numeric,0)<=0 or coalesce((i->>'unit_cost')::numeric,-1)<0) then
    raise exception 'Purchase items contain an invalid product, quantity or cost';
   end if;
   if exists(select 1 from jsonb_array_elements(v_payload->'items') i where not exists(
    select 1 from public.products p where p.business_id=p_business_id and p.client_record_id=i->>'product_client_record_id' and p.is_active
   )) then raise exception 'A purchase product is not synced or is inactive'; end if;
  elsif v_payload->>'operation'='batch_receipt' then
   v_branch:=nullif(v_payload->>'branch_id','')::uuid;
   if v_branch is null or not exists(select 1 from public.branches b where b.id=v_branch and b.business_id=p_business_id and b.is_active) then raise exception 'Choose an active receiving branch'; end if;
   if coalesce(btrim(v_payload->>'product_client_record_id'),'')='' or coalesce(btrim(v_payload->>'batch_number'),'')='' or
      coalesce((v_payload->>'quantity')::numeric,0)<=0 or coalesce((v_payload->>'unit_cost')::numeric,-1)<0 then
    raise exception 'Batch request details are incomplete';
   end if;
   if not exists(select 1 from public.products p where p.business_id=p_business_id and p.client_record_id=v_payload->>'product_client_record_id' and p.is_active) then
    raise exception 'Batch product is not synced or is inactive';
   end if;
  else raise exception 'Unsupported purchase approval operation'; end if;
 elsif p_request_type='expense' then
  if not v_settings.require_expense_approvals then raise exception 'Expense approvals are not enabled for this workspace'; end if;
  if v_role not in ('owner','admin','manager','accountant') then raise exception 'Your role cannot submit expense requests'; end if;
  if v_payload->>'operation' not in ('expense','cashbook_expense') then raise exception 'Unsupported expense approval operation'; end if;
  if coalesce((v_payload->>'amount')::numeric,0)<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  if coalesce(btrim(v_payload->>'description'),'')='' or coalesce(btrim(v_payload->>'category'),'')='' then raise exception 'Expense category and description are required'; end if;
  if v_payload->>'operation'='expense' and coalesce(btrim(v_payload->>'client_record_id'),'')='' then raise exception 'Expense reference is missing'; end if;
 elsif p_request_type='refund' then
  if not v_settings.require_refund_approvals then raise exception 'Refund approvals are not enabled for this workspace'; end if;
  if v_role not in ('owner','admin','manager','cashier') then raise exception 'Your role cannot submit refund requests'; end if;
  v_branch:=nullif(v_payload->>'branch_id','')::uuid;
  if v_branch is null or coalesce(btrim(v_payload->>'sale_client_transaction_id'),'')='' or
   coalesce(btrim(v_payload->>'client_return_id'),'')='' or coalesce(btrim(v_payload->>'reason'),'')='' or
   jsonb_typeof(v_payload->'items')<>'array' or jsonb_array_length(v_payload->'items')=0 then
   raise exception 'Refund request details are incomplete';
  end if;
  select exists(select 1 from public.offline_sales s where s.business_id=p_business_id and s.branch_id=v_branch
   and s.client_transaction_id=v_payload->>'sale_client_transaction_id') into v_sale_exists;
  if not v_sale_exists then raise exception 'The original sale must be synced to this branch before requesting a refund'; end if;
 end if;

 insert into public.business_approval_requests(
  business_id,client_request_id,request_type,title,description,amount,currency_code,requested_by,request_payload
 ) values(
  p_business_id,p_client_request_id,p_request_type,btrim(p_title),left(coalesce(p_description,''),2000),v_amount,
  coalesce(nullif(upper(p_currency_code),''),'SLE'),v_user_id,v_payload
 ) on conflict(business_id,client_request_id) do nothing returning id into v_request_id;
 if v_request_id is null then
  select id into v_request_id from public.business_approval_requests
   where business_id=p_business_id and client_request_id=p_client_request_id and requested_by=v_user_id;
  if v_request_id is null then raise exception 'Request reference already exists'; end if;
 end if;
 return jsonb_build_object('request_id',v_request_id,'status','pending');
end;$function$;

create or replace function public.execute_business_operation_approval(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v public.business_approval_requests%rowtype; v_payload jsonb; v_operation text; v_branch uuid; v_product uuid;
 v_total numeric(16,2); v_item jsonb; v_qty numeric(18,3); v_cost numeric(18,6); v_line numeric(18,2);
 v_before_qty numeric(18,3); v_before_value numeric(18,2); v_default_cost numeric(18,6);
 v_purchase_id uuid; v_expense_id uuid; v_cashbook_id uuid; v_return_result jsonb; v_batch_id uuid;
begin
 select * into v from public.business_approval_requests where id=p_request_id for update;
 if not found or v.status<>'approved' or v.request_payload is null then
  return jsonb_build_object('executed',false,'reason','No executable approved operation');
 end if;
 if v.executed_at is not null then return coalesce(v.execution_result,jsonb_build_object('executed',true,'already_executed',true)); end if;
 v_payload:=v.request_payload;v_operation:=v_payload->>'operation';

 if v.request_type='purchase' and v_operation='purchase' then
  v_branch:=nullif(v_payload->>'branch_id','')::uuid;v_total:=0;
  for v_item in select value from jsonb_array_elements(v_payload->'items') loop
   select id into v_product from public.products where business_id=v.business_id and client_record_id=v_item->>'product_client_record_id' and is_active for update;
   if v_product is null then raise exception 'A purchase product is no longer available'; end if;
   v_qty:=nullif(v_item->>'quantity','')::numeric;v_cost:=nullif(v_item->>'unit_cost','')::numeric;
   if v_qty is null or v_qty<=0 or v_cost is null or v_cost<0 then raise exception 'Invalid purchase item values'; end if;
   v_total:=v_total+round(v_qty*v_cost,2);
  end loop;
  if v_total<=0 then raise exception 'Purchase total must be greater than zero'; end if;
  insert into public.offline_purchases(business_id,client_transaction_id,transaction_date,supplier_name,total,branch_id)
  values(v.business_id,v_payload->>'client_transaction_id',coalesce(nullif(v_payload->>'transaction_date','')::date,current_date),
   nullif(v_payload->>'supplier_name',''),v_total,v_branch) returning id into v_purchase_id;
  for v_item in select value from jsonb_array_elements(v_payload->'items') loop
   select id into v_product from public.products where business_id=v.business_id and client_record_id=v_item->>'product_client_record_id' and is_active;
   v_qty:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unit_cost')::numeric;v_line:=round(v_qty*v_cost,2);
   insert into public.offline_purchase_items(business_id,purchase_id,product_id,product_name,quantity,unit_cost,line_total)
   values(v.business_id,v_purchase_id,v_product,coalesce(nullif(v_item->>'product_name',''),(select name from public.products where id=v_product)),v_qty,v_cost,v_line);
   select quantity_on_hand,inventory_value into v_before_qty,v_before_value from public.inventory_cost_balances
    where business_id=v.business_id and branch_id=v_branch and product_id=v_product for update;
   if not found then
    select greatest(coalesce(bi.quantity_on_hand,0),0),greatest(coalesce(p.cost_price,0),0)
     into v_before_qty,v_default_cost from public.products p
     left join public.branch_inventory bi on bi.business_id=p.business_id and bi.branch_id=v_branch and bi.product_id=p.id
     where p.id=v_product and p.business_id=v.business_id;
    v_before_value:=round(v_before_qty*v_default_cost,2);
    insert into public.inventory_cost_balances(business_id,branch_id,product_id,quantity_on_hand,inventory_value,average_unit_cost)
    values(v.business_id,v_branch,v_product,v_before_qty,v_before_value,case when v_before_qty>0 then v_before_value/v_before_qty else null end)
    on conflict(business_id,branch_id,product_id) do nothing;
    select quantity_on_hand,inventory_value into v_before_qty,v_before_value from public.inventory_cost_balances
     where business_id=v.business_id and branch_id=v_branch and product_id=v_product for update;
   end if;
   insert into public.branch_inventory(business_id,branch_id,product_id,quantity_on_hand)
   values(v.business_id,v_branch,v_product,v_qty)
   on conflict(branch_id,product_id) do update set quantity_on_hand=public.branch_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
   update public.inventory_cost_balances set quantity_on_hand=quantity_on_hand+v_qty,inventory_value=inventory_value+v_line,
    average_unit_cost=case when quantity_on_hand+v_qty>0 then (inventory_value+v_line)/(quantity_on_hand+v_qty) else null end,updated_at=now()
   where business_id=v.business_id and branch_id=v_branch and product_id=v_product;
   insert into public.inventory_cost_movements(business_id,branch_id,product_id,movement_type,source_type,source_id,quantity_in,unit_cost,total_cost)
   values(v.business_id,v_branch,v_product,'purchase','offline_purchases',v_purchase_id::text,v_qty,v_cost,v_line);
  end loop;
  insert into public.offline_sync_receipts(business_id,event_id,record_type,record_count)
  values(v.business_id,'approval-purchase:'||v.id::text,'purchases',jsonb_array_length(v_payload->'items'))
  on conflict(business_id,event_id) do nothing;
  update public.business_approval_requests set execution_result=jsonb_build_object('purchase_id',v_purchase_id,'client_transaction_id',v_payload->>'client_transaction_id') where id=v.id;

 elsif v.request_type='expense' and v_operation='expense' then
  insert into public.expenses(business_id,branch_id,client_record_id,category,description,amount,payment_method,expense_date,created_by)
  values(v.business_id,nullif(v_payload->>'branch_id','')::uuid,v_payload->>'client_record_id',
   coalesce(nullif(v_payload->>'category',''),'General'),coalesce(nullif(v_payload->>'description',''),'Expense'),
   (v_payload->>'amount')::numeric,coalesce(nullif(v_payload->>'payment_method',''),'cash'),
   coalesce(nullif(v_payload->>'expense_date','')::date,current_date),v.requested_by)
  on conflict(business_id,client_record_id) where client_record_id is not null do nothing returning id into v_expense_id;
  if v_expense_id is null then select id into v_expense_id from public.expenses where business_id=v.business_id and client_record_id=v_payload->>'client_record_id'; end if;
  update public.business_approval_requests set execution_result=jsonb_build_object('expense_id',v_expense_id) where id=v.id;

 elsif v.request_type='expense' and v_operation='cashbook_expense' then
  insert into public.cashbook_entries(business_id,branch_id,entry_type,category,description,amount,payment_method,entry_date,reference,created_by)
  values(v.business_id,nullif(v_payload->>'branch_id','')::uuid,'expense',
   coalesce(nullif(v_payload->>'category',''),'Expense'),coalesce(nullif(v_payload->>'description',''),'Expense'),
   (v_payload->>'amount')::numeric,coalesce(nullif(v_payload->>'payment_method',''),'cash'),
   coalesce(nullif(v_payload->>'entry_date','')::date,current_date),v_payload->>'client_record_id',v.requested_by)
  returning id into v_cashbook_id;
  update public.business_approval_requests set execution_result=jsonb_build_object('cashbook_entry_id',v_cashbook_id) where id=v.id;

 elsif v.request_type='refund' and v_operation='refund' then
  v_return_result:=public.sync_sale_return(v.business_id,(v_payload->>'branch_id')::uuid,
   v_payload->>'client_return_id',v_payload->>'sale_client_transaction_id',v_payload->>'reason',
   coalesce(v_payload->>'refund_method','cash'),v_payload->'items');
  update public.business_approval_requests set execution_result=v_return_result where id=v.id;

 elsif v.request_type='purchase' and v_operation='batch_receipt' then
  v_branch:=(v_payload->>'branch_id')::uuid;
  select id into v_product from public.products where business_id=v.business_id and client_record_id=v_payload->>'product_client_record_id' and is_active;
  if v_product is null then raise exception 'The batch product is no longer available'; end if;
  v_qty:=(v_payload->>'quantity')::numeric;v_cost:=(v_payload->>'unit_cost')::numeric;
  if v_qty<=0 or v_cost<0 then raise exception 'Invalid batch quantity or cost'; end if;
  insert into public.product_batches(business_id,branch_id,product_id,batch_number,expiry_date,quantity_on_hand,unit_cost)
  values(v.business_id,v_branch,v_product,btrim(v_payload->>'batch_number'),nullif(v_payload->>'expiry_date','')::date,v_qty,v_cost)
  on conflict(branch_id,product_id,batch_number) do update set expiry_date=excluded.expiry_date,
   quantity_on_hand=public.product_batches.quantity_on_hand+excluded.quantity_on_hand,unit_cost=excluded.unit_cost,updated_at=now()
  returning id into v_batch_id;
  insert into public.branch_inventory(business_id,branch_id,product_id,quantity_on_hand)
  values(v.business_id,v_branch,v_product,v_qty)
  on conflict(branch_id,product_id) do update set quantity_on_hand=public.branch_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(v.business_id,auth.uid(),'approved_product_batch_received','product_batches',v_batch_id::text,
   jsonb_build_object('branch_id',v_branch,'product_id',v_product,'batch_number',v_payload->>'batch_number','quantity',v_qty));
  update public.business_approval_requests set execution_result=jsonb_build_object('batch_id',v_batch_id) where id=v.id;
 else raise exception 'No secure execution handler exists for this approval request';
 end if;

 update public.business_approval_requests set executed_at=now() where id=v.id;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v.business_id,auth.uid(),'approval_operation_executed','business_approval_requests',v.id::text,
  coalesce((select execution_result from public.business_approval_requests where id=v.id),'{}'::jsonb));
 return coalesce((select execution_result from public.business_approval_requests where id=v.id),jsonb_build_object('executed',true));
end;$function$;

create or replace function public.review_business_approval_request(
 p_request_id uuid,p_decision text,p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_user_id uuid:=auth.uid();v_request public.business_approval_requests%rowtype;
 v_decision text:=lower(btrim(coalesce(p_decision,'')));v_note text:=nullif(left(btrim(coalesce(p_review_note,'')),1000),'');v_result jsonb;
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 if v_decision not in ('approved','rejected','cancelled') then raise exception 'Unsupported approval decision'; end if;
 select * into v_request from public.business_approval_requests where id=p_request_id for update;
 if not found then raise exception 'Approval request was not found or is not available to this workspace'; end if;
 if not public.is_business_member(v_request.business_id) then raise exception 'You no longer have access to this business workspace'; end if;
 if v_request.status<>'pending' then raise exception 'This request has already been reviewed'; end if;
 if v_decision='cancelled' then
  if v_request.requested_by<>v_user_id then raise exception 'Only the person who submitted this request can cancel it'; end if;
 else
  if v_request.requested_by=v_user_id then raise exception 'You cannot approve or reject your own request'; end if;
  if v_request.request_type='payroll' then
   if not public.has_business_role(v_request.business_id,array['owner','admin']::public.business_role[]) then raise exception 'Payroll approvals are restricted to business owners and administrators'; end if;
  else
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager','accountant']::public.business_role[]) then raise exception 'You do not have permission to review this request'; end if;
  end if;
 end if;
 update public.business_approval_requests set status=v_decision,reviewed_by=v_user_id,review_note=v_note,reviewed_at=now(),updated_at=now()
  where id=v_request.id;
 if v_decision='approved' and v_request.request_payload is not null then v_result:=public.execute_business_operation_approval(v_request.id); end if;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_request.business_id,v_user_id,'approval_request_'||v_decision,'business_approval_requests',v_request.id::text,
  jsonb_build_object('request_type',v_request.request_type,'title',v_request.title,'amount',v_request.amount,
   'currency_code',v_request.currency_code,'previous_status',v_request.status,'new_status',v_decision,'executed',v_result));
 return jsonb_build_object('success',true,'request_id',v_request.id,'status',v_decision,'execution',v_result);
end;$function$;

create or replace function public.approval_gate_expense_write()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 select coalesce(s.require_expense_approvals,false) into v_required from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 if tg_op='UPDATE' and new.category is not distinct from old.category and new.description is not distinct from old.description
  and new.amount is not distinct from old.amount and new.payment_method is not distinct from old.payment_method
  and new.expense_date is not distinct from old.expense_date and new.branch_id is not distinct from old.branch_id then return new; end if;
 if exists(select 1 from public.expenses e where e.business_id=new.business_id and e.client_record_id=new.client_record_id) then
  if tg_op='INSERT' then return new; end if;
 end if;
 if not exists(select 1 from public.business_approval_requests r where r.business_id=new.business_id and r.request_type='expense'
  and r.status='approved' and r.executed_at is null and r.request_payload->>'operation'='expense'
  and r.request_payload->>'client_record_id'=new.client_record_id) then
  raise exception 'This expense requires approval before it can be recorded';
 end if;
 return new;
end;$function$;

create or replace function public.approval_gate_offline_purchase_write()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 select coalesce(s.require_purchase_approvals,false) into v_required from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 if exists(select 1 from public.offline_purchases p where p.business_id=new.business_id and p.client_transaction_id=new.client_transaction_id) then return new; end if;
 if not exists(select 1 from public.business_approval_requests r where r.business_id=new.business_id and r.request_type='purchase'
  and r.status='approved' and r.executed_at is null and r.request_payload->>'operation'='purchase'
  and r.request_payload->>'client_transaction_id'=new.client_transaction_id) then
  raise exception 'This purchase requires approval before stock can be received';
 end if;
 return new;
end;$function$;

create or replace function public.approval_gate_refund_write()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 select coalesce(s.require_refund_approvals,false) into v_required from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 if exists(select 1 from public.offline_sale_returns r where r.business_id=new.business_id and r.client_return_id=new.client_return_id) then return new; end if;
 if not exists(select 1 from public.business_approval_requests r where r.business_id=new.business_id and r.request_type='refund'
  and r.status='approved' and r.executed_at is null and r.request_payload->>'operation'='refund'
  and r.request_payload->>'client_return_id'=new.client_return_id) then
  raise exception 'This refund requires approval before it can be processed';
 end if;
 return new;
end;$function$;

create or replace function public.approval_gate_batch_write()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 select coalesce(s.require_purchase_approvals,false) into v_required from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 if exists(select 1 from public.product_batches b where b.business_id=new.business_id and b.branch_id=new.branch_id
  and b.product_id=new.product_id and b.batch_number=new.batch_number) then return new; end if;
 if not exists(select 1 from public.business_approval_requests r where r.business_id=new.business_id and r.request_type='purchase'
  and r.status='approved' and r.executed_at is null and r.request_payload->>'operation'='batch_receipt'
  and r.request_payload->>'branch_id'=new.branch_id::text and r.request_payload->>'batch_number'=new.batch_number) then
  raise exception 'This batch receipt requires purchase approval';
 end if;
 return new;
end;$function$;

create or replace function public.approval_gate_cashbook_expense()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 if lower(coalesce(new.entry_type,''))<>'expense' then return new; end if;
 select coalesce(s.require_expense_approvals,false) into v_required from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 if exists(select 1 from public.cashbook_entries c where c.business_id=new.business_id and c.reference=new.reference and new.reference is not null) then return new; end if;
 if not exists(select 1 from public.business_approval_requests r where r.business_id=new.business_id and r.request_type='expense'
  and r.status='approved' and r.executed_at is null and r.request_payload->>'operation'='cashbook_expense'
  and r.request_payload->>'client_record_id'=new.reference) then
  raise exception 'This cashbook expense requires approval before it can be recorded';
 end if;
 return new;
end;$function$;

create or replace function public.approval_gate_canonical_purchase()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 select coalesce(s.require_purchase_approvals,false) into v_required from public.business_approval_settings s where s.business_id=new.business_id;
 if coalesce(v_required,false) then raise exception 'Purchases require an approved request. Use the Automation Centre purchase workflow.'; end if;
 return new;
end;$function$;

revoke all on function public.get_business_approval_settings(uuid) from public;
revoke all on function public.get_business_approval_settings(uuid) from anon;
grant execute on function public.get_business_approval_settings(uuid) to authenticated;
revoke all on function public.set_business_approval_settings(uuid,boolean,boolean,boolean,boolean) from public;
revoke all on function public.set_business_approval_settings(uuid,boolean,boolean,boolean,boolean) from anon;
grant execute on function public.set_business_approval_settings(uuid,boolean,boolean,boolean,boolean) to authenticated;
revoke all on function public.create_business_operation_approval(uuid,uuid,text,text,text,numeric,text,jsonb) from public;
revoke all on function public.create_business_operation_approval(uuid,uuid,text,text,text,numeric,text,jsonb) from anon;
grant execute on function public.create_business_operation_approval(uuid,uuid,text,text,text,numeric,text,jsonb) to authenticated;
revoke all on function public.execute_business_operation_approval(uuid) from public;
revoke all on function public.execute_business_operation_approval(uuid) from anon;
revoke all on function public.execute_business_operation_approval(uuid) from authenticated;
revoke all on function public.review_business_approval_request(uuid,text,text) from public;
revoke all on function public.review_business_approval_request(uuid,text,text) from anon;
grant execute on function public.review_business_approval_request(uuid,text,text) to authenticated;

drop trigger if exists approval_gate_expense_write on public.expenses;
create trigger approval_gate_expense_write before insert or update on public.expenses
for each row execute function public.approval_gate_expense_write();
drop trigger if exists approval_gate_offline_purchase_write on public.offline_purchases;
create trigger approval_gate_offline_purchase_write before insert on public.offline_purchases
for each row execute function public.approval_gate_offline_purchase_write();
drop trigger if exists approval_gate_refund_write on public.offline_sale_returns;
create trigger approval_gate_refund_write before insert on public.offline_sale_returns
for each row execute function public.approval_gate_refund_write();
drop trigger if exists approval_gate_batch_write on public.product_batches;
create trigger approval_gate_batch_write before insert on public.product_batches
for each row execute function public.approval_gate_batch_write();
drop trigger if exists approval_gate_cashbook_expense on public.cashbook_entries;
create trigger approval_gate_cashbook_expense before insert on public.cashbook_entries
for each row execute function public.approval_gate_cashbook_expense();
drop trigger if exists approval_gate_canonical_purchase on public.purchases;
create trigger approval_gate_canonical_purchase before insert on public.purchases
for each row execute function public.approval_gate_canonical_purchase();

-- Stock adjustments already use request_stock_adjustment + decide_stock_adjustment.
-- Prevent an approver from approving their own stock adjustment.
create or replace function public.decide_stock_adjustment(
 p_adjustment_id uuid,p_approve boolean,p_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v public.stock_adjustments%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v from public.stock_adjustments where id=p_adjustment_id for update;
 if not found then raise exception 'Adjustment request not found'; end if;
 if not public.has_business_role(v.business_id,array['owner','admin','manager']::public.business_role[]) then raise exception 'Only owner, admin or manager can decide adjustments'; end if;
 if v.status<>'pending' then raise exception 'Only pending adjustments can be decided'; end if;
 if p_approve and v.requested_by=auth.uid() then raise exception 'You cannot approve your own stock adjustment'; end if;
 if p_approve then
  if v.adjustment_type='increase' then
   insert into public.branch_inventory(business_id,branch_id,product_id,quantity_on_hand)
   values(v.business_id,v.branch_id,v.product_id,v.quantity)
   on conflict(branch_id,product_id) do update set quantity_on_hand=public.branch_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
  else
   update public.branch_inventory set quantity_on_hand=quantity_on_hand-v.quantity,updated_at=now()
   where business_id=v.business_id and branch_id=v.branch_id and product_id=v.product_id and quantity_on_hand>=v.quantity;
   if not found then raise exception 'Insufficient stock for this adjustment'; end if;
   perform public.consume_product_batches(v.business_id,v.branch_id,v.product_id,v.quantity);
  end if;
 end if;
 update public.stock_adjustments set status=case when p_approve then 'approved' else 'rejected' end,
  approved_by=auth.uid(),decision_note=nullif(trim(coalesce(p_note,'')),''),decided_at=now() where id=p_adjustment_id;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v.business_id,auth.uid(),case when p_approve then 'stock_adjustment_approved' else 'stock_adjustment_rejected' end,
  'stock_adjustments',p_adjustment_id::text,jsonb_build_object('note',p_note,'quantity',v.quantity,'type',v.adjustment_type));
 return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'adjustment_id',p_adjustment_id);
end;$function$;
revoke all on function public.decide_stock_adjustment(uuid,boolean,text) from public;
revoke all on function public.decide_stock_adjustment(uuid,boolean,text) from anon;
grant execute on function public.decide_stock_adjustment(uuid,boolean,text) to authenticated;
