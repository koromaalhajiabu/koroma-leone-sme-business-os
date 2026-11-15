-- Public guest ordering for the single-operator White Lion Device Services storefront.
-- Customers can browse published services, submit orders without accounts, and track
-- their own order using the order reference plus the phone number they supplied.
begin;

create table if not exists public.phone_unlocking_storefronts (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  display_name text not null default 'White Lion Device Services',
  description text,
  contact_phone text,
  contact_email text,
  is_published boolean not null default false,
  accepts_orders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.phone_unlocking_orders
  alter column created_by drop not null,
  add column if not exists customer_email text;

alter table public.phone_unlocking_storefronts enable row level security;
drop policy if exists phone_unlocking_storefronts_owner_read on public.phone_unlocking_storefronts;
create policy phone_unlocking_storefronts_owner_read
  on public.phone_unlocking_storefronts for select to authenticated
  using (public.is_platform_developer());
drop policy if exists phone_unlocking_storefronts_owner_manage on public.phone_unlocking_storefronts;
create policy phone_unlocking_storefronts_owner_manage
  on public.phone_unlocking_storefronts for all to authenticated
  using (public.is_platform_developer())
  with check (public.is_platform_developer());
revoke all on public.phone_unlocking_storefronts from anon, authenticated;
grant select on public.phone_unlocking_storefronts to authenticated;

create or replace function public.save_phone_unlocking_storefront(
  p_business_id uuid, p_slug text, p_display_name text, p_description text default null,
  p_contact_phone text default null, p_contact_email text default null,
  p_is_published boolean default false, p_accepts_orders boolean default false
) returns jsonb
language plpgsql security definer set search_path=public,auth
as $fn$
declare v_row public.phone_unlocking_storefronts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.is_platform_developer() then
    raise exception 'Only the registered White Lion platform developer can publish and manage this device-services store';
  end if;
  if coalesce(p_slug,'') !~ '^[a-z0-9][a-z0-9-]{2,59}$' then
    raise exception 'Store link must use 3–60 lowercase letters, numbers or hyphens';
  end if;
  if length(trim(coalesce(p_display_name,''))) < 2 then raise exception 'Enter a store name'; end if;
  if p_accepts_orders and not p_is_published then raise exception 'Publish the store before accepting orders'; end if;
  insert into public.phone_unlocking_storefronts(
    business_id,slug,display_name,description,contact_phone,contact_email,is_published,accepts_orders,updated_at
  ) values (
    p_business_id,lower(trim(p_slug)),left(trim(p_display_name),100),
    nullif(left(trim(coalesce(p_description,'')),500),''),
    nullif(left(trim(coalesce(p_contact_phone,'')),40),''),
    nullif(left(trim(coalesce(p_contact_email,'')),160),''),
    coalesce(p_is_published,false),coalesce(p_accepts_orders,false),now()
  )
  on conflict (business_id) do update set
    slug=excluded.slug,display_name=excluded.display_name,description=excluded.description,
    contact_phone=excluded.contact_phone,contact_email=excluded.contact_email,
    is_published=excluded.is_published,accepts_orders=excluded.accepts_orders,updated_at=now()
  returning * into v_row;
  return jsonb_build_object('ok',true,'slug',v_row.slug,'is_published',v_row.is_published,'accepts_orders',v_row.accepts_orders);
exception when unique_violation then
  raise exception 'That public store link is already in use. Choose another link.';
end;
$fn$;

create or replace function public.get_public_device_services(p_slug text)
returns jsonb language plpgsql security definer set search_path=public
as $fn$
declare v_store public.phone_unlocking_storefronts%rowtype; v_currency text; v_services jsonb;
begin
  select s.* into v_store from public.phone_unlocking_storefronts s
  where s.slug=lower(trim(coalesce(p_slug,''))) and s.is_published and s.accepts_orders;
  if not found then return jsonb_build_object('ok',false,'message','This service store is unavailable or is not accepting orders.'); end if;
  select b.currency_code into v_currency from public.businesses b where b.id=v_store.business_id;
  if not exists(select 1 from public.business_industry_modules m where m.business_id=v_store.business_id and m.module_key='phone_unlocking' and m.is_enabled) then
    return jsonb_build_object('ok',false,'message','This service store is temporarily unavailable.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'service_name',service_name,'description',description,'price',default_price
  ) order by service_name),'[]'::jsonb)
  into v_services from public.phone_unlocking_services
  where business_id=v_store.business_id and is_active;
  return jsonb_build_object('ok',true,'store',jsonb_build_object(
    'display_name',v_store.display_name,'description',v_store.description,
    'contact_phone',v_store.contact_phone,'contact_email',v_store.contact_email,
    'currency_code',coalesce(v_currency,'SLE')
  ),'services',v_services);
end;
$fn$;

create or replace function public.submit_public_device_service_order(
  p_slug text,p_customer_name text,p_customer_phone text,p_customer_email text,
  p_device_brand text,p_device_model text,p_imei text,p_network_name text,
  p_country text,p_service_id uuid,p_customer_notes text default null
) returns jsonb language plpgsql security definer set search_path=public
as $fn$
declare
  v_store public.phone_unlocking_storefronts%rowtype;
  v_service public.phone_unlocking_services%rowtype;
  v_branch uuid;
  v_order_id uuid:=gen_random_uuid();
  v_reference text;
  v_currency text;
begin
  if length(trim(coalesce(p_customer_name,'')))<2 then raise exception 'Enter your full name'; end if;
  if length(trim(coalesce(p_customer_phone,'')))<5 then raise exception 'Enter a valid phone number'; end if;
  if coalesce(p_customer_email,'')<>'' and p_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if length(trim(coalesce(p_device_brand,'')))<2 or length(trim(coalesce(p_device_model,'')))<1 then raise exception 'Enter the phone brand and model'; end if;
  if coalesce(p_imei,'') !~ '^[0-9]{14,16}$' then raise exception 'Enter a valid 14–16 digit IMEI'; end if;
  if length(trim(coalesce(p_network_name,'')))<2 then raise exception 'Enter the original network or carrier'; end if;
  select * into v_store from public.phone_unlocking_storefronts
   where slug=lower(trim(coalesce(p_slug,''))) and is_published and accepts_orders for update;
  if not found then raise exception 'This service store is not accepting orders'; end if;
  select b.currency_code into v_currency from public.businesses b where b.id=v_store.business_id;
  if not exists(select 1 from public.business_industry_modules m where m.business_id=v_store.business_id and m.module_key='phone_unlocking' and m.is_enabled) then
    raise exception 'This service store is temporarily unavailable';
  end if;
  select * into v_service from public.phone_unlocking_services
   where id=p_service_id and business_id=v_store.business_id and is_active;
  if not found then raise exception 'The selected service is no longer available. Refresh the service list.'; end if;
  select id into v_branch from public.branches where business_id=v_store.business_id and is_active order by created_at asc limit 1;
  if v_branch is null then raise exception 'The business has no active branch configured to receive orders'; end if;
  v_reference:='WLD-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.phone_unlocking_orders(
    id,business_id,branch_id,reference,customer_name,customer_phone,customer_email,
    device_brand,device_model,imei,network_name,country,service_name,
    provider_cost,service_price,notes,status,created_by,provider_service_id,provider_service_type
  ) values (
    v_order_id,v_store.business_id,v_branch,v_reference,left(trim(p_customer_name),120),
    left(trim(p_customer_phone),40),nullif(left(trim(coalesce(p_customer_email,'')),160),''),
    left(trim(p_device_brand),80),left(trim(p_device_model),100),p_imei,left(trim(p_network_name),100),
    nullif(left(trim(coalesce(p_country,'')),80),''),v_service.service_name,
    0,v_service.default_price,
    nullif(left(trim(coalesce(p_customer_notes,'')),1000),''),
    'received',null,null,null
  );
  return jsonb_build_object('ok',true,'reference',v_reference,'service_name',v_service.service_name,
    'service_price',v_service.default_price,'currency_code',coalesce(v_currency,'SLE'),
    'message','Your request has been received. We will contact you to confirm payment and processing.');
end;
$fn$;

create or replace function public.get_public_device_order_status(p_reference text,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path=public
as $fn$
declare v_order public.phone_unlocking_orders%rowtype; v_currency text;
begin
  if length(trim(coalesce(p_reference,'')))<8 or length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'))<5 then
    return jsonb_build_object('ok',false,'message','Enter your order reference and the phone number used when ordering.');
  end if;
  select o.* into v_order from public.phone_unlocking_orders o
  where upper(o.reference)=upper(trim(p_reference))
    and regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')
  limit 1;
  if not found then return jsonb_build_object('ok',false,'message','No matching order was found. Check the reference and phone number.'); end if;
  select b.currency_code into v_currency from public.businesses b where b.id=v_order.business_id;
  return jsonb_build_object('ok',true,'order',jsonb_build_object(
    'reference',v_order.reference,'customer_name',v_order.customer_name,
    'device_brand',v_order.device_brand,'device_model',v_order.device_model,
    'service_name',v_order.service_name,'service_price',v_order.service_price,
    'amount_paid',v_order.amount_paid,'status',v_order.status,
    'created_at',v_order.created_at,'updated_at',v_order.updated_at,
    'currency_code',coalesce(v_currency,'SLE')
  ));
end;
$fn$;

revoke all on function public.save_phone_unlocking_storefront(uuid,text,text,text,text,text,boolean,boolean) from public,anon;
revoke all on function public.get_public_device_services(text) from public;
revoke all on function public.submit_public_device_service_order(text,text,text,text,text,text,text,text,text,uuid,text) from public;
revoke all on function public.get_public_device_order_status(text,text) from public;
grant execute on function public.save_phone_unlocking_storefront(uuid,text,text,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.get_public_device_services(text) to anon,authenticated;
grant execute on function public.submit_public_device_service_order(text,text,text,text,text,text,text,text,text,uuid,text) to anon,authenticated;
grant execute on function public.get_public_device_order_status(text,text) to anon,authenticated;

commit;
