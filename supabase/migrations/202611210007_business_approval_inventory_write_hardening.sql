-- Approval execution hardening, direct stock-write lock-down and refund amount validation.
revoke insert,update,delete,truncate on public.branch_inventory from authenticated;
drop policy if exists branch_inventory_manage on public.branch_inventory;
revoke insert,update,delete,truncate on public.offline_purchases from authenticated;
revoke update,delete,truncate on public.expenses from authenticated;
revoke insert,update,delete,truncate on public.product_batches from authenticated;
revoke insert,update,delete,truncate on public.offline_sale_returns from authenticated;
revoke insert,update,delete,truncate on public.offline_sale_return_items from authenticated;

create or replace function public.sync_local_records(p_business_id uuid,p_event_id text,p_record_type text,p_records jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 r jsonb;v_branch uuid;v_role public.business_role;v_count integer:=0;v_key text;
 v_existing_product uuid;v_existing_stock numeric(18,3);v_requested_stock numeric(18,3);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select bm.role into v_role from public.business_members bm
 where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true;
 if not found or v_role is null then raise exception 'Active business membership required'; end if;
 if not public.has_business_role(p_business_id,array['owner','admin','manager','cashier','storekeeper','accountant']::public.business_role[]) then
  raise exception 'Active business membership and platform access required';
 end if;
 if v_role not in ('owner','admin','manager','cashier','storekeeper','accountant') then raise exception 'Not authorised to synchronise records'; end if;
 if v_role='cashier' and p_record_type not in ('customers') then raise exception 'Cashiers may synchronise customer records only'; end if;
 if v_role='storekeeper' and p_record_type not in ('products','suppliers') then raise exception 'Storekeepers may synchronise products and suppliers only'; end if;
 if v_role='accountant' and p_record_type not in ('expenses') then raise exception 'Accountants may synchronise expense records only'; end if;
 if coalesce(trim(p_event_id),'')='' then raise exception 'Sync event ID is required'; end if;
 if p_record_type not in ('products','customers','suppliers','expenses') then raise exception 'Unsupported sync record type'; end if;
 if jsonb_typeof(p_records)<>'array' then raise exception 'Records must be a JSON array'; end if;
 if exists(select 1 from public.offline_sync_receipts x where x.business_id=p_business_id and x.event_id=p_event_id) then
  return jsonb_build_object('status','already_synced','processed',0);
 end if;
 for r in select value from jsonb_array_elements(p_records) loop
  v_key:=nullif(r->>'client_record_id','');
  if v_key is null then raise exception 'Every record needs a stable client_record_id'; end if;
  if p_record_type='products' then
   v_branch:=nullif(r->>'branch_id','')::uuid;
   if v_branch is null or not exists(select 1 from public.branches b where b.id=v_branch and b.business_id=p_business_id and b.is_active=true) then
    raise exception 'Choose an active branch for product opening stock';
   end if;
   if v_role in ('cashier','storekeeper') and not exists(select 1 from public.branch_members bm
    where bm.business_id=p_business_id and bm.branch_id=v_branch and bm.user_id=auth.uid() and bm.is_active=true) then
    raise exception 'You are not assigned to the selected branch';
   end if;
   v_requested_stock:=greatest(coalesce((r->>'quantity_on_hand')::numeric,0),0);
   select id into v_existing_product from public.products
    where business_id=p_business_id and client_record_id=v_key for update;
   if v_existing_product is not null then
    select quantity_on_hand into v_existing_stock from public.branch_inventory
    where business_id=p_business_id and branch_id=v_branch and product_id=v_existing_product for update;
    if not found then v_existing_stock:=0; end if;
    if v_requested_stock is distinct from coalesce(v_existing_stock,0) then
     raise exception 'Stock for an existing product cannot be changed by product sync. Submit a stock adjustment request for approval.';
    end if;
   end if;
   insert into public.products(
    business_id,client_record_id,sku,name,category,unit,cost_price,selling_price,reorder_level,is_active
   ) values(
    p_business_id,v_key,nullif(r->>'sku',''),coalesce(nullif(r->>'name',''),'Unnamed product'),
    nullif(r->>'category',''),coalesce(nullif(r->>'unit',''),'unit'),
    greatest(coalesce((r->>'cost_price')::numeric,0),0),greatest(coalesce((r->>'selling_price')::numeric,0),0),
    greatest(coalesce((r->>'reorder_level')::numeric,0),0),true
   )
   on conflict(business_id,client_record_id) where client_record_id is not null
   do update set sku=excluded.sku,name=excluded.name,category=excluded.category,unit=excluded.unit,
    cost_price=excluded.cost_price,selling_price=excluded.selling_price,reorder_level=excluded.reorder_level,updated_at=now();
   insert into public.branch_inventory(business_id,branch_id,product_id,quantity_on_hand)
   select p_business_id,v_branch,p.id,v_requested_stock from public.products p
   where p.business_id=p_business_id and p.client_record_id=v_key
   on conflict(branch_id,product_id) do update set quantity_on_hand=excluded.quantity_on_hand,updated_at=now();
  elsif p_record_type='customers' then
   insert into public.customers(business_id,client_record_id,name,phone,email,address,notes)
   values(p_business_id,v_key,coalesce(nullif(r->>'name',''),'Unnamed customer'),nullif(r->>'phone',''),
    nullif(r->>'email',''),nullif(r->>'address',''),nullif(r->>'notes',''))
   on conflict(business_id,client_record_id) where client_record_id is not null
   do update set name=excluded.name,phone=excluded.phone,email=excluded.email,address=excluded.address,notes=excluded.notes,updated_at=now();
  elsif p_record_type='suppliers' then
   insert into public.suppliers(business_id,client_record_id,name,phone,email,address,notes)
   values(p_business_id,v_key,coalesce(nullif(r->>'name',''),'Unnamed supplier'),nullif(r->>'phone',''),
    nullif(r->>'email',''),nullif(r->>'address',''),nullif(r->>'notes',''))
   on conflict(business_id,client_record_id) where client_record_id is not null
   do update set name=excluded.name,phone=excluded.phone,email=excluded.email,address=excluded.address,notes=excluded.notes,updated_at=now();
  elsif p_record_type='expenses' then
   insert into public.expenses(business_id,client_record_id,category,description,amount,payment_method,expense_date)
   values(p_business_id,v_key,coalesce(nullif(r->>'category',''),'General'),coalesce(nullif(r->>'description',''),'Expense'),
    greatest(coalesce((r->>'amount')::numeric,0.01),0.01),coalesce(nullif(r->>'payment_method',''),'cash'),
    coalesce(nullif(r->>'expense_date','')::date,current_date))
   on conflict(business_id,client_record_id) where client_record_id is not null
   do update set category=excluded.category,description=excluded.description,amount=excluded.amount,
    payment_method=excluded.payment_method,expense_date=excluded.expense_date;
  end if;
  v_count:=v_count+1;
 end loop;
 insert into public.offline_sync_receipts(business_id,event_id,record_type,record_count)
 values(p_business_id,p_event_id,p_record_type,v_count);
 return jsonb_build_object('status','synced','processed',v_count);
end;$function$;
revoke all on function public.sync_local_records(uuid,text,text,jsonb) from public;
revoke all on function public.sync_local_records(uuid,text,text,jsonb) from anon;
grant execute on function public.sync_local_records(uuid,text,text,jsonb) to authenticated;

create or replace function public.create_business_operation_approval(
 p_business_id uuid,p_client_request_id uuid,p_request_type text,p_title text,p_description text,
 p_amount numeric,p_currency_code text,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_role public.business_role;v_settings public.business_approval_settings%rowtype;
 v_request_id uuid;v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);v_branch uuid;
 v_expected numeric(16,2):=0;v_item jsonb;v_sale public.offline_sales%rowtype;
 v_product uuid;v_sold numeric(18,3);v_returned numeric(18,3);v_qty numeric(18,3);
 v_unit_price numeric(18,6);v_bank_account_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_business_member(p_business_id) then raise exception 'Active business membership is required'; end if;
 if p_client_request_id is null then raise exception 'A request reference is required'; end if;
 if p_request_type not in ('purchase','expense','refund') then raise exception 'Unsupported operation approval type'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 3 and 160 then raise exception 'Request title is required'; end if;
 if coalesce(pg_column_size(v_payload),0)>20000 then raise exception 'Request details are too large'; end if;
 if p_amount is not null and p_amount<0 then raise exception 'Request amount cannot be negative'; end if;
 select role into v_role from public.business_members where business_id=p_business_id and user_id=auth.uid() and is_active;
 if v_role is null then raise exception 'Active business membership required'; end if;
 insert into public.business_approval_settings(business_id) values(p_business_id) on conflict(business_id) do nothing;
 select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 if p_request_type='purchase' then
  if not v_settings.require_purchase_approvals then raise exception 'Purchase approvals are not enabled'; end if;
  if v_role not in ('owner','admin','manager','storekeeper') then raise exception 'Your role cannot submit purchase requests'; end if;
  if coalesce(v_payload->>'operation','') not in ('purchase','batch_receipt') then raise exception 'Explicit purchase operation is required'; end if;
  v_branch:=nullif(v_payload->>'branch_id','')::uuid;
  if v_branch is null or not exists(select 1 from public.branches where id=v_branch and business_id=p_business_id and is_active) then raise exception 'Choose an active receiving branch'; end if;
  if v_payload->>'operation'='purchase' then
   if coalesce(btrim(v_payload->>'client_transaction_id'),'')='' or jsonb_typeof(v_payload->'items')<>'array'
    or jsonb_array_length(v_payload->'items')=0 then raise exception 'Purchase transaction details are incomplete'; end if;
   for v_item in select value from jsonb_array_elements(v_payload->'items') loop
    if coalesce(btrim(v_item->>'product_client_record_id'),'')='' or coalesce((v_item->>'quantity')::numeric,0)<=0
     or coalesce((v_item->>'unit_cost')::numeric,-1)<0 then raise exception 'Invalid purchase line'; end if;
    if not exists(select 1 from public.products p where p.business_id=p_business_id and p.client_record_id=v_item->>'product_client_record_id' and p.is_active) then
     raise exception 'A purchase product is not synced or is inactive'; end if;
    v_expected:=v_expected+round((v_item->>'quantity')::numeric*(v_item->>'unit_cost')::numeric,2);
   end loop;
   if p_amount is null or abs(p_amount-v_expected)>0.01 then raise exception 'Approval amount does not match purchase line totals'; end if;
  else
   if coalesce(btrim(v_payload->>'product_client_record_id'),'')='' or coalesce(btrim(v_payload->>'batch_number'),'')=''
    or coalesce((v_payload->>'quantity')::numeric,0)<=0 or coalesce((v_payload->>'unit_cost')::numeric,-1)<0 then raise exception 'Batch receipt details are incomplete'; end if;
   if not exists(select 1 from public.products where business_id=p_business_id and client_record_id=v_payload->>'product_client_record_id' and is_active) then
    raise exception 'Batch product is not synced or is inactive'; end if;
   v_expected:=round((v_payload->>'quantity')::numeric*(v_payload->>'unit_cost')::numeric,2);
   if p_amount is null or abs(p_amount-v_expected)>0.01 then raise exception 'Approval amount does not match batch receipt value'; end if;
  end if;
 elsif p_request_type='expense' then
  if not v_settings.require_expense_approvals then raise exception 'Expense approvals are not enabled'; end if;
  if v_role not in ('owner','admin','manager','accountant') then raise exception 'Your role cannot submit expense requests'; end if;
  if coalesce(v_payload->>'operation','') not in ('expense','cashbook_expense') then raise exception 'Explicit expense operation is required'; end if;
  if coalesce((v_payload->>'amount')::numeric,0)<=0 or coalesce(btrim(v_payload->>'description'),'')=''
   or coalesce(btrim(v_payload->>'category'),'')='' then raise exception 'Expense details are incomplete'; end if;
  if p_amount is null or abs(p_amount-(v_payload->>'amount')::numeric)>0.01 then raise exception 'Approval amount does not match expense amount'; end if;
  if coalesce(btrim(v_payload->>'client_record_id'),'')='' then raise exception 'Expense reference is missing'; end if;
  if v_payload->>'operation'='cashbook_expense' then
   v_bank_account_id:=nullif(v_payload->>'bank_account_id','')::uuid;
   if v_bank_account_id is not null and not exists(select 1 from public.bank_accounts b where b.id=v_bank_account_id and b.business_id=p_business_id and b.is_active) then
    raise exception 'The selected bank or mobile-money account is not active in this business'; end if;
  end if;
 elsif p_request_type='refund' then
  if not v_settings.require_refund_approvals then raise exception 'Refund approvals are not enabled'; end if;
  if v_role not in ('owner','admin','manager','cashier') then raise exception 'Your role cannot submit refund requests'; end if;
  if coalesce(v_payload->>'operation','')<>'refund' then raise exception 'Explicit refund operation is required'; end if;
  v_branch:=nullif(v_payload->>'branch_id','')::uuid;
  if v_branch is null or coalesce(btrim(v_payload->>'sale_client_transaction_id'),'')=''
   or coalesce(btrim(v_payload->>'client_return_id'),'')='' or coalesce(btrim(v_payload->>'reason'),'')=''
   or jsonb_typeof(v_payload->'items')<>'array' or jsonb_array_length(v_payload->'items')=0 then raise exception 'Refund details are incomplete'; end if;
  if lower(coalesce(v_payload->>'refund_method','cash')) not in ('cash','mobile money','bank transfer','store credit') then raise exception 'Unsupported refund method'; end if;
  if v_role='cashier' and not exists(select 1 from public.branch_members bm where bm.business_id=p_business_id and bm.branch_id=v_branch and bm.user_id=auth.uid() and bm.is_active) then
   raise exception 'You are not assigned to the original sale branch'; end if;
  select * into v_sale from public.offline_sales s where s.business_id=p_business_id and s.branch_id=v_branch and s.client_transaction_id=v_payload->>'sale_client_transaction_id';
  if not found then raise exception 'Original sale must be synced to this branch before refund'; end if;
  if exists(select 1 from jsonb_array_elements(v_payload->'items') i(value) group by i.value->>'product_client_record_id' having count(*)>1) then
   raise exception 'Submit each returned product only once per refund'; end if;
  for v_item in select value from jsonb_array_elements(v_payload->'items') loop
   select p.id into v_product from public.products p where p.business_id=p_business_id and p.client_record_id=v_item->>'product_client_record_id' and p.is_active;
   if v_product is null then raise exception 'A returned product is not active in this business'; end if;
   v_qty:=nullif(v_item->>'quantity','')::numeric;
   if v_qty is null or v_qty<=0 then raise exception 'Return quantity must be positive'; end if;
   select coalesce(sum(si.quantity),0) into v_sold from public.offline_sale_items si where si.business_id=p_business_id and si.sale_id=v_sale.id and si.product_id=v_product;
   select coalesce(sum(ri.quantity),0) into v_returned from public.offline_sale_return_items ri
    join public.offline_sale_returns rr on rr.id=ri.return_id where ri.business_id=p_business_id and rr.sale_id=v_sale.id and ri.product_id=v_product;
   if v_qty>v_sold-v_returned then raise exception 'Return quantity exceeds remaining quantity sold for product %',v_item->>'product_name'; end if;
   select coalesce(sum(si.line_total),0)/nullif(sum(si.quantity),0) into v_unit_price from public.offline_sale_items si
    where si.business_id=p_business_id and si.sale_id=v_sale.id and si.product_id=v_product;
   if v_unit_price is null then raise exception 'Original sale price is unavailable for a returned item'; end if;
   v_expected:=v_expected+round(v_qty*v_unit_price*case when coalesce(v_sale.subtotal,0)>0 then v_sale.total/v_sale.subtotal else 1 end,2);
  end loop;
  if p_amount is null or v_expected<=0 or abs(p_amount-v_expected)>0.01 then raise exception 'Approval amount does not match the sale price after discount and returned quantities'; end if;
 end if;
 insert into public.business_approval_requests(business_id,client_request_id,request_type,title,description,amount,currency_code,requested_by,request_payload)
 values(p_business_id,p_client_request_id,p_request_type,btrim(p_title),left(coalesce(p_description,''),2000),
  p_amount,coalesce(nullif(upper(p_currency_code),''),'SLE'),auth.uid(),v_payload)
 on conflict(business_id,client_request_id) do nothing returning id into v_request_id;
 if v_request_id is null then
  select id into v_request_id from public.business_approval_requests where business_id=p_business_id
   and client_request_id=p_client_request_id and requested_by=auth.uid();
  if v_request_id is null then raise exception 'Request reference already used'; end if;
 end if;
 return jsonb_build_object('request_id',v_request_id,'status','pending');
end;$function$;
revoke all on function public.create_business_operation_approval(uuid,uuid,text,text,text,numeric,text,jsonb) from public;
revoke all on function public.create_business_operation_approval(uuid,uuid,text,text,text,numeric,text,jsonb) from anon;
grant execute on function public.create_business_operation_approval(uuid,uuid,text,text,text,numeric,text,jsonb) to authenticated;

create or replace function public.receive_product_batch(
 p_business_id uuid,p_branch_id uuid,p_product_id uuid,p_batch_number text,
 p_expiry_date date,p_quantity numeric,p_unit_cost numeric
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_role public.business_role;v_batch uuid;v_purchase_required boolean:=false;v_approval_id uuid;v_product_client_id text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select role into v_role from public.business_members where business_id=p_business_id and user_id=auth.uid() and is_active;
 if not public.has_business_role(p_business_id,array['owner','admin','manager','storekeeper']::public.business_role[]) then raise exception 'Not authorised to receive stock batches'; end if;
 if v_role='storekeeper' and not exists(select 1 from public.branch_members where business_id=p_business_id and branch_id=p_branch_id and user_id=auth.uid() and is_active) then
  raise exception 'You are not assigned to this branch'; end if;
 select coalesce(s.require_purchase_approvals,false) into v_purchase_required from public.business_approval_settings s where s.business_id=p_business_id;
 if coalesce(v_purchase_required,false) then
  v_approval_id:=nullif(current_setting('koroma.business_approval_request_id',true),'')::uuid;
  select client_record_id into v_product_client_id from public.products where id=p_product_id and business_id=p_business_id and is_active;
  if v_approval_id is null or not exists(
   select 1 from public.business_approval_requests r where r.id=v_approval_id and r.business_id=p_business_id
    and r.request_type='purchase' and r.status='approved' and r.reviewed_by=auth.uid() and r.executed_at is null
    and r.request_payload->>'operation'='batch_receipt' and r.request_payload->>'branch_id'=p_branch_id::text
    and r.request_payload->>'product_client_record_id'=v_product_client_id and r.request_payload->>'batch_number'=p_batch_number
    and (r.request_payload->>'quantity')::numeric=p_quantity and (r.request_payload->>'unit_cost')::numeric=p_unit_cost
    and coalesce(r.request_payload->>'expiry_date','')=coalesce(p_expiry_date::text,'')
  ) then raise exception 'Purchase approvals are enabled. Only the approved batch request can receive this stock'; end if;
 end if;
 if length(trim(coalesce(p_batch_number,'')))<1 or p_quantity is null or p_quantity<=0 or p_unit_cost is null or p_unit_cost<0 then
  raise exception 'Batch number, positive quantity and valid cost are required'; end if;
 if not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and is_active)
  or not exists(select 1 from public.products where id=p_product_id and business_id=p_business_id and is_active) then
  raise exception 'Active branch or product not found'; end if;
 insert into public.product_batches(business_id,branch_id,product_id,batch_number,expiry_date,quantity_on_hand,unit_cost)
 values(p_business_id,p_branch_id,p_product_id,trim(p_batch_number),p_expiry_date,p_quantity,p_unit_cost)
 on conflict(branch_id,product_id,batch_number) do update set expiry_date=excluded.expiry_date,
  quantity_on_hand=public.product_batches.quantity_on_hand+excluded.quantity_on_hand,unit_cost=excluded.unit_cost,updated_at=now()
 returning id into v_batch;
 insert into public.branch_inventory(business_id,branch_id,product_id,quantity_on_hand)
 values(p_business_id,p_branch_id,p_product_id,p_quantity)
 on conflict(branch_id,product_id) do update set quantity_on_hand=public.branch_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'product_batch_received','product_batches',v_batch::text,
  jsonb_build_object('branch_id',p_branch_id,'product_id',p_product_id,'batch_number',p_batch_number,'quantity',p_quantity,'expiry_date',p_expiry_date));
 return jsonb_build_object('status','received','batch_id',v_batch);
end;$function$;
revoke all on function public.receive_product_batch(uuid,uuid,uuid,text,date,numeric,numeric) from public;
revoke all on function public.receive_product_batch(uuid,uuid,uuid,text,date,numeric,numeric) from anon;
grant execute on function public.receive_product_batch(uuid,uuid,uuid,text,date,numeric,numeric) to authenticated;

create or replace function public.review_business_approval_request(
 p_request_id uuid,p_decision text,p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid:=auth.uid();v_request public.business_approval_requests%rowtype;
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
  if v_request.request_type in ('payroll','purchase','refund') then
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager']::public.business_role[]) then
    raise exception 'This request must be reviewed by an owner, administrator or manager'; end if;
   if v_request.request_type='payroll' and not public.has_business_role(v_request.business_id,array['owner','admin']::public.business_role[]) then
    raise exception 'Payroll approvals are restricted to business owners and administrators'; end if;
  else
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager','accountant']::public.business_role[]) then
    raise exception 'You do not have permission to review this request'; end if;
  end if;
 end if;
 update public.business_approval_requests set status=v_decision,reviewed_by=v_user_id,review_note=v_note,reviewed_at=now(),updated_at=now()
  where id=v_request.id;
 if v_decision='approved' and v_request.request_payload is not null then
  if v_request.request_type='purchase' and v_request.request_payload->>'operation'='batch_receipt' then
   perform set_config('koroma.business_approval_request_id',v_request.id::text,true);
  end if;
  v_result:=public.execute_business_operation_approval(v_request.id);
  if v_request.request_type='purchase' and v_request.request_payload->>'operation'='batch_receipt' then
   perform set_config('koroma.business_approval_request_id','',true);
  end if;
 end if;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_request.business_id,v_user_id,'approval_request_'||v_decision,'business_approval_requests',v_request.id::text,
  jsonb_build_object('request_type',v_request.request_type,'title',v_request.title,'amount',v_request.amount,
   'currency_code',v_request.currency_code,'previous_status',v_request.status,'new_status',v_decision,'execution',v_result));
 return jsonb_build_object('success',true,'request_id',v_request.id,'status',v_decision,'execution',v_result);
end;$function$;
revoke all on function public.review_business_approval_request(uuid,text,text) from public;
revoke all on function public.review_business_approval_request(uuid,text,text) from anon;
grant execute on function public.review_business_approval_request(uuid,text,text) to authenticated;
