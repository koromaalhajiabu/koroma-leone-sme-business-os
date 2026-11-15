-- Restrict the device-services control plane to the business owner account only.
begin;

drop policy if exists phone_unlocking_services_read on public.phone_unlocking_services;
create policy phone_unlocking_services_read on public.phone_unlocking_services
 for select to authenticated using (public.is_platform_developer());
drop policy if exists phone_unlocking_services_manage on public.phone_unlocking_services;
create policy phone_unlocking_services_manage on public.phone_unlocking_services
 for all to authenticated
 using (public.is_platform_developer())
 with check (public.is_platform_developer());

drop policy if exists phone_unlocking_orders_read on public.phone_unlocking_orders;
create policy phone_unlocking_orders_read on public.phone_unlocking_orders
 for select to authenticated using (public.is_platform_developer());
drop policy if exists phone_unlocking_orders_insert on public.phone_unlocking_orders;
create policy phone_unlocking_orders_insert on public.phone_unlocking_orders
 for insert to authenticated with check (
   created_by=auth.uid() and public.is_platform_developer()
 );
drop policy if exists phone_unlocking_orders_update on public.phone_unlocking_orders;
create policy phone_unlocking_orders_update on public.phone_unlocking_orders
 for update to authenticated
 using (public.is_platform_developer())
 with check (public.is_platform_developer());

drop policy if exists phone_unlocking_payments_read on public.phone_unlocking_payments;
create policy phone_unlocking_payments_read on public.phone_unlocking_payments
 for select to authenticated using (public.is_platform_developer());
drop policy if exists phone_unlocking_refunds_read on public.phone_unlocking_refunds;
create policy phone_unlocking_refunds_read on public.phone_unlocking_refunds
 for select to authenticated using (public.is_platform_developer());

drop policy if exists phone_unlocking_provider_services_read on public.phone_unlocking_provider_services;
create policy phone_unlocking_provider_services_read on public.phone_unlocking_provider_services
 for select to authenticated using (public.is_platform_developer());
drop policy if exists phone_unlocking_provider_services_manage on public.phone_unlocking_provider_services;
create policy phone_unlocking_provider_services_manage on public.phone_unlocking_provider_services
 for all to authenticated
 using (public.is_platform_developer())
 with check (public.is_platform_developer());

drop policy if exists phone_unlocking_provider_connections_read on public.phone_unlocking_provider_connections;
create policy phone_unlocking_provider_connections_read on public.phone_unlocking_provider_connections
 for select to authenticated using (public.is_platform_developer());
drop policy if exists phone_unlocking_provider_connections_manage on public.phone_unlocking_provider_connections;
create policy phone_unlocking_provider_connections_manage on public.phone_unlocking_provider_connections
 for all to authenticated
 using (public.is_platform_developer())
 with check (public.is_platform_developer());

create or replace function public.record_phone_unlocking_payment(
 p_business_id uuid,p_order_id uuid,p_amount numeric,p_payment_method text,
 p_payment_reference text default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public,auth
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_payment_id uuid:=gen_random_uuid();
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_platform_developer() then raise exception 'Only the registered platform developer can record device-service payments'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
 if p_payment_method not in ('cash','mobile_money','bank_transfer','card','other') then raise exception 'Unsupported payment method'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=p_business_id for update;
 if not found then raise exception 'Unlocking order not found'; end if;
 if v_order.status in ('cancelled','refunded','failed') then raise exception 'Payments cannot be recorded against a cancelled, refunded or failed order'; end if;
 if v_order.amount_paid+p_amount>v_order.service_price then raise exception 'Payment exceeds the outstanding order balance'; end if;
 insert into public.phone_unlocking_payments(id,business_id,order_id,amount,payment_method,payment_reference,notes,received_by)
 values(v_payment_id,p_business_id,p_order_id,p_amount,p_payment_method,
 nullif(trim(coalesce(p_payment_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),auth.uid());
 update public.phone_unlocking_orders set amount_paid=amount_paid+p_amount,updated_at=now() where id=p_order_id and business_id=p_business_id;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'phone_unlocking_payment_recorded','phone_unlocking_payments',v_payment_id::text,
 jsonb_build_object('order_id',p_order_id,'amount',p_amount,'method',p_payment_method));
 return v_payment_id;
end;
$fn$;

create or replace function public.record_phone_unlocking_refund(
 p_business_id uuid,p_order_id uuid,p_amount numeric,p_refund_method text,
 p_refund_reference text default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public,auth
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_refund_id uuid:=gen_random_uuid(); v_new_refunded numeric(18,2);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_platform_developer() then raise exception 'Only the registered platform developer can issue device-service refunds'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Refund amount must be greater than zero'; end if;
 if p_refund_method not in ('cash','mobile_money','bank_transfer','card','other') then raise exception 'Unsupported refund method'; end if;
 select * into v_order from public.phone_unlocking_orders where id=p_order_id and business_id=p_business_id for update;
 if not found then raise exception 'Unlocking order not found'; end if;
 if v_order.status='cancelled' then raise exception 'Cancelled orders cannot be refunded through this workflow'; end if;
 v_new_refunded:=v_order.amount_refunded+p_amount;
 if v_new_refunded>v_order.amount_paid then raise exception 'Refund exceeds the amount received from the customer'; end if;
 insert into public.phone_unlocking_refunds(id,business_id,order_id,amount,refund_method,refund_reference,notes,issued_by)
 values(v_refund_id,p_business_id,p_order_id,p_amount,p_refund_method,
 nullif(trim(coalesce(p_refund_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),auth.uid());
 update public.phone_unlocking_orders set amount_refunded=v_new_refunded,
 status=case when v_new_refunded=v_order.amount_paid then 'refunded' else status end,updated_at=now()
 where id=p_order_id and business_id=p_business_id;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(p_business_id,auth.uid(),'phone_unlocking_refund_recorded','phone_unlocking_refunds',v_refund_id::text,
 jsonb_build_object('order_id',p_order_id,'amount',p_amount,'method',p_refund_method));
 return v_refund_id;
end;
$fn$;

revoke all on function public.record_phone_unlocking_payment(uuid,uuid,numeric,text,text,text) from public;
revoke all on function public.record_phone_unlocking_refund(uuid,uuid,numeric,text,text,text) from public;
grant execute on function public.record_phone_unlocking_payment(uuid,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.record_phone_unlocking_refund(uuid,uuid,numeric,text,text,text) to authenticated;

commit;
