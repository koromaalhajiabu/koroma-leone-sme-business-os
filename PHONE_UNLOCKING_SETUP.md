# White Lion Device Services & Repair Centre — provider setup

The legacy Mobile-Unlock integration has been retired from the application source. Existing customer services, orders, payments, refunds and historical catalogue rows are preserved. Historical Mobile-Unlock catalogue rows are marked inactive by migration 036.

## 1. Database migration
Run `supabase/migrations/036_multi_provider_device_services.sql` once in the Supabase SQL Editor.

## 2. Deploy the replacement catalogue gateway
Deploy `supabase/functions/device-services-provider/index.ts` as `device-services-provider`:
```sh
supabase functions deploy device-services-provider --project-ref YOUR_PROJECT_REF
```
Add `IMEI_ORG_API_KEY` in Supabase Edge Function secrets using the key from your own IMEI.org account. Never put API keys in GitHub Pages or browser code.

## 3. Provider support status
- **DeviceDecoded:** live public service catalogue adapter is implemented. The published endpoint does not require a key. Paid device checks and orders are not enabled in this release.
- **IMEI.org:** live service catalogue adapter is implemented. Add `IMEI_ORG_API_KEY` before syncing.
- **IMEI.info:** requires funded API access and confirmed account credentials/API contract; integration is not enabled yet.
- **GSMA Device Check:** requires commercial onboarding and private API documentation; integration is not enabled yet.

## 4. App usage
Open the Device Services & Repair Centre, choose DeviceDecoded or IMEI.org, and select **Sync selected provider catalogue**. Syncing a catalogue does not submit an order or spend provider credit. Set your own customer selling price separately from provider cost.

## 5. Important safety controls
Provider order submission is disabled for all replacement providers until their order endpoints, balance checks, duplicate protection, result polling and error reconciliation are implemented and tested. Customer orders can still be recorded, paid, approved and processed manually. Hardware faults require technician inspection. Apple Activation Lock and Google FRP must use legitimate owner recovery; no bypass workflow is offered.

## 6. Remove the old deployed integration
In Supabase Dashboard → Edge Functions, delete the deployed `mobile-unlock-provider` function. In Edge Function Secrets, delete `MOBILE_UNLOCK_API_KEY`. The source file has been removed from this repository. Do not delete the existing phone service/order/payment/refund tables.
