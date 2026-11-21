-- Platform-level "Refer & Earn" growth program.
-- Any signed-in account gets a referral code/link. When a business they referred
-- becomes a PAYING subscriber (first verified subscription payment), the referrer
-- earns a cash reward that the platform developer reviews and marks paid manually,
-- the same trusted, no-auto-payout pattern already used for Orange Money invoices.

create table if not exists public.platform_referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  visitor_token uuid not null,
  referred_user_id uuid references auth.users(id) on delete set null,
  referred_business_id uuid references public.businesses(id) on delete set null unique,
  status text not null default 'clicked' check (status in ('clicked','business_created','converted','rejected')),
  first_clicked_at timestamptz not null default now(),
  business_created_at timestamptz,
  converted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (referral_code, visitor_token)
);

create index if not exists platform_referrals_referrer_idx on public.platform_referrals(referrer_user_id);

create table if not exists public.platform_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.platform_referrals(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount numeric(12,2) not null,
  currency_code text not null,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists platform_referral_rewards_referrer_idx on public.platform_referral_rewards(referrer_user_id);

create table if not exists public.platform_referral_settings (
  singleton boolean primary key default true,
  is_enabled boolean not null default true,
  reward_amount numeric(12,2) not null default 100,
  currency_code text not null default 'SLE',
  updated_at timestamptz not null default now(),
  constraint platform_referral_settings_singleton check (singleton)
);
insert into public.platform_referral_settings (singleton) values (true) on conflict (singleton) do nothing;

alter table public.platform_referral_codes enable row level security;
alter table public.platform_referrals enable row level security;
alter table public.platform_referral_rewards enable row level security;
alter table public.platform_referral_settings enable row level security;

drop policy if exists platform_referral_codes_owner on public.platform_referral_codes;
create policy platform_referral_codes_owner on public.platform_referral_codes
  for select using (user_id = auth.uid() or public.is_platform_developer());

drop policy if exists platform_referrals_read on public.platform_referrals;
create policy platform_referrals_read on public.platform_referrals
  for select using (referrer_user_id = auth.uid() or public.is_platform_developer());

drop policy if exists platform_referral_rewards_read on public.platform_referral_rewards;
create policy platform_referral_rewards_read on public.platform_referral_rewards
  for select using (referrer_user_id = auth.uid() or public.is_platform_developer());

drop policy if exists platform_referral_rewards_developer_write on public.platform_referral_rewards;
create policy platform_referral_rewards_developer_write on public.platform_referral_rewards
  for update using (public.is_platform_developer());

drop policy if exists platform_referral_settings_read on public.platform_referral_settings;
create policy platform_referral_settings_read on public.platform_referral_settings
  for select using (true);

drop policy if exists platform_referral_settings_developer_write on public.platform_referral_settings;
create policy platform_referral_settings_developer_write on public.platform_referral_settings
  for all using (public.is_platform_developer());

-- Get (or lazily create) the caller's own referral code.
create or replace function public.get_or_create_my_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_candidate text;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select code into v_code from public.platform_referral_codes where user_id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_candidate := 'WL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.platform_referral_codes (user_id, code) values (auth.uid(), v_candidate);
      return v_candidate;
    exception when unique_violation then
      if v_attempt > 8 then
        raise exception 'Could not generate a unique referral code, try again';
      end if;
    end;
  end loop;
end;
$$;

-- Record an inbound click on a referral link (anonymous visitor, before signup).
create or replace function public.track_platform_referral(p_referral_code text, p_visitor_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
  v_code text := upper(trim(coalesce(p_referral_code, '')));
begin
  if p_visitor_token is null or length(v_code) < 4 or length(v_code) > 24 then
    return;
  end if;

  select user_id into v_referrer from public.platform_referral_codes where code = v_code;
  if v_referrer is null then
    return;
  end if;

  insert into public.platform_referrals (referral_code, referrer_user_id, visitor_token)
  values (v_code, v_referrer, p_visitor_token)
  on conflict (referral_code, visitor_token) do nothing;
end;
$$;

-- Link a freshly created business to whichever referral click (by visitor token)
-- brought the signed-in owner here. Self-referrals are recorded but rejected.
create or replace function public.link_platform_referral_to_business(p_visitor_token uuid, p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral public.platform_referrals%rowtype;
begin
  if auth.uid() is null or p_visitor_token is null or p_business_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid() and role = 'owner' and is_active
  ) then
    return;
  end if;

  select * into v_referral
  from public.platform_referrals
  where visitor_token = p_visitor_token
    and referred_business_id is null
    and status = 'clicked'
  order by first_clicked_at desc
  limit 1;

  if not found then
    return;
  end if;

  if v_referral.referrer_user_id = auth.uid() then
    update public.platform_referrals
    set status = 'rejected', updated_at = now()
    where id = v_referral.id;
    return;
  end if;

  update public.platform_referrals
  set referred_user_id = auth.uid(),
      referred_business_id = p_business_id,
      status = 'business_created',
      business_created_at = now(),
      updated_at = now()
  where id = v_referral.id;
end;
$$;

-- When a business's FIRST subscription payment is verified, convert any pending
-- referral for that business into an earned (pending-review) reward.
create or replace function public.platform_referral_on_payment_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prior_count int;
  v_referral public.platform_referrals%rowtype;
  v_settings public.platform_referral_settings%rowtype;
begin
  if new.event_type <> 'payment_verified' then
    return new;
  end if;

  select count(*) into v_prior_count
  from public.subscription_events
  where business_id = new.business_id and event_type = 'payment_verified';

  if v_prior_count <> 1 then
    return new;
  end if;

  select * into v_referral
  from public.platform_referrals
  where referred_business_id = new.business_id
    and status = 'business_created';

  if not found then
    return new;
  end if;

  update public.platform_referrals
  set status = 'converted', converted_at = now(), updated_at = now()
  where id = v_referral.id;

  select * into v_settings from public.platform_referral_settings where singleton = true;

  if v_settings.is_enabled is true then
    insert into public.platform_referral_rewards
      (referral_id, referrer_user_id, business_id, amount, currency_code)
    values
      (v_referral.id, v_referral.referrer_user_id, new.business_id,
       v_settings.reward_amount, v_settings.currency_code);
  end if;

  return new;
end;
$$;

drop trigger if exists platform_referral_on_payment_verified_trg on public.subscription_events;
create trigger platform_referral_on_payment_verified_trg
  after insert on public.subscription_events
  for each row execute function public.platform_referral_on_payment_verified();

-- Developer-only: mark a reward approved/paid/rejected.
create or replace function public.review_platform_referral_reward(p_reward_id uuid, p_status text, p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.platform_referral_rewards%rowtype;
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Platform Developer access required';
  end if;
  if p_status not in ('approved','paid','rejected') then
    raise exception 'Invalid status';
  end if;

  select * into v_reward from public.platform_referral_rewards where id = p_reward_id for update;
  if not found then
    raise exception 'Reward not found';
  end if;

  update public.platform_referral_rewards
  set status = p_status,
      notes = nullif(trim(coalesce(p_notes,'')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      paid_at = case when p_status = 'paid' then now() else paid_at end
  where id = p_reward_id;

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

grant execute on function public.get_or_create_my_referral_code() to authenticated;
grant execute on function public.track_platform_referral(text, uuid) to anon, authenticated;
grant execute on function public.link_platform_referral_to_business(uuid, uuid) to authenticated;
grant execute on function public.review_platform_referral_reward(uuid, text, text) to authenticated;
