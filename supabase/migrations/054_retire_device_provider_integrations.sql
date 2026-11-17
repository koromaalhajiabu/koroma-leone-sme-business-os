-- Retire external phone/device provider catalogues without deleting customer history.
begin;

update public.phone_unlocking_provider_services
set is_active = false
where provider_key in ('devicedecoded','imei_org','servicecoded');

-- Keep provider connection/history rows and all customer orders/payments for audit.
commit;
