# Affiliate Marketing — setup and acceptance

The Affiliate Marketing module is an optional, cloud-backed module for the White Lion SME Business OS.

## What is included

- Separate platform-level and business-level affiliate programmes.
- Affiliate registration linked to the signed-in Supabase account.
- Unique referral codes and click attribution.
- Programme activation and administrator approval/suspension of affiliate profiles.
- Business-scoped referral, commission and payout visibility.
- Commission ledger and payout-request data model.
- Public-safe click tracking. A click never creates a commission.
- Row Level Security and active business-membership checks.

## Apply database migrations

In the Supabase SQL Editor for the project configured in `cloud.js`, apply these files in order:

1. `supabase/migrations/055_affiliate_marketing_foundation.sql`
2. `supabase/migrations/056_affiliate_security_workflows.sql`
3. `supabase/migrations/057_affiliate_active_membership_rls.sql`

Do not apply these to a different Supabase project. The migration scripts are committed to GitHub but are not executed automatically by GitHub Pages.

## Important commission rule

Referral clicks are attribution evidence only. They do not create earnings. A commission must be written only after a qualifying sale or subscription has been verified, the refund/chargeback window has been considered, and the transaction has been checked for duplicate attribution. The commission table deliberately has no browser insert policy. A trusted server-side transaction workflow must be added before automatic commission accrual or payment is enabled.

Payout requests are stored separately from actual payments. Mark a payout as paid only after an administrator has verified the real transfer and recorded its payment reference.

## Initial acceptance tests

- A signed-in user can see active programmes and submit one affiliate application per programme.
- A user cannot approve or activate their own application.
- An inactive business member cannot view or manage business affiliate records.
- A user from Business A cannot read Business B affiliates, referrals, commissions or payouts.
- A business owner/admin can activate or pause its own programme and approve/suspend its own affiliates.
- A business owner/admin cannot manage another business's programme or payouts.
- A public referral click records one visitor token per programme; refreshing does not inflate unique clicks.
- A referral click never creates a commission.
- A platform programme can be managed only by the existing platform developer guard.
- Test SLE and USD display and verify Android navigation and small-screen layouts.

## Current implementation boundary

The first release provides programme and affiliate administration plus referral click tracking and read-only commission/payout ledgers. Automated conversion attribution, commission accrual, affiliate withdrawal submission, payment-provider integration, tax handling and dispute/refund reversals require separate verified workflows before production payouts.
