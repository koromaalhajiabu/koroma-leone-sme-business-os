-- White Lion Device Services: live-operations foundation.
-- Payment instructions, customer payment claims, operational event log and financial summary.
begin;

create table if not exists public.device_service_payment_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  mobile_money_network text,
  mobile_money_account_name text,
  mobile_money_number text,
  payment_instructions text,
  updated_at timestamptz not null default now(),
  constraint device_service_payment_settings_lengths check (
    length(coalesce(bank_name,'')) <= 100 and
    length(coalesce(bank_account_name,'')) <= 120 and
    length(coalesce(bank_account_number,'')) <= 80 and
    length(coalesce(mobile_money_network,'')) <= 80 and
    length(coalesce(mobile_money_account_name,'')) <= 120 and
    length(coalesce(mobile_money_number,'')) <= 80 and
    length(coalesce(payment_instructions,'')) <= 1000
  )
);
alter table public.device_service_payment_settings enable row level security;
drop policy if exists device_service_payment_settings_owner on public.device_service_payment_settings;
create policy device_service_payment_settings_owner on public.device_service_payment_settings
 for all to authenticated using (public.is_platform_developer())
 with check (public.is_platform_developer());
revoke all on public.device_service_payment_settings from anon, public;
grant select,insert,update on public.device_service_payment_settings to authenticated;

create table if not exists public.device_service_payment_claims (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 order_id uuid not null references public.phone_unlocking_orders(id) on delete cascade,
 payment_method text not null check (payment_method in ('bank_transfer','mobile_money','cash','other')),
 payer_name text,
 payer_phone text,
 payment_reference text not null,
 amount_claimed numeric(18,2) not null check (amount_claimed > 0),
 status text not null default 'pending' check (status in ('pending','verified','rejected')),
 submitted_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_note text,
 unique(order_id,payment_reference)
);
create index if not exists device_service_payment_claims_queue_idx
 on public.device_service_payment_claims(business_id,status,submitted_at desc);
alter table public.device_service_payment_claims enable row level security;
drop policy if exists device_service_payment_claims_owner_read on public.device_service_payment_claims;
create policy device_service_payment_claims_owner_read on public.device_service_payment_claims
 for select to authenticated using (public.is_platform_developer());
revoke all on public.device_service_payment_claims from anon,authenticated,public;
grant select on public.device_service_payment_claims to authenticated;

create table if not exists public.device_service_operational_events (
 id bigint generated always as identity primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 order_id uuid references public.phone_unlocking_orders(id) on delete set null,
 event_type text not null,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 acknowledged_at timestamptz
);
create index if not exists device_service_events_unread_idx
 on public.device_service_operational_events(business_id,created_at desc) where acknowledged_at is null;
alter table public.device_service_operational_events enable row level security;
drop policy if exists device_service_events_owner_read on public.device_service_operational_events;
create policy device_service_events_owner_read on public.device_service_operational_events
 for select to authenticated using (public.is_platform_developer());
revoke all on public.device_service_operational_events from anon,public;
grant select,update on public.device_service_operational_events to authenticated;

create or replace function public.log_device_service_order_event()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if tg_op='INSERT' then
  insert into public.device_service_operational_events(business_id,order_id,event_type,payload)
  values(new.business_id,new.id,'new_customer_order',jsonb_build_object(
   'reference',new.reference,'customer_name',new.customer_name,'customer_phone',new.customer_phone,
   'service_name',new.service_name,'service_price',new.service_price,'currency','SLE'));
 elsif new.status is distinct from old.status then
  insert into public.device_service_operational_events(business_id,order_id,event_type,payload)
  values(new.business_id,new.id,'order_status_changed',jsonb_build_object(
   'reference',new.reference,'from',old.status,'to',new.status));
 end if;
 return new;
end $$;
drop trigger if exists device_service_order_event_trigger on public.phone_unlocking_orders;
create trigger device_service_order_event_trigger
 after insert or update of status on public.phone_unlocking_orders
 for each row execute function public.log_device_service_order_event();

create or replace function public.submit_public_device_payment_claim(
 p_slug text,p_reference text,p_customer_phone text,p_payment_method text,
 p_payment_reference text,p_amount numeric,p_payer_name text default null
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_order public.phone_unlocking_orders%rowtype; v_store public.phone_unlocking_storefronts%rowtype; v_claim uuid;
begin
 if length(trim(coalesce(p_reference,'')))<8 or length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'))<5 then
  raise exception 'Enter your order reference and the phone number used when ordering';
 end if;
 if p_payment_method not in ('bank_transfer','mobile_money','cash','other') then raise exception 'Choose a valid payment method'; end if;
 if length(trim(coalesce(p_payment_reference,'')))<3 then raise exception 'Enter the transaction reference or payment identifier'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Enter the amount you paid'; end if;
 select s.* into v_store from public.phone_unlocking_storefronts s
 where s.slug=lower(trim(p_slug)) and s.is_published;
 if not found then raise exception 'Store not found'; end if;
 select o.* into v_order from public.phone_unlocking_orders o
 where o.business_id=v_store.business_id and upper(o.reference)=upper(trim(p_reference))
 and regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')
 for update;
 if not found then raise exception 'Order reference and phone number did not match'; end if;
 if p_amount > greatest(0,v_order.service_price-v_order.amount_paid) then raise exception 'Claimed amount is greater than the outstanding balance'; end if;
 insert into public.device_service_payment_claims(business_id,order_id,payment_method,payer_name,payer_phone,payment_reference,amount_claimed)
 values(v_order.business_id,v_order.id,p_payment_method,nullif(left(trim(coalesce(p_payer_name,'')),120),''),left(trim(p_customer_phone),40),left(trim(p_payment_reference),160),p_amount)
 returning id into v_claim;
 insert into public.device_service_operational_events(business_id,order_id,event_type,payload)
 values(v_order.business_id,v_order.id,'customer_payment_claim_submitted',jsonb_build_object('reference',v_order.reference,'amount_claimed',p_amount,'payment_method',p_payment_method));
 return jsonb_build_object('ok',true,'message','Payment details submitted. Your payment is not confirmed until White Lion verifies the funds.','claim_id',v_claim);
exception when unique_violation then
 raise exception 'This payment reference has already been submitted for this order';
end $$;

create or replace function public.review_public_device_payment_claim(
 p_claim_id uuid,p_decision text,p_review_note text default null
) returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_claim public.device_service_payment_claims%rowtype;
begin
 if auth.uid() is null or not public.is_platform_developer() then raise exception 'Only the registered platform developer can review payment claims'; end if;
 if p_decision not in ('verified','rejected') then raise exception 'Choose verified or rejected'; end if;
 select * into v_claim from public.device_service_payment_claims where id=p_claim_id for update;
 if not found then raise exception 'Payment claim not found'; end if;
 if v_claim.status<>'pending' then raise exception 'This payment claim has already been reviewed'; end if;
 if p_decision='verified' then
  perform public.record_phone_unlocking_payment(v_claim.business_id,v_claim.order_id,v_claim.amount_claimed,
   v_claim.payment_method,v_claim.payment_reference,'Customer-submitted payment claim verified by owner');
 end if;
 update public.device_service_payment_claims set status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),
  review_note=nullif(left(trim(coalesce(p_review_note,'')),500),'') where id=p_claim_id;
 insert into public.device_service_operational_events(business_id,order_id,event_type,payload)
 values(v_claim.business_id,v_claim.order_id,'payment_claim_'||p_decision,
  jsonb_build_object('amount',v_claim.amount_claimed,'payment_reference',v_claim.payment_reference));
end $$;

create or replace view public.device_service_financial_summary as
select o.business_id,
 count(*) as order_count,
 coalesce(sum(o.service_price),0)::numeric(18,2) as booked_sales,
 coalesce(sum(o.amount_paid),0)::numeric(18,2) as gross_customer_receipts,
 coalesce(sum(o.amount_refunded),0)::numeric(18,2) as customer_refunds,
 coalesce(sum(o.amount_paid-o.amount_refunded),0)::numeric(18,2) as net_customer_receipts,
 coalesce(sum(case when o.status='completed' then o.provider_cost else 0 end),0)::numeric(18,2) as recorded_provider_costs,
 coalesce(sum(case when o.status='completed' then o.amount_paid-o.amount_refunded-o.provider_cost else 0 end),0)::numeric(18,2) as estimated_completed_margin
from public.phone_unlocking_orders o group by o.business_id;
revoke all on public.device_service_financial_summary from public,anon;
grant select on public.device_service_financial_summary to authenticated;

revoke all on function public.submit_public_device_payment_claim(text,text,text,text,text,numeric,text) from public;
grant execute on function public.submit_public_device_payment_claim(text,text,text,text,text,numeric,text) to anon,authenticated;
revoke all on function public.review_public_device_payment_claim(uuid,text,text) from public,anon;
grant execute on function public.review_public_device_payment_claim(uuid,text,text) to authenticated;

commit;
