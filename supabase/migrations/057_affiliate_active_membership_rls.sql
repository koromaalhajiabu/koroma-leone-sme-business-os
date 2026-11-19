-- Enforce active membership on every business-scoped affiliate permission.
begin;

drop policy if exists affiliate_programs_read on public.affiliate_programs;
create policy affiliate_programs_read on public.affiliate_programs for select to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_programs.business_id and bm.user_id=auth.uid() and bm.is_active=true)
);

drop policy if exists affiliate_programs_manage on public.affiliate_programs;
create policy affiliate_programs_manage on public.affiliate_programs for all to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_programs.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_programs.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
);

drop policy if exists affiliate_profiles_read on public.affiliate_profiles;
create policy affiliate_profiles_read on public.affiliate_profiles for select to authenticated
using (
  user_id=auth.uid()
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_profiles.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin','manager'))
);

drop policy if exists affiliate_profiles_update on public.affiliate_profiles;
create policy affiliate_profiles_update on public.affiliate_profiles for update to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_profiles.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_profiles.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
);

drop policy if exists affiliate_referrals_read on public.affiliate_referrals;
create policy affiliate_referrals_read on public.affiliate_referrals for select to authenticated
using (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid())
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_referrals.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin','manager'))
);

drop policy if exists affiliate_commissions_read on public.affiliate_commissions;
create policy affiliate_commissions_read on public.affiliate_commissions for select to authenticated
using (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid())
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_commissions.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin','manager'))
);

drop policy if exists affiliate_commissions_manage on public.affiliate_commissions;
create policy affiliate_commissions_manage on public.affiliate_commissions for update to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_commissions.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_commissions.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
);

drop policy if exists affiliate_payouts_read on public.affiliate_payout_requests;
create policy affiliate_payouts_read on public.affiliate_payout_requests for select to authenticated
using (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid())
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_payout_requests.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
);

drop policy if exists affiliate_payouts_manage on public.affiliate_payout_requests;
create policy affiliate_payouts_manage on public.affiliate_payout_requests for update to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_payout_requests.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_payout_requests.business_id and bm.user_id=auth.uid() and bm.is_active=true and lower(bm.role::text) in ('owner','admin'))
);

commit;
