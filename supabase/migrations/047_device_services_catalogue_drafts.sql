-- Prepare the synced provider catalogue as private, inactive customer-service drafts.
-- No service is published, no customer order is created, and no provider credits are spent.
begin;

do $prepare$
declare
  v_business uuid;
  v_developer uuid := 'f8cc232f-4021-487a-8f42-2234c3f6c94c';
  v_inserted integer := 0;
begin
  select business_id into v_business
  from public.platform_device_services_config
  where singleton=true;

  if v_business is null then
    raise exception 'Independent White Lion Device Services platform is not configured.';
  end if;

  insert into public.phone_unlocking_services (
    business_id, service_name, description, default_price, is_active, created_by,
    provider_service_id, provider_service_type, provider_group, provider_cost,
    provider_currency, provider_delivery_time, provider_info, provider_requires_custom
  )
  select
    p.business_id,
    left(p.service_name,120),
    left(concat_ws(' · ',p.provider_group,p.description,
      case when p.delivery_time is not null then 'Delivery: '||p.delivery_time end),240),
    0,
    false,
    v_developer,
    p.provider_service_id,
    p.provider_service_type,
    p.provider_group,
    p.provider_credit,
    p.provider_currency,
    p.delivery_time,
    p.description,
    p.requires_custom
  from public.phone_unlocking_provider_services p
  where p.business_id=v_business and p.is_active=true
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.phone_unlocking_storefronts (
    business_id, slug, display_name, description, contact_phone, contact_email,
    is_published, accepts_orders
  ) values (
    v_business, 'white-lion-device-services', 'White Lion Device Services',
    'Browse legitimate phone unlocking and device information services. Customer ordering will open after service pricing and checks are completed.',
    null, null, false, false
  )
  on conflict (business_id) do nothing;

  raise notice 'Prepared % provider services as inactive drafts. Storefront saved but remains unpublished and closed to orders.', v_inserted;
end;
$prepare$;

commit;

select
  count(*) as total_customer_catalogue_services,
  count(*) filter (where is_active=false and default_price=0) as inactive_zero_price_drafts,
  count(*) filter (where is_active=true) as active_customer_services
from public.phone_unlocking_services
where business_id=(select business_id from public.platform_device_services_config where singleton=true);

select slug,display_name,is_published,accepts_orders
from public.phone_unlocking_storefronts
where business_id=(select business_id from public.platform_device_services_config where singleton=true);
