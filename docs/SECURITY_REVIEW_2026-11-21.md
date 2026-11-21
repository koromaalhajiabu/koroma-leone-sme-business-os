# Koroma Leone Tech — Security review
Date: 2026-11-21
Scope: Supabase project nclncqlgnxnijlumznnt and GitHub Pages deployment.

## Completed database hardening
- Restricted 46 SECURITY DEFINER trigger functions from direct PUBLIC, anon, and authenticated execution. PostgreSQL trigger invocation remains configured.
- Restricted authenticated business/platform RPCs from anon/PUBLIC and retained authenticated execution. The Supabase anonymous SECURITY DEFINER advisor count fell from 123 to 17.
- Verified the two previously identified internal inventory batch helpers are not executable by anon or authenticated; PostgreSQL retains execution.
- Reviewed 14 tables flagged for RLS enabled without policies. All 14 have RLS enabled and no SELECT privileges for anon or authenticated; ACLs show postgres and service_role only. No policies are therefore intentional for their current private/internal access model.
- The 17 remaining anon-callable SECURITY DEFINER functions are public-facing read, storefront, order submission, tracking, referral, or school portal endpoints. They were retained to avoid breaking public app workflows; their returned data and input validation require a separate endpoint-by-endpoint privacy and abuse review.
- pg_net 0.20.4 is installed in public and is marked non-relocatable. It was not moved because that would require a risky extension replacement/reinstall rather than a safe schema move.

## Remaining platform settings / validation
- Supabase advisor still reports leaked-password protection disabled. This is an Auth dashboard setting; it was not changed through SQL.
- Supabase reports 135 authenticated-callable SECURITY DEFINER functions. Many are intentional authenticated RPCs; a complete review must inspect each authorization path and client usage before any further revoke.
- Authenticated end-to-end tests across separate business accounts and employee roles remain required. SQL administrator checks do not prove browser/JWT RLS behavior.
- Backup restoration into a separate project remains untested.
- Public tracking endpoints should be checked for sensitive personal data exposure and tracking-code entropy.
- Review the public device payment-instructions endpoint to confirm published payment details are intended for public display.

## Current advisor state after hardening
- anon SECURITY DEFINER functions: 17 (down from 123)
- authenticated SECURITY DEFINER functions: 135
- RLS enabled/no-policy informational findings: 14 (all reviewed as private/internal with no anon/authenticated table grants)
- pg_net in public: 1 (not relocatable)
- leaked-password protection: 1 (dashboard action required)

This is a database permission hardening and static review, not an independent penetration test or production certification.
