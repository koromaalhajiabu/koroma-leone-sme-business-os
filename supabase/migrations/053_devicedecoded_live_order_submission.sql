-- DeviceDecoded live order submission for the independent White Lion Device Services platform.
-- Provider requests are made only after full customer payment and explicit owner approval.
begin;

alter table public.phone_unlocking_services
  add column if not exists provider_key text;
alter table public.phone_unlocking_provider_services
  add column if not exists provider_is_instant boolean;
update public.phone_unlocking_provider_services
 set provider_is_instant=(delivery_time='Instant')
 where provider_key='devicedecoded' and provider_is_instant is null;
alter table public.phone_unlocking_orders
  add column if not exists provider_key text,
  add column if not exists provider_credits_used numeric(18,4),
  add column if not exists provider_response jsonb,
  add column if not exists provider_submitted_at timestamptz;

update public.phone_unlocking_services s
set provider_key=ps.provider_key
from public.phone_unlocking_provider_services ps
where s.provider_service_id=ps.provider_service_id
  and s.provider_service_type=ps.provider_service_type
  and s.business_id=ps.business_id
  and s.provider_key is null;

update public.phone_unlocking_orders o
set provider_key=s.provider_key,
    provider_service_id=coalesce(o.provider_service_id,s.provider_service_id),
    provider_service_type=coalesce(o.provider_service_type,s.provider_service_type)
from public.phone_unlocking_services s
where s.business_id=o.business_id
  and s.service_name=o.service_name
  and o.provider_key is null
  and s.provider_key='devicedecoded';

create index if not exists phone_unlocking_orders_provider_idx
  on public.phone_unlocking_orders(business_id,provider_key,provider_submission_status,created_at desc);

create or replace function public.submit_public_device_service_order(
 p_slug text,p_customer_name text,p_customer_phone text,p_customer_email text,
 p_device_brand text,p_device_model text,p_imei text,p_network_name text,
 p_country text,p_service_id uuid,p_customer_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare
 v_store public.phone_unlocking_storefronts%rowtype;
 v_service public.phone_unlocking_services%rowtype;
 v_business uuid; v_branch uuid; v_order_id uuid:=gen_random_uuid();
 v_reference text; v_currency text;
begin
 if length(trim(coalesce(p_customer_name,'')))<2 then raise exception 'Enter your full name'; end if;
 if length(trim(coalesce(p_customer_phone,'')))<5 then raise exception 'Enter a valid phone number'; end if;
 if coalesce(p_customer_email,'')<>'' and p_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
 if length(trim(coalesce(p_device_brand,'')))<2 or length(trim(coalesce(p_device_model,'')))<1 then raise exception 'Enter the phone brand and model'; end if;
 if coalesce(p_imei,'') !~ '^[0-9]{14,16}$' then raise exception 'Enter a valid 14–16 digit IMEI'; end if;
 if length(trim(coalesce(p_network_name,'')))<2 then raise exception 'Enter the original network or carrier'; end if;
 select business_id,branch_id into v_business,v_branch from public.platform_device_services_config where singleton=true;
 if v_business is null or v_branch is null then raise exception 'Device Services platform is not configured'; end if;
 select * into v_store from public.phone_unlocking_storefronts
 where business_id=v_business and slug=lower(trim(coalesce(p_slug,'')))
 and is_published and accepts_orders for update;
 if not found then raise exception 'This service store is not accepting orders'; end if;
 select b.currency_code into v_currency from public.businesses b where b.id=v_business;
 select * into v_service from public.phone_unlocking_services
 where id=p_service_id and business_id=v_business and is_active;
 if not found then raise exception 'The selected service is no longer available. Refresh the service list.'; end if;
 if not exists(select 1 from public.branches where id=v_branch and business_id=v_business and is_active) then
  raise exception 'The Device Services operations branch is not active';
 end if;
 v_reference:='WLD-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.phone_unlocking_orders(
  id,business_id,branch_id,reference,customer_name,customer_phone,customer_email,
  device_brand,device_model,imei,network_name,country,service_name,
  provider_cost,service_price,notes,status,created_by,provider_service_id,provider_service_type,provider_key
 ) values (
  v_order_id,v_business,v_branch,v_reference,left(trim(p_customer_name),120),
  left(trim(p_customer_phone),40),nullif(left(trim(coalesce(p_customer_email,'')),160),''),
  left(trim(p_device_brand),80),left(trim(p_device_model),100),p_imei,left(trim(p_network_name),100),
  nullif(left(trim(coalesce(p_country,'')),80),''),v_service.service_name,
  0,v_service.default_price,nullif(left(trim(coalesce(p_customer_notes,'')),1000),''),
  'received',null,v_service.provider_service_id,v_service.provider_service_type,v_service.provider_key
 );
 return jsonb_build_object('ok',true,'reference',v_reference,'service_name',v_service.service_name,
  'service_price',v_service.default_price,'currency_code',coalesce(v_currency,'SLE'),
  'message','Your request has been received. We will contact you to confirm payment and processing.');
end;
$fn$;

create or replace function public.approve_phone_unlocking_order(p_business_id uuid,p_order_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_business uuid;
begin
 if auth.uid() is null or not public.is_platform_developer() then raise exception 'Only the registered platform developer can approve Device Services orders'; end if;
 select business_id into v_business from public.platform_device_services_config where singleton=true;
 if v_business is null or p_business_id<>v_business then raise exception 'Invalid Device Services platform business'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=v_business for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.approval_status<>'pending' then raise exception 'This order has already been reviewed'; end if;
 if v_order.status not in ('received','quoted','awaiting_payment') then raise exception 'This order is not eligible for approval'; end if;
 if v_order.amount_paid<v_order.service_price then raise exception 'Full customer payment is required before approval'; end if;
 update public.phone_unlocking_orders set approval_status='approved',approved_by=auth.uid(),approved_at=now(),
  rejected_by=null,rejected_at=null,rejection_reason=null,updated_at=now()
 where id=p_order_id and business_id=v_business;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_business,auth.uid(),'phone_unlocking_order_approved','phone_unlocking_orders',p_order_id::text,
  jsonb_build_object('reference',v_order.reference,'provider_submission','requires_explicit_device_decoded_action'));
end;
$fn$;

create or replace function public.reject_phone_unlocking_order(p_business_id uuid,p_order_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_business uuid;
begin
 if auth.uid() is null or not public.is_platform_developer() then raise exception 'Only the registered platform developer can reject Device Services orders'; end if;
 select business_id into v_business from public.platform_device_services_config where singleton=true;
 if v_business is null or p_business_id<>v_business then raise exception 'Invalid Device Services platform business'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=v_business for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.approval_status<>'pending' then raise exception 'This order has already been reviewed'; end if;
 if v_order.provider_submission_status<>'not_submitted' then raise exception 'An order with a provider submission attempt cannot be rejected here'; end if;
 update public.phone_unlocking_orders set approval_status='rejected',rejected_by=auth.uid(),rejected_at=now(),
  rejection_reason=nullif(left(trim(coalesce(p_reason,'')),500),''),
  status=case when amount_paid=0 then 'cancelled' else status end,updated_at=now()
 where id=p_order_id and business_id=v_business;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_business,auth.uid(),'phone_unlocking_order_rejected','phone_unlocking_orders',p_order_id::text,
  jsonb_build_object('reference',v_order.reference,'reason',left(coalesce(p_reason,''),500)));
end;
$fn$;

create or replace function public.claim_devicedecoded_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_business uuid;
begin
 if auth.uid() is null or not public.is_platform_developer() then raise exception 'Developer sign-in required'; end if;
 select business_id into v_business from public.platform_device_services_config where singleton=true;
 if v_business is null then raise exception 'Device Services platform is not configured'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=v_business for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.provider_key is distinct from 'devicedecoded' or v_order.provider_service_type is distinct from 'IMEI' or coalesce(v_order.provider_service_id,'')='' then
  raise exception 'This order is not mapped to an active DeviceDecoded IMEI service';
 end if;
 if not exists(select 1 from public.phone_unlocking_provider_services ps
  where ps.business_id=v_business and ps.provider_key='devicedecoded'
   and ps.provider_service_type='IMEI' and ps.provider_service_id=v_order.provider_service_id and ps.is_active and ps.provider_is_instant is false) then
  raise exception 'The mapped DeviceDecoded service is not an active non-instant fulfilment service. Sync the catalogue and choose a supported unlock service.';
 end if;
 if lower(concat_ws(' ',v_order.service_name)) !~ '(network|carrier|sim.?lock|unlock)' or
    lower(v_order.service_name) ~ '(icloud|activation.?lock|frp|mdm|google.?lock|mi.?account|bypass|blacklist|lost|stolen)' then
  raise exception 'Only supported carrier/network/SIM unlock services can be submitted automatically.';
 end if;
 if v_order.approval_status<>'approved' or v_order.approved_by<>auth.uid() then
  raise exception 'Approve this order as the signed-in platform developer before provider submission';
 end if;
 if v_order.amount_paid<v_order.service_price then raise exception 'Full customer payment is required before provider submission'; end if;
 if v_order.status in ('cancelled','failed','refunded','completed') then raise exception 'This order is not in a submit-ready state'; end if;
 if v_order.provider_submission_status<>'not_submitted' then raise exception 'A provider submission has already been attempted. Reconcile with DeviceDecoded before any retry'; end if;
 update public.phone_unlocking_orders set provider_submission_status='submitting',
  provider_submission_attempted_at=now(),provider_submission_message='Owner-approved DeviceDecoded submission started',updated_at=now()
 where id=p_order_id and business_id=v_business returning * into v_order;
 return to_jsonb(v_order);
end;
$fn$;

create or replace function public.finish_devicedecoded_order(
 p_order_id uuid,p_outcome text,p_provider_reference text default null,
 p_provider_credits_used numeric default null,p_provider_response jsonb default null,p_message text default null
) returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_business uuid;
begin
 if auth.uid() is null or not public.is_platform_developer() then raise exception 'Developer sign-in required'; end if;
 if p_outcome not in ('submitted','failed','unknown') then raise exception 'Invalid provider outcome'; end if;
 select business_id into v_business from public.platform_device_services_config where singleton=true;
 if v_business is null then raise exception 'Device Services platform is not configured'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=v_business for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.provider_submission_status<>'submitting' then raise exception 'Order is not marked as submitting'; end if;
 update public.phone_unlocking_orders set
  provider_submission_status=p_outcome,
  provider_reference=case when p_outcome='submitted' then nullif(left(trim(coalesce(p_provider_reference,'')),160),'') else provider_reference end,
  provider_credits_used=coalesce(p_provider_credits_used,provider_credits_used),
  provider_response=coalesce(p_provider_response,provider_response),
  provider_submitted_at=case when p_outcome='submitted' then now() else provider_submitted_at end,
  provider_submission_message=left(coalesce(p_message,''),500),
  provider_name='DeviceDecoded',
  status=case when p_outcome='submitted' then 'processing' else status end,
  updated_at=now()
 where id=p_order_id and business_id=v_business;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_business,auth.uid(),'devicedecoded_order_'||p_outcome,
  'phone_unlocking_orders',p_order_id::text,jsonb_build_object('reference',v_order.reference,'provider_reference',p_provider_reference,'message',left(coalesce(p_message,''),500)));
end;
$fn$;

revoke all on function public.claim_devicedecoded_order(uuid) from public,anon;
revoke all on function public.finish_devicedecoded_order(uuid,text,text,numeric,jsonb,text) from public,anon;
grant execute on function public.claim_devicedecoded_order(uuid) to authenticated;
grant execute on function public.finish_devicedecoded_order(uuid,text,text,numeric,jsonb,text) to authenticated;
revoke all on function public.approve_phone_unlocking_order(uuid,uuid) from public,anon;
revoke all on function public.reject_phone_unlocking_order(uuid,uuid,text) from public,anon;
grant execute on function public.approve_phone_unlocking_order(uuid,uuid) to authenticated;
grant execute on function public.reject_phone_unlocking_order(uuid,uuid,text) to authenticated;

commit;
