-- External affiliate networks for the White Lion platform owner.
-- This is deliberately separate from business-level affiliate programmes.
create table if not exists public.external_affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  partner_key text not null check (partner_key in ('shopify','impact','hostinger','cj','other')),
  account_label text not null,
  application_status text not null default 'not_applied'
    check (application_status in ('not_applied','applied','approved','rejected','paused')),
  publisher_id text,
  tracking_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, partner_key)
);

create table if not exists public.external_affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  partner_account_id uuid not null references public.external_affiliate_accounts(id) on delete cascade,
  destination_url text not null,
  clicked_at timestamptz not null default now()
);

create table if not exists public.external_affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  partner_account_id uuid not null references public.external_affiliate_accounts(id) on delete cascade,
  external_conversion_id text not null,
  sale_amount numeric(14,2) not null default 0 check (sale_amount >= 0),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending','approved','reversed','paid')),
  evidence_note text,
  network_reported_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_user_id, partner_account_id, external_conversion_id)
);

create index if not exists external_affiliate_clicks_owner_date_idx
  on public.external_affiliate_clicks(owner_user_id, clicked_at desc);
create index if not exists external_affiliate_conversions_owner_date_idx
  on public.external_affiliate_conversions(owner_user_id, created_at desc);

alter table public.external_affiliate_accounts enable row level security;
alter table public.external_affiliate_clicks enable row level security;
alter table public.external_affiliate_conversions enable row level security;

drop policy if exists external_affiliate_accounts_owner_all on public.external_affiliate_accounts;
create policy external_affiliate_accounts_owner_all on public.external_affiliate_accounts
  for all to authenticated using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists external_affiliate_clicks_owner_all on public.external_affiliate_clicks;
create policy external_affiliate_clicks_owner_all on public.external_affiliate_clicks
  for all to authenticated using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid()) and exists (
      select 1 from public.external_affiliate_accounts a
      where a.id = partner_account_id and a.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists external_affiliate_conversions_owner_all on public.external_affiliate_conversions;
create policy external_affiliate_conversions_owner_all on public.external_affiliate_conversions
  for all to authenticated using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid()) and exists (
      select 1 from public.external_affiliate_accounts a
      where a.id = partner_account_id and a.owner_user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.external_affiliate_accounts to authenticated;
grant select, insert, update, delete on public.external_affiliate_clicks to authenticated;
grant select, insert, update, delete on public.external_affiliate_conversions to authenticated;
revoke all on public.external_affiliate_accounts from anon;
revoke all on public.external_affiliate_clicks from anon;
revoke all on public.external_affiliate_conversions from anon;
