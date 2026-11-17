# White Lion SME Business OS — retired device-provider integrations

The DeviceDecoded, IMEI.org and ServiceCoded provider integrations have been retired and removed from the application.

The former provider selector, catalogue synchronisation, provider secret test, provider order submission, independent Device Services panel and phone-unlocking specialist interface are no longer shipped. This application does not unlock devices or bypass Apple Activation Lock, Google FRP, screen locks, MDM or carrier restrictions.

Historical database migrations and existing transaction records are retained for audit safety. Apply `supabase/migrations/054_retire_device_provider_integrations.sql` to mark previously synced provider catalogue entries inactive. Remove the provider API secrets manually from Supabase Dashboard → Project Settings → Edge Functions → Secrets:
- `DEVICEDECODED_API_KEY`
- `IMEI_ORG_API_KEY`
- `SERVICECODED_API_KEY`

Delete the deployed `device-services-provider` Edge Function in Supabase Dashboard → Edge Functions. No customer sales, purchases, inventory, accounting, branch or membership records are affected.
