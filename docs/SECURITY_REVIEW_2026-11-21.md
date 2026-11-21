# Koroma Leone Tech — Security review
Date: 2026-11-21
Scope: Supabase project nclncqlgnxnijlumznnt and GitHub Pages deployment.

## Completed database hardening
- Restricted 46 SECURITY DEFINER trigger functions from direct PUBLIC, anon, and authenticated execution. PostgreSQL trigger invocation remains configured.
- Restricted SECURITY DEFINER RPCs containing explicit authentication, platform-developer, business-role, or membership guards from anonymous/PUBLIC execution; authenticated execution is retained where appropriate.
- Verified the two previously identified internal inventory batch helpers are not executable by anon or authenticated; PostgreSQL retains execution.
- Supabase anonymous SECURITY DEFINER advisor findings fell from 123 to 17.
- Reviewed 14 tables flagged for RLS enabled without policies. All 14 have RLS enabled and no table privileges for anon or authenticated; ACLs show postgres and service_role only. These are intentionally private/internal tables, so the no-policy INFO findings are not public exposure.
- Reviewed all 17 remaining anon-callable SECURITY DEFINER functions. They are public-facing read, storefront, order submission, delivery tracking, referral, or school portal endpoints retained for public app workflows. Do not revoke them without a product-level replacement.
- Delivery tracking review found the public RPC returns the destination address and rider phone to a holder of a tracking code. New tracking codes now use 24 hexadecimal characters (96 bits) instead of the previous 10-character (40-bit) default. Existing tracking codes were deliberately not rotated so already-issued customer links remain valid. Consider masking rider phone and address details in a future UI/API update if business operations allow.
- pg_net 0.20.4 is installed in public and is marked non-relocatable. It was not moved because a safe schema move is unsupported; replacing/reinstalling the extension could disrupt dependent scheduled HTTP calls.

## Remaining owner actions / validation
- Supabase advisor reports leaked-password protection disabled. Enable it in Supabase Dashboard → Authentication → Security and Protection. This is a project Auth setting and was not changed through SQL.
- Supabase reports 139 authenticated-callable SECURITY DEFINER functions. They were not bulk-revoked because many are legitimate authenticated workflows. Continue function-by-function review alongside client call sites and test each affected role.
- Authenticated end-to-end tests across separate business accounts and employee roles remain required. SQL administrator checks do not prove browser/JWT RLS behavior.
- Backup restoration into a separate project remains untested.
- Public endpoints should receive rate-limit/abuse testing before high-volume public launch.

## Current advisor state after hardening
- anon SECURITY DEFINER functions: 17 (down from 123)
- authenticated SECURITY DEFINER functions: 139 (intentional access still requires role-path testing)
- RLS enabled/no-policy informational findings: 14 (all reviewed as private/internal with no anon/authenticated table grants)
- pg_net in public: 1 (extension is not relocatable)
- leaked-password protection: 1 (dashboard action required)

This is database permission hardening and static review, not an independent penetration test or production certification.
