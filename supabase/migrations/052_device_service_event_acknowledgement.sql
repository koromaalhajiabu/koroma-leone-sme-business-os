-- Allow the registered platform developer to acknowledge operational events.
begin;
drop policy if exists device_service_events_owner_update on public.device_service_operational_events;
create policy device_service_events_owner_update
on public.device_service_operational_events
for update to authenticated
using (public.is_platform_developer())
with check (public.is_platform_developer());
commit;
