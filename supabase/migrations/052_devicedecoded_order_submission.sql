-- DeviceDecoded order submission with owner approval, payment gate and duplicate protection.
begin;
alter table public.phone_unlocking_provider_services add column if not exists provider_is_instant boolean;
alter table public.phone_unlocking_services add column if not exists provider_key text, add column if not exists provider_is_instant boolean;
alter table public.phone_unlocking_orders add column if not exists provider_key text, add column if not exists provider_is_instant boolean, add column if not exists provider_response jsonb, add column if not exists provider_credits_used numeric(18,4), add column if not exists provider_credit_balance numeric(18,4);

update public.phone_unlocking_services s
set provider_key = (
      select ps.provider_key from public.phone_unlocking_provider_services ps
      where ps.business_id=s.business_id
        and ps.provider_service_id=s.provider_service_id
        and ps.provider_service_type=s.provider_service_type
      order by case when ps.provider_key='devicedecoded' then 0 else 1 end
      limit 1
    ),
    provider_is_instant = (
      select ps.provider_is_instant from public.phone_unlocking_provider_services ps
      where ps.business_id=s.business_id
        and ps.provider_service_id=s.provider_service_id
        and ps.provider_service_type=s.provider_service_type
      order by case when ps.provider_key='devicedecoded' then 0 else 1 end
      limit 1
    )
where s.provider_service_id is not null
  and s.provider_key is null
  and exists (
    select 1 from public.phone_unlocking_provider_services ps
    where ps.business_id=s.business_id
      and ps.provider_service_id=s.provider_service_id
      and ps.provider_service_type=s.provider_service_type
  );

update public.phone_unlocking_orders o
set provider_key=s.provider_key,provider_is_instant=s.provider_is_instant
from public.phone_unlocking_services s
where s.business_id=o.business_id and s.service_name=o.service_name and s.provider_service_id=o.provider_service_id and o.provider_key is null;

create or replace function public.claim_phone_unlocking_provider_submission(p_business_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth
as $claim$
declare v_order public.phone_unlocking_orders%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.has_business_role(p_business_id,array['owner']::public.business_role[]) then raise exception 'Only the business owner can submit approved provider orders'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=p_business_id for update;
 if not found then raise exception 'Unlocking order not found'; end if;
 if v_order.approval_status<>'approved' or v_order.approved_by<>auth.uid() then raise exception 'This order has not been approved by the signed-in business owner'; end if;
 if v_order.amount_paid<v_order.service_price then raise exception 'Full customer payment is required'; end if;
 if v_order.provider_key<>'devicedecoded' or v_order.provider_service_id is null or v_order.provider_service_type<>'IMEI' then raise exception 'This order is not mapped to a supported DeviceDecoded IMEI service'; end if;
 if v_order.provider_submission_status<>'not_submitted' then raise exception 'A provider submission has already been attempted. Reconcile its status before any retry'; end if;
 if v_order.status in ('cancelled','failed','refunded','completed') then raise exception 'This order is not in a submit-ready state'; end if;
 update public.phone_unlocking_orders set provider_submission_status='submitting',provider_submission_attempted_at=now(),provider_submission_message='Owner-approved DeviceDecoded submission started',updated_at=now()
 where id=p_order_id and business_id=p_business_id returning * into v_order;
 return to_jsonb(v_order);
end;
$claim$;

create or replace function public.finish_devicedecoded_provider_submission(
 p_business_id uuid,p_order_id uuid,p_outcome text,p_provider_reference text default null,
 p_message text default null,p_provider_response jsonb default null,p_credits_used numeric default null,
 p_credit_balance numeric default null,p_is_instant boolean default false
) returns void language plpgsql security definer set search_path=public,auth
as $finish$
declare v_order public.phone_unlocking_orders%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.has_business_role(p_business_id,array['owner']::public.business_role[]) then raise exception 'Only the business owner can finalise DeviceDecoded submissions'; end if;
 if p_outcome not in ('submitted','failed','unknown') then raise exception 'Invalid provider submission outcome'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=p_business_id for update;
 if not found then raise exception 'Unlocking order not found'; end if;
 if v_order.provider_submission_status<>'submitting' then raise exception 'Order is not currently marked as submitting'; end if;
 update public.phone_unlocking_orders set
  provider_submission_status=p_outcome,
  provider_reference=case when p_outcome='submitted' then nullif(trim(coalesce(p_provider_reference,'')),'') else provider_reference end,
  provider_submission_message=left(coalesce(p_message,''),500),provider_response=p_provider_response,
  provider_credits_used=p_credits_used,provider_credit_balance=p_credit_balance,provider_name='DeviceDecoded',
  status=case when p_outcome='submitted' and p_is_instant then 'completed' when p_outcome in ('submitted','unknown') then 'processing' when p_outcome='failed' then 'failed' else status end,
  completed_at=case when p_outcome='submitted' and p_is_instant then now() else completed_at end,updated_at=now()
 where id=p_order_id and business_id=p_business_id;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'devicedecoded_provider_submission_'||p_outcome,'phone_unlocking_orders',p_order_id::text,
 jsonb_build_object('reference',v_order.reference,'provider_reference',p_provider_reference,'credits_used',p_credits_used,'is_instant',p_is_instant,'message',left(coalesce(p_message,''),500)));
end;
$finish$;
revoke all on function public.claim_phone_unlocking_provider_submission(uuid,uuid) from public;
revoke all on function public.finish_devicedecoded_provider_submission(uuid,uuid,text,text,text,jsonb,numeric,numeric,boolean) from public;
grant execute on function public.claim_phone_unlocking_provider_submission(uuid,uuid) to authenticated;
grant execute on function public.finish_devicedecoded_provider_submission(uuid,uuid,text,text,text,jsonb,numeric,numeric,boolean) to authenticated;
commit;
