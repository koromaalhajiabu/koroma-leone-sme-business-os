-- Affiliate security and workflow hardening.
begin;

-- Active programme terms may be discovered by signed-in prospective affiliates.
drop policy if exists affiliate_programs_public_active on public.affiliate_programs;
create policy affiliate_programs_public_active on public.affiliate_programs
for select to authenticated using (status='active');

-- An affiliate cannot approve or activate their own application.
drop policy if exists affiliate_profiles_update on public.affiliate_profiles;
create policy affiliate_profiles_update on public.affiliate_profiles
for update to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (
    select 1 from public.business_members bm
    where bm.business_id=affiliate_profiles.business_id
      and bm.user_id=auth.uid()
      and lower(bm.role::text) in ('owner','admin')
  )
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (
    select 1 from public.business_members bm
    where bm.business_id=affiliate_profiles.business_id
      and bm.user_id=auth.uid()
      and lower(bm.role::text) in ('owner','admin')
  )
);

-- Enforce programme approval settings at registration time.
drop policy if exists affiliate_profiles_register on public.affiliate_profiles;
create policy affiliate_profiles_register on public.affiliate_profiles
for insert to authenticated
with check (
  user_id=auth.uid()
  and exists (
    select 1 from public.affiliate_programs p
    where p.id=program_id
      and p.status='active'
      and p.business_id is not distinct from affiliate_profiles.business_id
      and (
        (p.approval_required=true and affiliate_profiles.status='pending')
        or (p.approval_required=false and affiliate_profiles.status='active')
      )
  )
);

-- Only the relevant business owner/admin or platform developer may review or pay ledger entries.
drop policy if exists affiliate_commissions_manage on public.affiliate_commissions;
create policy affiliate_commissions_manage on public.affiliate_commissions
for update to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (
    select 1 from public.business_members bm
    where bm.business_id=affiliate_commissions.business_id
      and bm.user_id=auth.uid()
      and lower(bm.role::text) in ('owner','admin')
  )
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (
    select 1 from public.business_members bm
    where bm.business_id=affiliate_commissions.business_id
      and bm.user_id=auth.uid()
      and lower(bm.role::text) in ('owner','admin')
  )
);

drop policy if exists affiliate_payouts_manage on public.affiliate_payout_requests;
create policy affiliate_payouts_manage on public.affiliate_payout_requests
for update to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (
    select 1 from public.business_members bm
    where bm.business_id=affiliate_payout_requests.business_id
      and bm.user_id=auth.uid()
      and lower(bm.role::text) in ('owner','admin')
  )
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (
    select 1 from public.business_members bm
    where bm.business_id=affiliate_payout_requests.business_id
      and bm.user_id=auth.uid()
      and lower(bm.role::text) in ('owner','admin')
  )
);

grant update on public.affiliate_commissions,public.affiliate_payout_requests to authenticated;
commit;
