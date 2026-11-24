-- Football Club Onboarding & Verification Centre
-- Koroma Leone Tech SME Business OS
-- Club applications are submitted by email-verified users and reviewed by the platform developer.
-- Approval atomically provisions the club-owned workspace, manager membership, module and verified website draft.

alter table public.football_club_websites
  add column if not exists verification_status text not null default 'unverified';
alter table public.football_club_websites
  add column if not exists verified_at timestamptz;
alter table public.football_club_websites
  add column if not exists verified_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.football_club_websites'::regclass
      and conname = 'football_club_websites_verification_status_check'
  ) then
    alter table public.football_club_websites
      add constraint football_club_websites_verification_status_check
      check (verification_status in ('unverified','verified','suspended'));
  end if;
end $$;

create table if not exists public.football_club_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  official_club_name text not null check (char_length(trim(official_club_name)) between 2 and 140),
  short_name text,
  club_type text not null default 'Other' check (club_type in ('Men''s','Women''s','Academy','Other')),
  country text not null default 'Sierra Leone',
  district text,
  city text,
  competition_name text,
  home_ground text,
  club_registration_body text,
  club_registration_number text,
  manager_full_name text not null,
  manager_role text not null,
  contact_email text not null,
  contact_phone text not null,
  official_website_url text,
  proposed_website_slug text not null,
  authority_statement text not null check (char_length(trim(authority_statement)) between 30 and 1500),
  evidence_reference text,
  evidence_path text,
  additional_notes text,
  status text not null default 'submitted'
    check (status in ('submitted','in_review','needs_information','approved','rejected')),
  developer_note text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  business_id uuid references public.businesses(id) on delete set null,
  website_id uuid references public.football_club_websites(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (official_website_url is null or official_website_url ~* '^https?://'),
  check (contact_email ~* '^[^ @]+@[^ @]+\.[^ @]+$'),
  check (char_length(trim(contact_phone)) between 6 and 40),
  check (proposed_website_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists football_club_applications_queue_idx
  on public.football_club_applications(status, created_at desc);
create index if not exists football_club_applications_applicant_idx
  on public.football_club_applications(applicant_user_id, created_at desc);
create unique index if not exists football_club_applications_one_open_per_user
  on public.football_club_applications(applicant_user_id)
  where status in ('submitted','in_review','needs_information');

alter table public.football_club_applications enable row level security;
drop policy if exists football_club_applications_read_own_or_developer
  on public.football_club_applications;
create policy football_club_applications_read_own_or_developer
  on public.football_club_applications
  for select to authenticated
  using (applicant_user_id = auth.uid() or public.is_platform_developer());

revoke all on public.football_club_applications from anon, authenticated;
grant select on public.football_club_applications to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-onboarding-evidence',
  'club-onboarding-evidence',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists club_onboarding_evidence_upload_own on storage.objects;
create policy club_onboarding_evidence_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'club-onboarding-evidence'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists club_onboarding_evidence_read_owner_or_developer on storage.objects;
create policy club_onboarding_evidence_read_owner_or_developer
  on storage.objects for select to authenticated
  using (
    bucket_id = 'club-onboarding-evidence'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.is_platform_developer()
    )
  );

drop policy if exists club_onboarding_evidence_delete_owner_or_developer on storage.objects;
create policy club_onboarding_evidence_delete_owner_or_developer
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'club-onboarding-evidence'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.is_platform_developer()
    )
  );

create or replace function public.submit_football_club_application(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_id uuid;
  v_slug text;
begin
  if v_user is null then raise exception 'Sign in before submitting a club application'; end if;
  select lower(email) into v_email from auth.users
  where id = v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirm your account email before submitting a club application'; end if;

  v_slug := lower(trim(coalesce(p_payload->>'proposed_website_slug','')));
  v_slug := trim(both '-' from regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := trim(both '-' from regexp_replace(lower(coalesce(p_payload->>'official_club_name','')), '[^a-z0-9]+', '-', 'g'));
  end if;

  if exists (
    select 1 from public.football_club_applications
    where applicant_user_id = v_user
      and status in ('submitted','in_review','needs_information')
  ) then
    raise exception 'You already have an active club application. Open its status to continue.';
  end if;

  insert into public.football_club_applications(
    applicant_user_id, official_club_name, short_name, club_type, country,
    district, city, competition_name, home_ground, club_registration_body,
    club_registration_number, manager_full_name, manager_role, contact_email,
    contact_phone, official_website_url, proposed_website_slug, authority_statement,
    evidence_reference, additional_notes
  ) values (
    v_user,
    trim(coalesce(p_payload->>'official_club_name','')),
    nullif(trim(coalesce(p_payload->>'short_name','')),''),
    coalesce(nullif(p_payload->>'club_type',''),'Other'),
    coalesce(nullif(trim(p_payload->>'country'),''),'Sierra Leone'),
    nullif(trim(coalesce(p_payload->>'district','')),''),
    nullif(trim(coalesce(p_payload->>'city','')),''),
    nullif(trim(coalesce(p_payload->>'competition_name','')),''),
    nullif(trim(coalesce(p_payload->>'home_ground','')),''),
    nullif(trim(coalesce(p_payload->>'club_registration_body','')),''),
    nullif(trim(coalesce(p_payload->>'club_registration_number','')),''),
    trim(coalesce(p_payload->>'manager_full_name','')),
    trim(coalesce(p_payload->>'manager_role','')),
    lower(trim(coalesce(p_payload->>'contact_email',v_email))),
    trim(coalesce(p_payload->>'contact_phone','')),
    nullif(trim(coalesce(p_payload->>'official_website_url','')),''),
    v_slug,
    trim(coalesce(p_payload->>'authority_statement','')),
    nullif(trim(coalesce(p_payload->>'evidence_reference','')),''),
    nullif(trim(coalesce(p_payload->>'additional_notes','')),'')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_my_football_club_application(
  p_application_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  v_slug := lower(trim(coalesce(p_payload->>'proposed_website_slug','')));
  v_slug := trim(both '-' from regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := trim(both '-' from regexp_replace(lower(coalesce(p_payload->>'official_club_name','')), '[^a-z0-9]+', '-', 'g'));
  end if;

  update public.football_club_applications
  set official_club_name = trim(coalesce(p_payload->>'official_club_name','')),
      short_name = nullif(trim(coalesce(p_payload->>'short_name','')),''),
      club_type = coalesce(nullif(p_payload->>'club_type',''),'Other'),
      country = coalesce(nullif(trim(p_payload->>'country'),''),'Sierra Leone'),
      district = nullif(trim(coalesce(p_payload->>'district','')),''),
      city = nullif(trim(coalesce(p_payload->>'city','')),''),
      competition_name = nullif(trim(coalesce(p_payload->>'competition_name','')),''),
      home_ground = nullif(trim(coalesce(p_payload->>'home_ground','')),''),
      club_registration_body = nullif(trim(coalesce(p_payload->>'club_registration_body','')),''),
      club_registration_number = nullif(trim(coalesce(p_payload->>'club_registration_number','')),''),
      manager_full_name = trim(coalesce(p_payload->>'manager_full_name','')),
      manager_role = trim(coalesce(p_payload->>'manager_role','')),
      contact_email = lower(trim(coalesce(p_payload->>'contact_email',''))),
      contact_phone = trim(coalesce(p_payload->>'contact_phone','')),
      official_website_url = nullif(trim(coalesce(p_payload->>'official_website_url','')),''),
      proposed_website_slug = v_slug,
      authority_statement = trim(coalesce(p_payload->>'authority_statement','')),
      evidence_reference = nullif(trim(coalesce(p_payload->>'evidence_reference','')),''),
      additional_notes = nullif(trim(coalesce(p_payload->>'additional_notes','')),''),
      status = 'submitted',
      developer_note = '',
      updated_at = now()
  where id = p_application_id
    and applicant_user_id = v_user
    and status = 'needs_information';

  if not found then raise exception 'Only an application awaiting more information can be updated'; end if;
  return p_application_id;
end;
$$;

create or replace function public.attach_my_football_club_application_evidence(
  p_application_id uuid,
  p_evidence_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_evidence_path is null or split_part(p_evidence_path,'/',1) <> v_user::text
     or split_part(p_evidence_path,'/',2) <> p_application_id::text then
    raise exception 'Evidence path does not belong to this application';
  end if;
  update public.football_club_applications
  set evidence_path = p_evidence_path, updated_at = now()
  where id = p_application_id and applicant_user_id = v_user
    and status in ('submitted','needs_information');
  if not found then raise exception 'Application not found or no longer editable'; end if;
end;
$$;

create or replace function public.get_platform_club_applications()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_rows jsonb;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id,
      'applicant_user_id',a.applicant_user_id,
      'applicant_email',u.email,
      'email_confirmed',u.email_confirmed_at is not null,
      'official_club_name',a.official_club_name,
      'short_name',a.short_name,
      'club_type',a.club_type,
      'country',a.country,
      'district',a.district,
      'city',a.city,
      'competition_name',a.competition_name,
      'home_ground',a.home_ground,
      'club_registration_body',a.club_registration_body,
      'club_registration_number',a.club_registration_number,
      'manager_full_name',a.manager_full_name,
      'manager_role',a.manager_role,
      'contact_email',a.contact_email,
      'contact_phone',a.contact_phone,
      'official_website_url',a.official_website_url,
      'proposed_website_slug',a.proposed_website_slug,
      'authority_statement',a.authority_statement,
      'evidence_reference',a.evidence_reference,
      'evidence_path',a.evidence_path,
      'additional_notes',a.additional_notes,
      'status',a.status,
      'developer_note',a.developer_note,
      'business_id',a.business_id,
      'website_id',a.website_id,
      'created_at',a.created_at,
      'reviewed_at',a.reviewed_at
    ) order by a.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.football_club_applications a
  join auth.users u on u.id = a.applicant_user_id
  where a.status in ('submitted','in_review','needs_information');
  return v_rows;
end;
$$;

create or replace function public.review_football_club_application(
  p_application_id uuid,
  p_decision text,
  p_note text default '',
  p_website_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.football_club_applications%rowtype;
  v_email text;
  v_business_id uuid;
  v_website_id uuid;
  v_slug text;
  v_trial_end timestamptz := now() + interval '7 days';
  v_trial_claimed_user uuid;
  v_trial_granted boolean := false;
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Private platform developer access required';
  end if;
  if p_decision not in ('approve','reject','request_information') then
    raise exception 'Decision must be approve, reject or request_information';
  end if;

  select * into v_app
  from public.football_club_applications
  where id = p_application_id
  for update;
  if not found then raise exception 'Club application not found'; end if;
  if v_app.status in ('approved','rejected') then
    raise exception 'This application has already been closed';
  end if;

  if p_decision = 'request_information' then
    if length(trim(coalesce(p_note,''))) < 5 then
      raise exception 'Enter the information you need from the club';
    end if;
    update public.football_club_applications
    set status='needs_information',developer_note=trim(p_note),
        reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_application_id;
    return jsonb_build_object('status','needs_information','application_id',p_application_id);
  end if;

  if p_decision = 'reject' then
    update public.football_club_applications
    set status='rejected',developer_note=coalesce(trim(p_note), ''),
        reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_application_id;
    insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note,updated_at)
    values(v_app.applicant_user_id,'rejected',auth.uid(),now(),coalesce(trim(p_note),''),now())
    on conflict(user_id) do update set status='rejected',reviewed_by=auth.uid(),
      reviewed_at=now(),review_note=excluded.review_note,updated_at=now();
    return jsonb_build_object('status','rejected','application_id',p_application_id);
  end if;

  select lower(email) into v_email
  from auth.users
  where id=v_app.applicant_user_id and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'The applicant must confirm their email before approval';
  end if;

  if not exists(select 1 from public.subscription_plans where code='professional' and is_active=true) then
    raise exception 'The Professional subscription plan is unavailable';
  end if;

  v_slug := lower(trim(coalesce(p_website_slug,v_app.proposed_website_slug,'')));
  v_slug := trim(both '-' from regexp_replace(v_slug,'[^a-z0-9]+','-','g'));
  if v_slug = '' then
    v_slug := trim(both '-' from regexp_replace(lower(v_app.official_club_name),'[^a-z0-9]+','-','g'));
  end if;
  if exists(select 1 from public.football_club_websites where slug=v_slug) then
    v_slug := v_slug || '-' || substr(replace(p_application_id::text,'-',''),1,6);
  end if;
  if exists(select 1 from public.football_club_websites where slug=v_slug) then
    raise exception 'Could not generate a unique website address. Supply another website slug.';
  end if;

  insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note,updated_at)
  values(v_app.applicant_user_id,'approved',auth.uid(),now(),coalesce(trim(p_note),''),now())
  on conflict(user_id) do update set status='approved',reviewed_by=auth.uid(),
    reviewed_at=now(),review_note=excluded.review_note,updated_at=now();

  insert into public.businesses(
    name,industry,currency_code,owner_user_id,contact_email,contact_phone,address,website
  ) values (
    v_app.official_club_name,'Sports & Local League Management','SLE',
    v_app.applicant_user_id,v_app.contact_email,v_app.contact_phone,
    concat_ws(', ',nullif(v_app.home_ground,''),nullif(v_app.city,''),nullif(v_app.district,''),nullif(v_app.country,'')),
    v_app.official_website_url
  ) returning id into v_business_id;

  insert into public.business_members(business_id,user_id,role,is_active,invited_by)
  values(v_business_id,v_app.applicant_user_id,'owner',true,auth.uid());

  insert into public.profiles(id,full_name,phone)
  values(v_app.applicant_user_id,v_app.manager_full_name,v_app.contact_phone)
  on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,updated_at=now();

  insert into public.branches(business_id,name,address)
  values(v_business_id,'Main Branch',concat_ws(', ',nullif(v_app.home_ground,''),nullif(v_app.city,''),nullif(v_app.district,''),nullif(v_app.country,'')));

  insert into public.business_industry_modules(business_id,module_key,is_enabled,configuration,updated_by,updated_at)
  values(v_business_id,'football_club_website',true,jsonb_build_object('activated_by','club_application_approval'),auth.uid(),now())
  on conflict(business_id,module_key) do update set is_enabled=true,
    configuration=excluded.configuration,updated_by=auth.uid(),updated_at=now();

  insert into public.platform_trial_claims(user_id,first_business_id,claimed_at,trial_ends_at)
  values(v_app.applicant_user_id,v_business_id,now(),v_trial_end)
  on conflict(user_id) do nothing
  returning user_id into v_trial_claimed_user;
  v_trial_granted := v_trial_claimed_user is not null;

  if v_trial_granted then
    insert into public.business_subscriptions(
      business_id,plan_code,status,currency_code,billing_cycle,current_period_start,
      current_period_end,trial_ends_at,grace_until,created_at,updated_at
    ) values (
      v_business_id,'professional','trial','SLE','monthly',now(),v_trial_end,
      v_trial_end,null,now(),now()
    );
    insert into public.subscription_events(business_id,actor_user_id,event_type,details)
    values(v_business_id,auth.uid(),'free_trial_started',
      jsonb_build_object('plan_code','professional','trial_days',7,'trial_policy','one_per_account','provisioned_by','club_application_approval'));
  else
    insert into public.business_subscriptions(
      business_id,plan_code,status,currency_code,billing_cycle,current_period_start,
      current_period_end,trial_ends_at,grace_until,created_at,updated_at
    ) values (
      v_business_id,'professional','pending_payment','SLE','monthly',null,null,
      null,null,now(),now()
    );
    insert into public.subscription_events(business_id,actor_user_id,event_type,details)
    values(v_business_id,auth.uid(),'free_trial_not_available',
      jsonb_build_object('plan_code','professional','reason','The account already used its one-time free trial.','provisioned_by','club_application_approval'));
  end if;

  insert into public.football_club_websites(
    business_id,club_name,short_name,slug,country,city,home_ground,
    contact_email,contact_phone,seo_title,seo_description,is_published,
    verification_status,verified_at,verified_by
  ) values (
    v_business_id,v_app.official_club_name,v_app.short_name,v_slug,
    v_app.country,v_app.city,v_app.home_ground,v_app.contact_email,v_app.contact_phone,
    v_app.official_club_name || ' | Official Club Website',
    'Official club website for ' || v_app.official_club_name || '.',
    false,'verified',now(),auth.uid()
  ) returning id into v_website_id;

  insert into public.football_club_website_delegations(
    business_id,website_id,status,approval_mode,permissions,updated_by
  ) values (
    v_business_id,v_website_id,'inactive','direct',
    '{"profile":true,"pages":true,"news":true,"squad":true,"staff":true,"fixtures":true,"standings":true,"transfers":true,"gallery":true,"sponsors":true,"events":true,"honours":true,"enquiries":true}'::jsonb,
    auth.uid()
  );

  update public.football_club_applications
  set status='approved',developer_note=coalesce(trim(p_note),''),
      reviewed_by=auth.uid(),reviewed_at=now(),business_id=v_business_id,
      website_id=v_website_id,updated_at=now()
  where id=p_application_id;

  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(v_business_id,auth.uid(),'football_club_application_approved',
    'football_club_applications',p_application_id::text,
    jsonb_build_object('club_name',v_app.official_club_name,
      'manager_user_id',v_app.applicant_user_id,'website_id',v_website_id,'website_slug',v_slug));

  return jsonb_build_object(
    'status','approved','application_id',p_application_id,
    'business_id',v_business_id,'website_id',v_website_id,
    'website_slug',v_slug,'manager_email',v_email,
    'subscription_status',case when v_trial_granted then 'trial' else 'pending_payment' end,
    'manager_workspace_url','index.html?club-manager=1'
  );
end;
$$;

revoke all on function public.submit_football_club_application(jsonb) from public, anon;
revoke all on function public.update_my_football_club_application(uuid,jsonb) from public, anon;
revoke all on function public.attach_my_football_club_application_evidence(uuid,text) from public, anon;
revoke all on function public.get_platform_club_applications() from public, anon;
revoke all on function public.review_football_club_application(uuid,text,text,text) from public, anon;
grant execute on function public.submit_football_club_application(jsonb) to authenticated;
grant execute on function public.update_my_football_club_application(uuid,jsonb) to authenticated;
grant execute on function public.attach_my_football_club_application_evidence(uuid,text) to authenticated;
grant execute on function public.get_platform_club_applications() to authenticated;
grant execute on function public.review_football_club_application(uuid,text,text,text) to authenticated;
