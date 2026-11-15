# White Lion Device Services & Repair Centre — provider setup

## Independent platform ownership
Device Services is a separate White Lion platform business, not an optional module in customer SME workspaces. Apply `supabase/migrations/046_independent_device_services_platform.sql` after the existing Device Services migrations (033–039). It creates a developer-only platform tenant and operations branch, moves the existing provider catalogue and provider connection to that tenant, removes the Phone Unlocking module from ordinary SME businesses, and exposes a secure context RPC. The migration intentionally stops if legacy orders, payments, refunds or storefront records exist rather than reassigning customer-linked records unsafely. The original `White lion Tech Solutions` SME business remains intact.

The legacy Mobile-Unlock integration has been retired from the application source. Existing customer services, orders, payments, refunds and historical catalogue rows are preserved. Historical Mobile-Unlock catalogue rows are marked inactive by migration 036.

## 1. Database migrations
If this is a fresh installation, apply the required Device Services migrations in numerical order (033–039), then apply `supabase/migrations/046_independent_device_services_platform.sql` in the Supabase SQL Editor. If migrations 033–039 are already installed, apply only migration 046. Do not paste the SQL into a browser console.

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
Sign in with the registered platform developer account and open **WHITE LION DEVICE SERVICES** inside the Developer Dashboard. The panel uses the independent platform tenant and is not affected by the selected SME workspace. Choose DeviceDecoded or IMEI.org, then select **Sync selected provider catalogue**. Syncing a catalogue does not submit an order or spend provider credit. Set your own customer selling price separately from provider cost.

## 5. Important safety controls
Provider order submission is disabled for all replacement providers until their order endpoints, balance checks, duplicate protection, result polling and error reconciliation are implemented and tested. Customer orders can still be recorded, paid, approved and processed manually. Hardware faults require technician inspection. Apple Activation Lock and Google FRP must use legitimate owner recovery; no bypass workflow is offered.

## 6. Remove the old deployed integration
In Supabase Dashboard → Edge Functions, delete the deployed `mobile-unlock-provider` function. In Edge Function Secrets, delete `MOBILE_UNLOCK_API_KEY`. The source file has been removed from this repository. Do not delete the existing phone service/order/payment/refund tables.
