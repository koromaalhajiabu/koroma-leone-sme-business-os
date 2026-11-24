# Koroma Leone Tech Business Operating System

A multi-industry SME operations platform by Koroma Leone Tech. The frontend is deployed as a static Progressive Web App through GitHub Pages; Supabase provides authentication, cloud data and tenant security.

**Developer:** Designed by Alhaji Abu Koroma  
**Live application:** https://koromaalhajiabu.github.io/koroma-leone-sme-business-os/  
**Repository:** https://github.com/koromaalhajiabu/koroma-leone-sme-business-os

## Platform capabilities

- Multi-industry business profiles and workspace membership. 
- Sales/POS, products, purchasing, customers, suppliers and expenses.
- Cloud HR employee directory, daily attendance register and payroll runs with draft review, approval, deductions and payment-reference recording.
- Customer loyalty accounts, points ledger, redemption controls and balance-based reward tiers.
- Online storefront and customer orders; delivery dispatch, rider management and public tracking.
- Supplier portal and procurement intelligence; executive insights and business automation.
- Supabase authentication, business membership and row-level security.
- IndexedDB local persistence and offline transaction synchronisation.
- Multi-branch operations, branch access and stock transfers.
- Returns/refunds, cashbook, receivables/payables and financial payment records.
- Barcode, batch/expiry and controlled stock adjustment features.
- Private business document storage.
- Optional tenant-scoped Hospital Management for hospital and clinic workspaces: patient registration, appointments, clinical encounters, observations and diagnoses, admissions and bed occupancy, medicine stock and prescription dispensing, laboratory requests, invoices/payments, and staff/departments. Patient and clinical data is cloud-only and role-scoped; it is not stored in the offline cache. Hospital staff accounts can be linked by verified email to existing platform accounts; linked users receive a viewer workspace role unless they already hold another role, while their hospital staff role controls clinical module permissions.
- Sports and local-league competition management, plus the Football Club Website Studio for managing separate client club websites.
- Developer administration, account controls and business/platform audit logging.
- English, French, Arabic (RTL), Spanish, Hindi and Simplified Chinese language options.
- Responsive PWA shell, install support, service-worker caching and light/dark appearance.

## Football Club Website Studio

The Football Club Website Studio is an optional business workspace tool and a central service for the Koroma Leone Tech platform developer. It manages multiple club websites from the same SME OS while keeping every club's content and enquiries scoped to that club's business workspace.

Website features include club identity and colour branding; crest and banner media uploads; editable public pages; news and match reports; player profiles and squad groups; coaching and staff profiles; fixtures and results; league standings; transfer announcements; photo/video galleries; sponsor listings; academy, trial and community events; honours and trophies; SEO title and description fields; publication and unpublication controls; and a private club enquiry inbox.

Public club websites use the GitHub Pages entry page `club-website.html?slug=<club-slug>`. Once a club website is published, its manager sees copy-link and share controls inside the Studio and can send the same public link to international scouts, agents, sponsors, supporters and the public. Public visitors can read published website content and submit a club enquiry. They cannot access draft content, website administration or the enquiry inbox. Club owners, administrators and managers can manage their own club website. The platform developer can centrally create club sites, but cannot manage a client site until that club explicitly authorises Koroma Leone Tech. Each club can choose direct publishing or require manager approval before developer-submitted content goes live. The club can suspend, restore or revoke the developer's access at any time. Delegated access can be limited separately for club identity, pages, news, players, staff, fixtures/results, standings, transfers, gallery, sponsors, events, honours and the private enquiry inbox. Row-level security and storage policies enforce these scopes. Direct database writes are blocked when approval-required mode is selected; proposed public-content edits must use the approval workflow.

The Management authorisation tab lets the club approve or suspend Koroma Leone Tech's access and select its publishing policy. In approval-required mode, developer-submitted inserts, edits, profile changes and deletions are staged in the manager's Approval inbox; the manager can approve or reject each request with a note. Changes to club content, approval decisions and delegation changes are recorded in the Activity history. Notifications are sent to the club's active owners/managers when the developer submits content or makes direct-mode changes, and to the developer when the club changes access or reviews a request. The developer's directory only opens clubs with an active authorisation.

Club media is stored in the public `club-website-media` Supabase Storage bucket. Uploads require an authenticated club website manager, are stored under the club business ID, and are limited to 50 MB per file for JPG, PNG, WEBP, GIF, MP4 and WEBM media.

**Current implementation limits:** club fixtures and scores are entered by authorised club staff; there is no automatic live-data feed. Shop, ticketing and membership fields link to external services and do not create a built-in payment or ticketing checkout. Club sites currently use the shared GitHub Pages domain and slug-based URLs; individual custom domains require separate DNS and hosting configuration.

Database setup is recorded in the club website and delegation SQL migrations under `supabase/migrations/` and has been applied to the connected Koroma Leone Tech Supabase project. GitHub Pages automatically builds and publishes from the repository's configured Pages source; the built-in Pages build-and-deployment workflow is the single publishing path.

## Hospital Management module

The Hospital Management workspace is an optional business module for hospital, clinic, medical-centre and diagnostic-facility workspaces. It is integrated with the active Koroma Leone Tech Supabase project and uses the current business workspace as its tenant boundary.

Hospital access is restricted through Row Level Security and linked hospital staff roles. A hospital staff account must also be an active member of the relevant business workspace. Business owners, administrators and managers have workspace-level management access; clinical, reception, pharmacy, laboratory and billing actions are separated by role.

**Development status:** this is an active development release, not a certified clinical record system. The current version provides the core records and workflow screens, but it still requires end-to-end testing with separate role accounts, independent security review, clinical workflow validation, backup/restore testing and review against applicable Sierra Leone health and privacy requirements before real patient information is used. Clinical data is deliberately excluded from offline local persistence.

## Retired device-provider integrations

DeviceDecoded, IMEI.org and ServiceCoded integrations and the former phone-unlocking/device-services interface have been retired. The SME OS does not provide phone unlocking or security-lock bypass services. Historical database migrations and records remain for audit continuity; apply `supabase/migrations/054_retire_device_provider_integrations.sql` to deactivate previously synced provider catalogue entries. See [PHONE_UNLOCKING_SETUP.md](PHONE_UNLOCKING_SETUP.md) for the retirement checklist.

## Technology and deployment

- Frontend: HTML, CSS and JavaScript.
- Hosting: GitHub Pages.
- Cloud: Supabase.
- Local persistence: IndexedDB.
- PWA: Web App Manifest and Service Worker.

Do not add a Supabase service-role key to browser code or the public repository. Only the intended publishable/anon key may be used in the browser, with Row Level Security correctly configured.

## Database setup

SQL migrations are in `supabase/migrations/`. The HR/payroll and customer-loyalty enhancement is recorded in `supabase/migrations/055_hr_loyalty_workflows.sql`; the business-scoped attendance register is in `supabase/migrations/056_employee_attendance_register.sql`, with least-privilege role policies refined in `supabase/migrations/057_attendance_policy_roles.sql`. It adds the transactional `apply_customer_loyalty_points` RPC; the employee and payroll tables were already present. The HR/payroll UI records payroll drafts and approvals but does not initiate bank/mobile-money transfers or calculate statutory tax automatically. Configure and review deductions under applicable local rules. Loyalty tiers use default balance thresholds (Bronze 100+, Silver 500+, Gold 1,000+) in this release.\n\nThe consolidated operations installer is:

`supabase/INSTALL_ALL_OPERATIONS.sql`

This is a legacy operations installer, not a complete installer for every migration in the repository. Review each later numbered migration and apply it only when its prerequisites and current project state have been checked.

The installer includes the business operations, inventory/finance controls and the bank/mobile-money statement reconciliation foundation. Review the SQL and execute it in the correct Supabase project. A GitHub commit does not execute database migrations automatically.

### Historical accounting, opening balances and period controls

Apply `supabase/migrations/045_historical_backfill_opening_balances_period_close.sql` in the Supabase SQL Editor after migrations 018, 019 and 028 are installed and verified. This migration does not automatically post historical data. An authorised owner, administrator or accountant must explicitly call the secured RPCs from an authenticated application session:

- `backfill_accounting_history(business_id)` — posts eligible historical cloud sales, offline sales, purchases, expenses and recorded offline refunds once. Local-only device transactions must be synchronised first. Historical COGS is included only when a recorded cost exists; missing costs are not estimated.
- `post_accounting_opening_balances(business_id, effective_date, balances_json)` — posts one opening-balance journal and calculates the Owner capital balancing line.
- `reverse_accounting_journal(business_id, journal_id, reversal_date, reason)` — creates an immutable equal-and-opposite journal; it never edits the original.
- `close_accounting_period(business_id, period_start, period_end)` — transfers period income/expenses to retained earnings and blocks new journals dated in the closed period.

The migration also enables the Accounting workflow controls panel in Business Intelligence for eligible finance users. Test the controls in a non-production business first and reconcile source records to bank, supplier, customer and inventory evidence before posting.

### Bank and mobile-money reconciliation

Migration 017 adds:
- Business-scoped bank and mobile-money account records.
- Statement-line import through a role-checked RPC.
- Duplicate external-reference protection.
- Matching to cashbook entries with account, amount and debit/credit validation.
- Audit log events for imports and matches.

This is a manual statement import and matching foundation. It does not connect directly to a bank or mobile-money provider. Migration 017 must be installed for the reconciliation screen.

## Accounting, security and backup limitations

- Migrations 018 and 019 provide the double-entry ledger, chart of accounts, balanced journals, trial balance, Profit & Loss, Balance Sheet, cash-flow reporting, moving weighted-average stock valuation and COGS posting foundation. Migration 045 adds explicit historical transaction backfill, one-time opening balances, immutable journal reversals and accounting-period close locks. Migration 045 is a separate SQL migration and must be applied manually in Supabase; GitHub Pages commits do not execute database migrations. Review the business data and cutover date before invoking its backfill or opening-balance RPCs.
- Existing operational dashboard totals are not audited net profit or available cash. Do not use the platform as the sole statutory accounting record until independent accounting acceptance tests are complete.
- The browser JSON export is a local-device backup, not a full Supabase backup.
- A scheduled encrypted logical JSON + Auth metadata + private Storage backup workflow is in `.github/workflows/supabase-backup.yml`. It reads the `SUPABASE_SERVICE_ROLE_KEY` and `BACKUP_ENCRYPTION_PASSPHRASE` GitHub Actions secrets. It is not a physical PostgreSQL dump; a full recovery test in a separate Supabase project is still required.
- Subscription plans, business trials, invoice records, payment submissions and administrator verification are present in the repository migrations and billing interface. Payments are manually submitted and verified; direct Orange Money/AfriMoney/bank API checkout, automated recurring collection and independent end-to-end billing acceptance remain outstanding. Do not advertise automatic provider integration.

## Production readiness

Run the read-only [production security audit](supabase/PRODUCTION_SECURITY_AUDIT.sql) in the Supabase SQL Editor before launch. It reports RLS coverage, public grants and SECURITY DEFINER functions for review; it does not modify data or certify tenant isolation.

Migration 058 hardens the retained legacy device-services financial view by enabling invoker permissions and underlying-table RLS. Migration 059 restricts platform administration and branch transaction RPC grants to authenticated callers and disables the legacy auto-first-branch sync RPC. See [PROFESSIONAL_READINESS.md](PROFESSIONAL_READINESS.md) for the feature inventory, known gaps, security follow-up and required acceptance tests.

See [BACKUP_GUIDE.md](BACKUP_GUIDE.md) for GitHub Actions secret setup, encrypted backups, integrity checks and recovery instructions.

## Local run

Serve the repository over HTTPS or localhost for service-worker and PWA behaviour. Opening the HTML file directly with a `file://` URL does not provide the full PWA experience.


### Financial integrity hardening

Migration 063 adds database-level checks for sales discounts, payment limits and sale/purchase line arithmetic; tightens the canonical sale RPC; and restricts internal accounting journal helpers and selected finance RPCs to their intended API roles. It is applied to the connected Supabase project. See [PROFESSIONAL_READINESS.md](PROFESSIONAL_READINESS.md) for the verification results and remaining acceptance tests.


### Financial ageing, commitments forecast and controlled period reopening

Migration 064 adds business-scoped receivables/payables ageing and a 90-day contractual cash-commitments forecast to Business Intelligence. These reports include only entered, open or part-paid obligations; they are not forecasts of unentered sales or bank-confirmed cash. The migration also restricts bank statement import/matching RPC grants to authenticated users and adds owner/admin-controlled period reopening. Reopening requires a reason, reverses the original closing journal without editing it, and is audited; a re-closed period is locked again. Apply and acceptance-test migration 064 before using these controls on live accounting records.


Business Intelligence also displays rule-based in-app financial anomaly alerts for overdue customer/supplier obligations and near-term contractual cash gaps. These are management alerts from recorded data, not push notifications, fraud detection or bank monitoring.


### Subscription notification centre

Migration 065 adds a private, owner-scoped in-app notification table and a daily scheduled generator for 7-day, 3-day and 1-day subscription renewal reminders, overdue unpaid invoices, verified payments, grace-period starts and expiry events. Notifications are visible only to the signed-in owner who owns the relevant workspace. Migration 066 restricts customer updates to the read-state field only. The notification centre is loaded from `subscription-notifications.js`; it uses the existing authenticated Supabase session and does not send SMS, email or provider push messages. The existing subscription expiry job and seven-day grace period are preserved.


## External subscription notifications (migrations 067–069)

- Added opt-in email, SMS and WhatsApp preferences with recorded consent timestamps. All external channels are OFF by default.
- Added a private outbound delivery queue and delivery-attempt history. Queue and attempt tables are inaccessible to browser roles; only the service role can process them.
- New in-app subscription/payment notifications are copied into the queue only for channels the recipient explicitly enabled and supplied a valid destination for.
- Deployed Supabase Edge Function `dispatch-notifications`. It uses Resend for transactional email and Twilio Programmable Messaging for SMS and WhatsApp templates. Provider credentials are read only from Supabase Edge Function secrets; never place them in GitHub or frontend code.
- The scheduled dispatcher runs every five minutes after the two Vault entries `notification_project_url` and `notification_dispatch_key` are created. Until those Vault entries and provider credentials are configured, no external messages are sent. Missing provider credentials block the affected delivery rather than exposing secrets or sending through a fallback.
- Required Edge Function secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`, and `TWILIO_WHATSAPP_CONTENT_SID`. WhatsApp requires an approved Meta/Twilio template whose first two variables map to notification title and body.
- To enable the schedule, create Vault secrets in Supabase SQL Editor (never share the service-role key in chat):
  `select vault.create_secret('https://nclncqlgnxnijlumznnt.supabase.co','notification_project_url');`
  `select vault.create_secret('<PASTE YOUR SUPABASE SERVICE ROLE KEY HERE>','notification_dispatch_key');`
  Then confirm the `koroma-notification-dispatch` job exists in pg_cron. Keep the service-role key only in Vault; do not commit it.
- Before live use, verify sender identity and SMS delivery on Africell, Orange, QCell and Sierratel. Twilio documents that two-way SMS is not supported for Sierra Leone and generic alphanumeric sender IDs may be filtered on Africell. WhatsApp is supported for +232 destinations, but template approval and Meta fees apply.
- The in-app notification centre remains independent and continues to work when all external channels are disabled.

- Delivery callbacks are enabled: Twilio SMS/WhatsApp status callbacks use the signed `twilio-status-webhook`; Resend delivery/bounce/complaint events use the signed `resend-status-webhook`. Configure the Resend webhook URL as `https://nclncqlgnxnijlumznnt.supabase.co/functions/v1/resend-status-webhook` and add `RESEND_WEBHOOK_SECRET` to Edge Function secrets. Twilio status callbacks are automatically attached by the dispatcher. Provider API acceptance and final delivery status are recorded separately.
