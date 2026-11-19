-- White Lion SME OS: tenant-safe affiliate marketing foundation.
-- Apply manually in Supabase SQL Editor after reviewing the target project.
begin;

create table if not exists public.affiliate_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid null references public.businesses(id) on delete cascade,
  program_name text not null,
  commission_type text not null default 'percentage' check (commission_type in ('percentage','fixed')),
  commission_value numeric(14,4) not null default 10 check (commission_value >= 0),
  currency text not null default 'SLE',
  cookie_days integer not null default 30 check (cookie_days between 1 and 365),
  approval_required boolean not null default true,
  status text not null default 'draft' check (status in ('draft','active','paused','closed')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_program_scope_name unique (business_id, program_name)
);

create table if not exists public.affiliate_profiles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.affiliate_programs(id) on delete cascade,
  business_id uuid null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  referral_code text not null unique,
  contact_email text not null,
  status text not null default 'pending' check (status in ('pending','active','suspended','rejected')),
  created_at timestamptz not null default now(),
  unique (program_id, user_id)
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.affiliate_programs(id) on delete cascade,
  affiliate_id uuid not null references public.affiliate_profiles(id) on delete cascade,
  business_id uuid null references public.businesses(id) on delete cascade,
  visitor_token uuid not null,
  referred_email text,
  referral_status text not null default 'clicked' check (referral_status in ('clicked','registered','converted','rejected')),
  first_clicked_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (program_id, visitor_token)
);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.affiliate_programs(id) on delete restrict,
  affiliate_id uuid not null references public.affiliate_profiles(id) on delete restrict,
  referral_id uuid references public.affiliate_referrals(id) on delete set null,
  business_id uuid null references public.businesses(id) on delete cascade,
  source_reference text not null,
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  currency text not null default 'SLE',
  status text not null default 'pending' check (status in ('pending','approved','payable','paid','reversed','rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  unique (program_id, source_reference)
);

create table if not exists public.affiliate_payout_requests (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(id) on delete restrict,
  business_id uuid null references public.businesses(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'SLE',
  payout_method text not null,
  payout_destination text not null,
  status text not null default 'requested' check (status in ('requested','approved','paid','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  payment_reference text,
  admin_note text
);

create index if not exists affiliate_profiles_program_status_idx on public.affiliate_profiles(program_id,status);
create index if not exists affiliate_referrals_affiliate_date_idx on public.affiliate_referrals(affiliate_id,first_clicked_at desc);
create index if not exists affiliate_commissions_affiliate_status_idx on public.affiliate_commissions(affiliate_id,status);
create index if not exists affiliate_payouts_business_status_idx on public.affiliate_payout_requests(business_id,status);

alter table public.affiliate_programs enable row level security;
alter table public.affiliate_profiles enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_payout_requests enable row level security;

-- Platform programme is controlled only by the existing platform developer guard.
drop policy if exists affiliate_programs_read on public.affiliate_programs;
create policy affiliate_programs_read on public.affiliate_programs for select to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_programs.business_id and bm.user_id=auth.uid())
);
drop policy if exists affiliate_programs_manage on public.affiliate_programs;
create policy affiliate_programs_manage on public.affiliate_programs for all to authenticated
using (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_programs.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin'))
)
with check (
  (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_programs.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin'))
);

drop policy if exists affiliate_profiles_read on public.affiliate_profiles;
create policy affiliate_profiles_read on public.affiliate_profiles for select to authenticated
using (
  user_id=auth.uid()
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_profiles.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin','manager'))
);
drop policy if exists affiliate_profiles_register on public.affiliate_profiles;
create policy affiliate_profiles_register on public.affiliate_profiles for insert to authenticated
with check (user_id=auth.uid() and exists (
  select 1 from public.affiliate_programs p
  where p.id=program_id and p.status='active' and p.business_id is not distinct from affiliate_profiles.business_id
));
drop policy if exists affiliate_profiles_update on public.affiliate_profiles;
create policy affiliate_profiles_update on public.affiliate_profiles for update to authenticated
using (
  (user_id=auth.uid() and status='pending')
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_profiles.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin'))
)
with check (
  (user_id=auth.uid() and status in ('pending','active'))
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_profiles.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin'))
);

drop policy if exists affiliate_referrals_read on public.affiliate_referrals;
create policy affiliate_referrals_read on public.affiliate_referrals for select to authenticated
using (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid())
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_referrals.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin','manager'))
);
drop policy if exists affiliate_commissions_read on public.affiliate_commissions;
create policy affiliate_commissions_read on public.affiliate_commissions for select to authenticated
using (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid())
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_commissions.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin','manager'))
);
drop policy if exists affiliate_payouts_read on public.affiliate_payout_requests;
create policy affiliate_payouts_read on public.affiliate_payout_requests for select to authenticated
using (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid())
  or (business_id is null and public.is_platform_developer())
  or exists (select 1 from public.business_members bm where bm.business_id=affiliate_payout_requests.business_id and bm.user_id=auth.uid() and lower(bm.role) in ('owner','admin'))
);
drop policy if exists affiliate_payouts_request on public.affiliate_payout_requests;
create policy affiliate_payouts_request on public.affiliate_payout_requests for insert to authenticated
with check (
  exists (select 1 from public.affiliate_profiles ap where ap.id=affiliate_id and ap.user_id=auth.uid() and ap.status='active' and ap.business_id is not distinct from affiliate_payout_requests.business_id)
);

-- Public referral tracking records a click only; it never creates a commission or exposes customer data.
create or replace function public.track_affiliate_referral(p_referral_code text, p_visitor_token uuid default gen_random_uuid())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affiliate public.affiliate_profiles%rowtype;
  v_program public.affiliate_programs%rowtype;
  v_referral_id uuid;
begin
  if p_referral_code is null or length(trim(p_referral_code)) < 4 or length(trim(p_referral_code)) > 40 then
    return jsonb_build_object('tracked',false);
  end if;
  select * into v_affiliate from public.affiliate_profiles
    where referral_code=upper(trim(p_referral_code)) and status='active';
  if not found then return jsonb_build_object('tracked',false); end if;
  select * into v_program from public.affiliate_programs
    where id=v_affiliate.program_id and status='active';
  if not found then return jsonb_build_object('tracked',false); end if;
  insert into public.affiliate_referrals(program_id,affiliate_id,business_id,visitor_token)
  values(v_program.id,v_affiliate.id,v_affiliate.business_id,coalesce(p_visitor_token,gen_random_uuid()))
  on conflict(program_id,visitor_token) do update set last_clicked_at=now()
  returning id into v_referral_id;
  return jsonb_build_object('tracked',true,'referral_id',v_referral_id);
end;
$$;

revoke all on function public.track_affiliate_referral(text,uuid) from public;
grant execute on function public.track_affiliate_referral(text,uuid) to anon, authenticated;

grant select,insert,update on public.affiliate_programs to authenticated;
grant select,insert,update on public.affiliate_profiles to authenticated;
grant select on public.affiliate_referrals,public.affiliate_commissions to authenticated;
grant select,insert on public.affiliate_payout_requests to authenticated;

comment on table public.affiliate_commissions is 'Commission ledger. Rows must be created only after a verified, non-refunded qualifying transaction.';
comment on function public.track_affiliate_referral(text,uuid) is 'Public-safe click tracking only; does not identify visitors or create commissions.';

commit;
