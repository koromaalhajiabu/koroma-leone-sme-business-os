-- Final safeguards for business approval settings, stock batch receipts and expense cashbook posting.
alter table public.business_approval_settings
  alter column require_stock_adjustment_approvals set default true;
update public.business_approval_settings
set require_stock_adjustment_approvals=true,updated_at=now()
where require_stock_adjustment_approvals is distinct from true;

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
  p_business_id,coalesce(p_require_purchase_approvals,false),
  coalesce(p_require_expense_approvals,false),coalesce(p_require_refund_approvals,false),
  true,auth.uid(),now()
 )
 on conflict(business_id) do update set
  require_purchase_approvals=excluded.require_purchase_approvals,
  require_expense_approvals=excluded.require_expense_approvals,
  require_refund_approvals=excluded.require_refund_approvals,
  require_stock_adjustment_approvals=true,updated_by=auth.uid(),updated_at=now()
 returning * into v_row;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'business_approval_settings_updated','business_approval_settings',p_business_id::text,
  jsonb_build_object('purchase_approvals',v_row.require_purchase_approvals,
   'expense_approvals',v_row.require_expense_approvals,'refund_approvals',v_row.require_refund_approvals,
   'stock_adjustment_approvals',true));
 return jsonb_build_object(
  'business_id',v_row.business_id,'require_purchase_approvals',v_row.require_purchase_approvals,
  'require_expense_approvals',v_row.require_expense_approvals,'require_refund_approvals',v_row.require_refund_approvals,
  'require_stock_adjustment_approvals',true,'updated_at',v_row.updated_at
 );
end;$function$;
revoke all on function public.set_business_approval_settings(uuid,boolean,boolean,boolean,boolean) from public;
revoke all on function public.set_business_approval_settings(uuid,boolean,boolean,boolean,boolean) from anon;
grant execute on function public.set_business_approval_settings(uuid,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.approval_gate_cashbook_expense()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;v_payload jsonb;v_bank_account_id uuid;
begin
 if lower(coalesce(new.entry_type,''))<>'expense' then return new; end if;
 select coalesce(s.require_expense_approvals,false) into v_required
 from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 select r.request_payload into v_payload
 from public.business_approval_requests r
 where r.business_id=new.business_id and r.request_type='expense' and r.status='approved'
  and r.executed_at is null and r.request_payload->>'operation'='cashbook_expense'
  and r.request_payload->>'client_record_id'=new.reference
 for update;
 if not found then raise exception 'This cashbook expense requires approval before it can be recorded'; end if;
 v_bank_account_id:=nullif(v_payload->>'bank_account_id','')::uuid;
 if v_bank_account_id is not null then
  if not exists(select 1 from public.bank_accounts b where b.id=v_bank_account_id
   and b.business_id=new.business_id and b.is_active) then
   raise exception 'The selected bank or mobile-money account is no longer active in this business';
  end if;
  new.bank_account_id:=v_bank_account_id;
 end if;
 return new;
end;$function$;

create or replace function public.approval_gate_batch_write()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
 select coalesce(s.require_purchase_approvals,false) into v_required
 from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 if new.batch_number like 'RET-%' and exists(
  select 1 from public.offline_sale_returns r
  join public.offline_sale_return_items ri on ri.business_id=r.business_id and ri.return_id=r.id
  where r.business_id=new.business_id and r.branch_id=new.branch_id
   and ri.product_id=new.product_id and ri.restocked=true and ri.quantity=new.quantity_on_hand
   and new.batch_number like ('RET-'||substr(replace(r.client_return_id,'-',''),1,20)||'-%')
 ) then return new; end if;
 if exists(select 1 from public.product_batches b where b.business_id=new.business_id
  and b.branch_id=new.branch_id and b.product_id=new.product_id and b.batch_number=new.batch_number) then
  return new;
 end if;
 if not exists(select 1 from public.business_approval_requests r
  where r.business_id=new.business_id and r.request_type='purchase' and r.status='approved'
   and r.executed_at is null and r.request_payload->>'operation'='batch_receipt'
   and r.request_payload->>'branch_id'=new.branch_id::text
   and r.request_payload->>'batch_number'=new.batch_number) then
  raise exception 'This batch receipt requires purchase approval';
 end if;
 return new;
end;$function$;

create or replace function public.receive_product_batch(
 p_business_id uuid,p_branch_id uuid,p_product_id uuid,p_batch_number text,
 p_expiry_date date,p_quantity numeric,p_unit_cost numeric
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_role public.business_role;v_batch uuid;v_purchase_required boolean:=false;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select role into v_role from public.business_members
 where business_id=p_business_id and user_id=auth.uid() and is_active;
 if not public.has_business_role(p_business_id,array['owner','admin','manager','storekeeper']::public.business_role[]) then
  raise exception 'Not authorised to receive stock batches';
 end if;
 if v_role='storekeeper' and not exists(select 1 from public.branch_members
  where business_id=p_business_id and branch_id=p_branch_id and user_id=auth.uid() and is_active) then
  raise exception 'You are not assigned to this branch';
 end if;
 select coalesce(s.require_purchase_approvals,false) into v_purchase_required
 from public.business_approval_settings s where s.business_id=p_business_id;
 if coalesce(v_purchase_required,false) then
  raise exception 'Purchase approvals are enabled. Submit this batch receipt through the Automation Centre.';
 end if;
 if length(trim(coalesce(p_batch_number,'')))<1 or p_quantity is null or p_quantity<=0
  or p_unit_cost is null or p_unit_cost<0 then
  raise exception 'Batch number, positive quantity and valid cost are required';
 end if;
 if not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and is_active)
  or not exists(select 1 from public.products where id=p_product_id and business_id=p_business_id and is_active) then
  raise exception 'Active branch or product not found';
 end if;
 insert into public.product_batches(business_id,branch_id,product_id,batch_number,expiry_date,quantity_on_hand,unit_cost)
 values(p_business_id,p_branch_id,p_product_id,trim(p_batch_number),p_expiry_date,p_quantity,p_unit_cost)
 on conflict(branch_id,product_id,batch_number) do update set
  expiry_date=excluded.expiry_date,quantity_on_hand=public.product_batches.quantity_on_hand+excluded.quantity_on_hand,
  unit_cost=excluded.unit_cost,updated_at=now()
 returning id into v_batch;
 insert into public.branch_inventory(business_id,branch_id,product_id,quantity_on_hand)
 values(p_business_id,p_branch_id,p_product_id,p_quantity)
 on conflict(branch_id,product_id) do update
  set quantity_on_hand=public.branch_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'product_batch_received','product_batches',v_batch::text,
  jsonb_build_object('branch_id',p_branch_id,'product_id',p_product_id,'batch_number',p_batch_number,
   'quantity',p_quantity,'expiry_date',p_expiry_date));
 return jsonb_build_object('status','received','batch_id',v_batch);
end;$function$;
revoke all on function public.receive_product_batch(uuid,uuid,uuid,text,date,numeric,numeric) from public;
revoke all on function public.receive_product_batch(uuid,uuid,uuid,text,date,numeric,numeric) from anon;
grant execute on function public.receive_product_batch(uuid,uuid,uuid,text,date,numeric,numeric) to authenticated;

comment on column public.business_approval_settings.require_stock_adjustment_approvals is
 'Always true: stock adjustments must use request_stock_adjustment and decide_stock_adjustment.';
