-- Harden the legacy device-services financial summary.
-- The device-services module has been retired, but its historical tables are retained.
-- Make the view obey the caller's permissions and the underlying table's RLS policies.
begin;

alter view public.device_service_financial_summary
  set (security_invoker = true);

commit;
