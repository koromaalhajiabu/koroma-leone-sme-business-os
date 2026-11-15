begin;
alter table public.phone_unlocking_provider_services add column if not exists provider_key text not null default 'legacy_mobile_unlock';
update public.phone_unlocking_provider_services set is_active=false where provider_key='legacy_mobile_unlock';
alter table public.phone_unlocking_provider_services drop constraint if exists phone_unlocking_provider_services_business_id_provider_service_type_provider_service_id_key;
drop index if exists public.phone_unlocking_provider_services_business_idx;
create unique index if not exists phone_unlocking_provider_services_provider_unique on public.phone_unlocking_provider_services(business_id,provider_key,provider_service_type,provider_service_id);
create index if not exists phone_unlocking_provider_services_business_idx on public.phone_unlocking_provider_services(business_id,provider_key,is_active,provider_group,service_name);
create table if not exists public.phone_unlocking_provider_connections (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 provider_key text not null check(provider_key in ('devicedecoded','imei_org','imei_info','gsma')),
 connection_status text not null default 'not_configured' check(connection_status in ('not_configured','connected','error','onboarding_required')),
 last_synced_at timestamptz, last_error text, updated_at timestamptz not null default now(), unique(business_id,provider_key)
);
alter table public.phone_unlocking_provider_connections enable row level security;
drop policy if exists phone_unlocking_provider_connections_read on public.phone_unlocking_provider_connections;
create policy phone_unlocking_provider_connections_read on public.phone_unlocking_provider_connections for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));
drop policy if exists phone_unlocking_provider_connections_manage on public.phone_unlocking_provider_connections;
create policy phone_unlocking_provider_connections_manage on public.phone_unlocking_provider_connections for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])) with check(public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));
revoke all on public.phone_unlocking_provider_connections from anon;
grant select,insert,update on public.phone_unlocking_provider_connections to authenticated;
commit;
