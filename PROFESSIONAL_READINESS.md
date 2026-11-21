# Koroma Leone SME Business Operating System — Professional Readiness Review

Last reviewed: 21 November 2026

## Existing capabilities found in the repository

- GitHub Pages static frontend with installable PWA shell and service-worker caching.
- Supabase authentication, business memberships, tenant-scoped row-level security and business creation.
- Local IndexedDB records and offline transaction synchronisation with idempotency receipts.
- Multi-branch operations, branch membership, stock transfers and branch-aware transactions.
- Sales, purchasing, expenses, returns/refunds, cashbook, receivables/payables and payment recording.
- Inventory controls including barcode, batch/expiry tracking and controlled stock adjustments.
- Private business document storage with signed downloads.
- Sports and local-league competition, season, club, player, fixture, event and discipline schema.
- Developer account controls and audit logging.\n- Cloud HR employee records, business-scoped daily attendance register and payroll runs with draft/approval/payment-reference workflow.\n- Customer loyalty accounts, point adjustments/redemptions and a transaction ledger.\n- Online storefront, delivery dispatch/tracking, supplier portal and executive/automation workspaces.

These are repository-level findings. They do not independently prove every feature is correctly configured or functioning in the live Supabase project.

## Important gaps and risks

1. **A first double-entry ledger foundation is now implemented in migration 018.** It adds a chart of accounts, balanced immutable journal posting, source triggers for new cloud-synced sales/purchases/expenses/returns and obligation payments, manual journals, trial balance, income statement, balance sheet and cash-flow reports. This is not an audited accounting package. Migration 045 now adds an explicit, repeat-safe backfill for cloud historical posted sales, offline sales, purchases, expenses and recorded offline sale refunds; it uses historical COGS only where source cost records exist and does not estimate missing costs. It also adds one-time opening balance posting (with an automatic owner-capital balancing entry), immutable journal reversal records and accounting-period close locks. These workflows are database RPCs and require migration 045 to be applied and acceptance-tested in the live Supabase project. Local-only IndexedDB transactions must be synchronised before backfill. Manual cashbook entries are still not automatically journaled. The existing reports correctly label the operating balance as indicative rather than audited profit.
2. **Bank/mobile-money reconciliation was missing.** Migration 017 now adds a secure foundation for finance users to create bank/mobile-money accounts, import statement rows through an RPC, and match statement lines to cashbook entries. The operations control centre now includes a CSV import and matching interface. This is manual statement import; it is not a direct bank API connection. The interface still needs live Supabase and device acceptance testing.
3. **Backup automation is operational but recovery is not yet proven.** The GitHub Actions workflow exports table data and Auth user metadata through the Supabase REST API, private `business-documents` objects, and repository migrations, then encrypts the archive and retains it for 30 days. The workflow reads two Actions secrets: `SUPABASE_SERVICE_ROLE_KEY` and `BACKUP_ENCRYPTION_PASSPHRASE`; the project URL is currently set in the workflow file. A successful backup run exists on 10 November, but a full restore in a separate Supabase project remains mandatory. This is a logical JSON backup, not a physical or custom-format PostgreSQL dump.
4. **Offline conflict handling needs real multi-device tests.** Idempotent sync receipts exist, but test simultaneous edits, duplicate retries, partial network loss, device replacement and conflict recovery.
5. **Financial reports are operational summaries, not audited accounts.** Do not represent the current net sales less recorded expenses figure as net profit or available cash.
6. **Production security needs independent verification.** Test cross-business isolation with separate accounts, role escalation attempts, branch scoping, storage access, account recovery and audit coverage.
7. **Mobile/PWA quality needs device testing.** Test install/update behaviour, offline launch, theme persistence, language selection (including Arabic RTL), navigation, forms, keyboard handling, printing and small-screen tables on Android and iPhone.
8. **Subscription capability is partly implemented.** The repository contains plan definitions, trials, invoice/payment records, manual payment submission and administrator verification, plus capacity and expiry enforcement migrations. Direct Orange Money/AfriMoney/bank API checkout and automated recurring collection are not implemented or independently verified. The numbered migration files also contain legacy duplicate version labels (022 and 026); do not rely on Supabase CLI migration history until those historical files are reconciled against the live project's migration history.

## New changes in this release\n\n- Added `premium-hr-loyalty.js` with separate HR & Payroll and Customer Loyalty navigation workspaces; the existing local Employees page and all prior modules remain in place.\n- Added `employee_attendance` with business-scoped RLS, employee/branch foreign keys, one attendance record per employee per day and clock-time validation. Migration 057 separates accountant read access from manager write access. HR managers can record present, late, absent and leave statuses with clock-in/out times.\n- HR & Payroll uses the existing business-scoped `employees`, `payroll_runs` and `payroll_items` tables. It supports employee create/update, draft payroll generation, editable draft deductions, approval, payslip printing and manual payment-reference recording. It does not calculate statutory tax automatically or initiate salary transfers.\n- Customer Loyalty uses the existing `customer_loyalty_accounts` and `customer_loyalty_ledger` tables. Migration 055 adds the `SECURITY INVOKER` transactional RPC `apply_customer_loyalty_points`, with business RLS still enforced, so account balance and ledger changes commit together. Default tiers are balance-based: Bronze 100+, Silver 500+, Gold 1,000+.\n- Added the new module to the service-worker app shell and incremented the cache version to v265.\n- Live schema inspection confirmed the HR/payroll and loyalty tables already existed with RLS enabled; no existing tables or business records were dropped or rewritten.\n

- Added `supabase/migrations/018_double_entry_general_ledger.sql` and included it in `supabase/INSTALL_ALL_OPERATIONS.sql`.
- Added `supabase/migrations/019_weighted_average_inventory_cogs.sql` and included it in the consolidated installer.
- Added a finance UI for chart-of-accounts setup, trial balance, Profit & Loss, Balance Sheet, cash-flow reporting, inventory valuation and balanced manual journal posting.
- The ledger is designed to post new synced sales, purchases, expenses, returns and receivable/payable payments. Cash sales are routed to cash/bank; credit sales are routed to receivables. Historical records are not automatically rewritten.
- Migration 019 adds branch-level moving weighted-average inventory valuation, cost movement history, automatic COGS and inventory relief for new stock-managed synced sales, plus purchase, batch receipt, approved adjustment and branch-transfer valuation updates. Opening stock is valued using available batch costs and product.cost_price for unbatched quantities. Historical sales are not rewritten; historical COGS is not backfilled. Verify opening values before relying on gross profit.
- Manual cashbook entries are not automatically posted to the ledger in this release to avoid double-counting with existing payment workflows.
- Added `supabase/migrations/017_bank_mobile_money_reconciliation.sql`.
- Added the same migration to `supabase/INSTALL_ALL_OPERATIONS.sql` so the operations installer includes the new reconciliation schema and RPCs.
- Added a finance-only reconciliation interface to the Operations Control Centre: account setup, CSV statement import, unmatched-line review and guarded matching to cashbook entries.
- Linked new cashbook entries to a selected bank/mobile-money account so they can be reconciled later.
- Added `.github/workflows/supabase-backup.yml` for scheduled/manual encrypted logical JSON, Auth metadata and private Storage backups. The workflow reads `SUPABASE_SERVICE_ROLE_KEY` and `BACKUP_ENCRYPTION_PASSPHRASE` Actions secrets; the project URL is hard-coded in the workflow. `SUPABASE_DB_URL` and a `SUPABASE_URL` secret are not required by the current workflow.
- Added `scripts/backup_supabase_storage.py` and `scripts/restore_supabase_storage.py` for private object backup and non-overwriting restoration.
- Expanded `BACKUP_GUIDE.md` with secret configuration, checksum/HMAC verification and separate-project recovery steps.
- Updated the README to reflect the implemented ledger and current billing/backup limitations.
- Migrations 017, 018, 019 and 045 are committed to GitHub. The user confirmed migration 017 reconciliation and migration 018 accounting installation/report checks. Migration 019 and the new migration 045 require live Supabase application and functional acceptance tests before relying on gross profit or the new historical/opening/period controls. Migration 045's RPCs are owner/admin/accountant restricted; historical backfill is explicit and does not run automatically on migration.

## Migration 045 — accounting completion workflow\n\n- `backfill_accounting_history(business_id)` posts eligible cloud historical sales, offline sales, purchases, expenses and offline refunds exactly once using unique source keys. Legacy `sales` and `purchases` rows must have `status='posted'`. Offline-only device records must be synchronised first. Historical COGS is posted only when legacy sale-item unit costs or recorded inventory cost movements exist; missing historical cost is deliberately not guessed.\n- `post_accounting_opening_balances(business_id, effective_date, balances_json)` accepts balance-sheet account codes and debit/credit amounts, then balances the opening journal through Owner capital (3000). Only one opening batch is permitted per business. Opening balances must be reconciled to source statements before posting.\n- `reverse_accounting_journal(business_id, journal_id, reversal_date, reason)` creates an equal-and-opposite immutable journal and records the link; the original journal is never edited or deleted.\n- `close_accounting_period(business_id, period_start, period_end)` transfers income/expense balances to retained earnings and locks the closed date range against new journals. Corrections must be recorded in an open period using an authorised reversal. Overlapping closed periods are rejected.\n- These secured database RPCs are exposed through the Accounting workflow controls panel in Business Intelligence when migration 045 is installed and the signed-in user has finance permissions. Migration 045 must be applied manually in Supabase SQL Editor before the controls become available. Do not execute backfill or opening balances until the business, historical data and cutover date have been reviewed.\n\n## Required acceptance tests before calling the platform production-ready

- Two separate business accounts cannot read or mutate each other's data.
- Each role can perform only its permitted actions; denied actions are tested, not just allowed actions.
- A sale, purchase, return, refund, obligation payment, stock adjustment, branch transfer and inventory-cost movement remain correct after refresh and sync retry; the sale COGS journal must match the inventory cost movement.
- Two devices reconnecting after offline work do not duplicate transactions or silently overwrite records.
- A statement import rejects malformed rows, skips duplicate external references, and reports inserted counts.
- A statement line cannot be matched to another business, another bank account, a wrong amount or the wrong debit/credit direction.
- A cashbook entry cannot be reconciled more than once.
- The scheduled backup workflow succeeds with the configured required secrets; the encrypted archive passes checksum and HMAC verification. The latest successful run visible in GitHub was on 10 November 2026 before the current release commit; run it again after this release and retain the artifact outside GitHub.
- A full database and Storage restoration succeeds in a separate Supabase project, including document downloads.
- HR/payroll and attendance must be tested with an owner/admin/accountant account and a manager account; verify role-denial cases, payroll totals, deductions, approval, payment recording and one-record-per-employee-per-day attendance.\n- Customer loyalty must be tested with cashier/manager and unauthorised roles; verify award, redemption, insufficient-points rejection and ledger consistency.\n- Subscription plan/pricing, manual payment submission and verification, renewals, cancellation, failed-payment handling and entitlement enforcement are tested before commercial launch. Direct provider checkout must remain clearly marked unavailable until implemented and tested.
- Android and iPhone PWA installation, offline launch, update and theme persistence are verified.

## Release status

The GitHub Actions deployment workflow for the latest dark-mode correction completed successfully. That confirms the repository workflow completed; it is not a substitute for live browser, Supabase or device acceptance testing.

**Current assessment:** strong feature foundation; not yet independently certified for production accounting, disaster recovery or commercial subscription operations. The backup workflow has completed successfully, but the encrypted logical export has not been restored into a separate recovery project. Before commercial launch, finish the accounting acceptance tests, validate opening inventory and balances, test multi-device offline conflict handling and security boundaries, verify Android/iPhone PWA behaviour, and implement direct payment-provider integration only after the provider and commercial pricing model are confirmed.


## Release engineering review — 10 November 2026

Repository checks observed on commit `8a4f3ce37ef07c5111c99320850328ddf6cbf747`:
- GitHub Pages deployment: successful.
- JavaScript syntax validation: successful.
- Browser interaction smoke test: successful on Android-sized and desktop Chromium viewports.
- Android APK build and GitHub Release publication: successful. The current APK is debug-signed, not a Play Store production-signed package.
- Supabase off-site backup: a successful run exists from earlier on 10 November, but it predates the latest release commit. A separate-project restore has not been demonstrated.

The Android wrapper previously loaded the remote GitHub Pages URL even though the workflow packaged the web files into the APK. The production-readiness update changes the wrapper to load its bundled app shell through AndroidX WebViewAssetLoader, so the interface can open without network access; cloud authentication and sync still require connectivity. This is not considered device-verified until the rebuilt APK is installed and tested in airplane mode on a real Android device.

The browser smoke suite now exercises Executive Action Centre, Financial Planning and Plans & Billing navigation, checks the Action Centre panels, and attempts an offline app-shell reload. The CI workflow now checks all root JavaScript files and validates manifest assets and migration filename integrity.

The Supabase security audit SQL is read-only. It reports tables without RLS, RLS-enabled tables without policies, public/anonymous table grants, and SECURITY DEFINER functions without a fixed search_path. Review every result against intended public data and RPC access; a clean report is not a substitute for cross-account tests using two separate authenticated business accounts.

**Remaining release blockers that require live Supabase/device acceptance:** execute the read-only security audit; verify RLS isolation and role-denial cases with separate accounts; verify bank statement reconciliation; apply and test migration 019 if it is not already installed; validate opening inventory and COGS; run and restore an encrypted backup in a separate recovery project; test offline sync conflict recovery across two devices; and test the rebuilt APK offline on Android.

## Security follow-up — migration 058

- Migration 058 changes the retained legacy `device_service_financial_summary` view to `security_invoker=true`. This makes access follow the calling user's privileges and the underlying `phone_unlocking_orders` RLS policies instead of running with the view owner's permissions.
- The change was applied to the connected Supabase project and verified in PostgreSQL catalog metadata (`reloptions = security_invoker=true`). The migration is recorded in Supabase migration history.
- The security advisor no longer reports the previous `security_definer_view` finding.
- Twelve RLS-enabled platform/internal tables have no policies and no grants to `anon`, `authenticated`, or `PUBLIC`; this currently blocks direct Data API access and appears intentional for internal tables, but any RPCs that use them must continue to enforce developer/role checks.
- The security advisor still reports many `SECURITY DEFINER` functions executable by API roles, including trigger functions and selected public workflows. These require function-by-function review; do not revoke them in bulk because some are required for offline sync, approvals, storefront submissions, and controlled administration.
- Supabase Auth leaked-password protection is currently disabled and should be enabled in the Auth security settings before production onboarding.


## Security review — migration 059

- Reviewed core business RLS policies for businesses, memberships, products, sales, purchases, employees, payroll, attendance, branches, branch transfers, expenses, cashbook and customer loyalty.
- Core workspace reads are scoped through active business membership. Sensitive write paths are role-scoped (for example payroll to owner/admin/accountant; attendance management to owner/admin/manager; branch transaction posting to assigned branch roles).
- Reviewed the branch-aware offline transaction RPC. It verifies active membership, allowed role, transaction type, active branch ownership, branch assignment for cashier/storekeeper, item quantities and prices, authoritative line totals, discounts/tax, and stock availability.
- Corrected API grants that had drifted from repository migrations: anonymous callers can no longer execute platform account suspension/restoration, business freeze/suspension, business registration limit, customer approval, maintenance, membership administration, or branch transaction posting RPCs. These remain executable by authenticated callers and retain their internal developer/role checks.
- Disabled anonymous and authenticated execution of the deprecated auto-first-branch `sync_local_transaction` RPC. The supported transaction path is `sync_branch_transaction`, which requires an explicit branch.
- Verified the resulting grants in PostgreSQL: the seven platform administration RPCs and branch transaction RPC deny `anon` and allow `authenticated`; the legacy transaction RPC denies both.
- Security advisor's anonymous SECURITY DEFINER finding count reduced from 146 to 137 after this grant correction. Remaining findings are not bulk-revoked because some represent required trigger helpers, authenticated workflows, and controlled public storefront/portal operations that need individual review.
- Eleven internal tables have RLS enabled with no direct API policies and no grants to anon/authenticated/PUBLIC; these are currently inaccessible through direct client table access. Keep them behind vetted RPCs with explicit authorization checks.
- Auth leaked-password protection remains disabled in Supabase Auth settings; this needs enabling in the dashboard before production onboarding.
- This review is not a penetration test. Cross-account isolation still requires a controlled two-account acceptance test in the live app.


## Ownership protection — migration 060

- Reviewed the developer-managed business membership RPC and found that it rejected assigning the `owner` role but did not reject changing an existing owner's role to a staff role.
- Updated `set_platform_member_access` to lock and inspect the target membership and reject any staff-access change when the target is the existing business owner.
- Added required-input validation and retained the developer authorization check, audit logging, and authenticated-only execution grant.
- Applied migration 060 and verified the deployed function definition contains the owner-protection check. Verified `anon` cannot execute the RPC and `authenticated` can.
- This is a source/catalog verification, not a live two-account UI test. A controlled test with two real customer accounts is still required to prove cross-business isolation end to end.


## Refund and transfer authorization — migrations 061–062

- Hardened `sync_sale_return` to use the shared `has_business_role` authorization gate. This checks approved customer status, active platform account, maintenance mode, active membership, business suspension/freeze state, and permitted role before a refund can be processed.
- Hardened `cancel_branch_stock_transfer` to require an active, approved business membership before applying the existing manager/admin/owner or original-requester cancellation rule.
- Restricted both RPCs to authenticated callers; verified anonymous execution is denied and authenticated execution is allowed.
- Verified the deployed function definitions contain the new authorization gates.
- No transaction rows or customer records were modified by these migrations.
- These checks establish database-side authorization, but do not replace a live acceptance test with two distinct customer accounts.


## Financial integrity hardening — migration 063

- Applied `supabase/migrations/063_harden_financial_integrity_and_rpc_grants.sql` to the connected Supabase project and verified its migration-history entry.
- Added six database constraints: sales discounts cannot exceed subtotal; sales payments cannot exceed total; sale totals must equal subtotal less discount; sale-item line totals must equal rounded quantity × unit price; purchase payments cannot exceed purchase total; and purchase-item line totals must equal rounded quantity × unit cost.
- Updated the canonical `post_sale` RPC to reject null/negative payment or discount values and discounts greater than the calculated subtotal before inventory or sales records are written.
- Restricted internal `post_system_journal` and `seed_default_chart_of_accounts` helpers from API roles. They remain callable internally by their owning SECURITY DEFINER workflows.
- Removed unnecessary anonymous execution from the accounting cash-flow, historical backfill, initialization, opening-balance, manual-journal, period-close and journal-reversal RPCs; authenticated execution remains enabled and their in-function business-role checks are retained.
- Verified all six constraints are installed; verified the sales discount guard is present; verified anonymous execution is denied for the selected accounting RPCs and internal helpers, while authenticated execution remains enabled for the user-facing workflows.
- Pre/post integrity checks found zero sales header mismatches, zero sale-line arithmetic mismatches, zero purchase payment mismatches, zero purchase-line arithmetic mismatches and zero unbalanced posted journals.
- Security advisor count for anonymous-executable SECURITY DEFINER functions is now 126. Remaining findings include trigger helpers and other public/authenticated workflows across the wider platform; they require individual review and must not be bulk-revoked.
- Supabase Auth leaked-password protection remains disabled and should be enabled in Auth security settings.
- This migration does not constitute an independent audit or authenticated user acceptance test. Test normal sale discounts, full/partial payment, purchase posting, refunds, accounting reports and period controls in the live app before commercial use.


## Financial intelligence and controlled period reopening — migration 064

- Applied `supabase/migrations/064_financial_intelligence_and_controlled_period_reopening.sql` to the connected Supabase project.
- Restricted `import_bank_statement_lines` and `match_bank_statement_line` to authenticated execution only. Their existing `auth.uid()`, owner/admin/accountant and same-business/same-bank-account checks remain in place.
- Added `accounting_obligation_aging(business_id, as_of)`, a business-role-checked, invoker-security RPC for open and part-paid receivables/payables. It reports remaining balance, days overdue and Not due / 1–30 / 31–60 / 61–90 / Over 90 day categories.
- Added `accounting_cash_commitments_forecast(business_id, from, to)`, a role-checked invoker-security RPC that groups due-dated outstanding receivables and payables for up to 365 days. It intentionally forecasts entered contractual obligations only; it does not invent future sales or discretionary expenses.
- Added an append-only period reopening event table with RLS enabled and no direct client grants. The `reopen_accounting_period` RPC is restricted to business owners/admins and requires a reason of at least 10 characters.
- Reopening records the actor and reason, reverses the immutable original period-closing journal inside the reopened period, and writes an audit event. Re-closing the same period posts a new closing journal and updates the close record; the prior reopen/reversal history remains.
- Updated the closed-period guard to unlock a period only when a later authorised reopen event exists. Re-closing advances the close timestamp and locks it again.
- Updated Business Intelligence to show live obligation ageing and a 90-day due-date commitments forecast, with clear limitations displayed. Added rule-based in-app financial anomaly alerts for overdue receivables/payables and near-term contractual cash gaps. Added a controlled reopen action to the existing accounting workflow controls and CSV export for ageing and contractual cash forecast records.
- Updated the service-worker cache to v268 so clients fetch the new Business Intelligence interface.
- Database migration and repository changes are applied/committed. Authenticated live acceptance is still required for import/match role denials, ageing bucket values, forecast totals, period reopen/reversal, backdated journal acceptance while reopened, and re-close/lock behaviour. Do not test period reopening on production books without a controlled test business and backup.


### Migration 064 security follow-up

- Security advisor now reports 124 anonymous-executable SECURITY DEFINER functions, down from 126 after restricting the two bank reconciliation RPCs. Remaining findings are still under function-by-function review; do not bulk-revoke trigger helpers.
- The new `accounting_period_reopen_events` table is intentionally RLS-enabled with no direct policies and no grants to `anon`, `authenticated` or `PUBLIC`. It is written only by the owner/admin-authorized reopening RPC and is not directly exposed to the Data API.
- Database catalog verification confirms all six new finance RPCs deny anonymous execution and allow authenticated execution, the closed-period guard references the reopen audit events, and migration 064 is recorded in Supabase migration history.
- The Supabase advisor now lists twelve RLS-enabled tables without policies; this includes the new internal reopen-event table and the previously reviewed internal platform tables. The advisor's no-policy notice is intentional for these direct-client-inaccessible tables, but their privileged RPC access paths must continue to be reviewed.


### Subscription in-app notifications — migrations 065–066

- Added `business_notifications` with owner-recipient scoping, unique deduplication keys, RLS, and an index for recent/unread notices.
- Added a privileged, non-client-callable generator. It creates one-time reminders 7, 3 and 1 days before the subscription period ends; overdue pending-invoice reminders; and notices for verified payments, grace-period starts and expirations.
- Added a daily `pg_cron` job at 00:15 UTC. The existing 00:05 UTC subscription expiry job is unchanged.
- Added the top-bar in-app notification centre with unread count, read-one and mark-all-read actions. It queries through the signed-in Supabase client; RLS restricts rows to the authenticated owner.
- Migration 066 restricts authenticated updates to the `read_at` column; clients cannot edit notification titles, message bodies, recipient IDs or deduplication keys.
- Supabase catalog verification: notification table exists, RLS is enabled, only own-row SELECT/UPDATE policies exist, the generator is SECURITY DEFINER with an empty search path, execution is denied to anon/authenticated and granted to service_role, and the daily cron job is active.
- The notification table was empty at verification time. No real customer notification was sent or generated during deployment checks. The live UI still requires a signed-in owner acceptance test, and scheduled reminder content should be verified with controlled test subscription/invoice dates before production rollout.
- This is in-app notification delivery only. SMS, email, WhatsApp and Orange Money provider callbacks are not included in this phase.
