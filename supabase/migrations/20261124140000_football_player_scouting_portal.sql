-- International Football Scouting & Player Discovery Portal
-- Koroma Leone Tech SME Business OS

create table if not exists public.football_player_discovery_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid not null references public.football_club_websites(id) on delete cascade,
  squad_member_id uuid not null references public.football_club_website_squad(id) on delete cascade,
  public_slug text not null unique,
  public_name text not null check (char_length(trim(public_name)) between 2 and 80),
  age_band text not null default '22+' check (age_band in ('Under 18','18-21','22+')),
  is_minor boolean generated always as (age_band = 'Under 18') stored,
  position text not null check (position in ('Goalkeeper','Defender','Midfielder','Forward','Winger','Striker','Other')),
  secondary_position text,
  nationality text,
  preferred_foot text check (preferred_foot is null or preferred_foot in ('Right','Left','Both')),
  height_cm integer check (height_cm is null or height_cm between 100 and 230),
  profile_summary text check (profile_summary is null or char_length(profile_summary) <= 1200),
  playing_history jsonb not null default '[]'::jsonb check (jsonb_typeof(playing_history) = 'array'),
  achievements text check (achievements is null or char_length(achievements) <= 2000),
  current_season text,
  appearances integer not null default 0 check (appearances >= 0),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  clean_sheets integer not null default 0 check (clean_sheets >= 0),
  player_image_url text,
  highlight_video_url text,
  highlight_video_type text not null default 'link' check (highlight_video_type in ('link','mp4','webm')),
  scouting_status text not null default 'draft' check (scouting_status in ('draft','published','rejected')),
  is_featured boolean not null default false,
  club_approved_by uuid references auth.users(id) on delete set null,
  club_approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (squad_member_id),
  check (highlight_video_url is null or highlight_video_url ~* '^https?://')
);

create index if not exists football_player_discovery_public_idx
  on public.football_player_discovery_profiles (scouting_status, is_featured desc, updated_at desc);
create index if not exists football_player_discovery_club_idx
  on public.football_player_discovery_profiles (business_id, scouting_status);
create index if not exists football_player_discovery_filters_idx
  on public.football_player_discovery_profiles (position, age_band, nationality);

create table if not exists public.football_player_discovery_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null unique references public.football_player_discovery_profiles(id) on delete cascade,
  player_or_parent_consent boolean not null default false,
  guardian_consent boolean not null default false,
  consent_method text not null default 'not_recorded'
    check (consent_method in ('written','electronic','in_person','not_recorded')),
  evidence_reference text check (evidence_reference is null or char_length(evidence_reference) <= 300),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.football_scout_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  organisation text not null check (char_length(trim(organisation)) between 2 and 160),
  job_title text,
  contact_email text not null,
  country text not null,
  website_url text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','suspended')),
  verification_comment text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (website_url is null or website_url ~* '^https?://'),
  check (contact_email ~* '^[^ @]+@[^ @]+\.[^ @]+$')
);
create index if not exists football_scout_accounts_review_idx
  on public.football_scout_accounts (verification_status, created_at desc);

create table if not exists public.football_scout_enquiries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid not null references public.football_club_websites(id) on delete cascade,
  profile_id uuid not null references public.football_player_discovery_profiles(id) on delete cascade,
  scout_user_id uuid not null references auth.users(id) on delete restrict,
  scout_name text not null,
  scout_organisation text not null,
  scout_email text not null,
  enquiry_type text not null default 'Player scouting'
    check (enquiry_type in ('Player scouting','Trial invitation','Additional footage','Club partnership','Other')),
  message text not null check (char_length(trim(message)) between 20 and 3000),
  status text not null default 'new' check (status in ('new','reviewing','responded','closed')),
  club_response text check (club_response is null or char_length(club_response) <= 3000),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists football_scout_enquiries_club_idx
  on public.football_scout_enquiries (business_id, status, created_at desc);
create index if not exists football_scout_enquiries_scout_idx
  on public.football_scout_enquiries (scout_user_id, created_at desc);

alter table public.football_player_discovery_profiles enable row level security;
alter table public.football_player_discovery_consents enable row level security;
alter table public.football_scout_accounts enable row level security;
alter table public.football_scout_enquiries enable row level security;

grant select on public.football_player_discovery_profiles to anon, authenticated;
grant insert, update on public.football_player_discovery_profiles to authenticated;
grant select on public.football_player_discovery_consents to authenticated;
grant insert, update on public.football_player_discovery_consents to authenticated;
grant select on public.football_scout_accounts to authenticated;
grant insert (user_id,full_name,organisation,job_title,contact_email,country,website_url)
  on public.football_scout_accounts to authenticated;
grant update (full_name,organisation,job_title,contact_email,country,website_url,updated_at)
  on public.football_scout_accounts to authenticated;
grant select, update on public.football_scout_enquiries to authenticated;
grant update (status,club_response,responded_by,responded_at,updated_at)
  on public.football_scout_enquiries to authenticated;

create or replace function public.football_player_discovery_has_consent(p_profile_id uuid,p_is_minor boolean)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.football_player_discovery_consents c
    where c.profile_id=p_profile_id and c.player_or_parent_consent=true
      and c.withdrawn_at is null
      and (coalesce(p_is_minor,false)=false or c.guardian_consent=true)
  );
$function$;
revoke all on function public.football_player_discovery_has_consent(uuid,boolean) from public;
grant execute on function public.football_player_discovery_has_consent(uuid,boolean) to anon,authenticated;

drop policy if exists football_player_discovery_profiles_select on public.football_player_discovery_profiles;
create policy football_player_discovery_profiles_select on public.football_player_discovery_profiles
for select to anon,authenticated using (
  (scouting_status='published' and public.is_published_football_club_website(business_id)
    and public.football_player_discovery_has_consent(id,is_minor))
  or public.can_manage_football_club_website_content(business_id,'squad')
);
drop policy if exists football_player_discovery_profiles_insert on public.football_player_discovery_profiles;
create policy football_player_discovery_profiles_insert on public.football_player_discovery_profiles
for insert to authenticated with check (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]) or scouting_status='draft')
  and exists(select 1 from public.football_club_websites w where w.id=website_id and w.business_id=football_player_discovery_profiles.business_id)
  and exists(select 1 from public.football_club_website_squad s where s.id=squad_member_id and s.business_id=football_player_discovery_profiles.business_id)
);
drop policy if exists football_player_discovery_profiles_update on public.football_player_discovery_profiles;
create policy football_player_discovery_profiles_update on public.football_player_discovery_profiles
for update to authenticated using (public.can_manage_football_club_website_content_direct(business_id,'squad'))
with check (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]) or scouting_status='draft')
  and exists(select 1 from public.football_club_websites w where w.id=website_id and w.business_id=football_player_discovery_profiles.business_id)
  and exists(select 1 from public.football_club_website_squad s where s.id=squad_member_id and s.business_id=football_player_discovery_profiles.business_id)
);

drop policy if exists football_player_discovery_consents_select on public.football_player_discovery_consents;
create policy football_player_discovery_consents_select on public.football_player_discovery_consents
for select to authenticated using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));
drop policy if exists football_player_discovery_consents_insert on public.football_player_discovery_consents;
create policy football_player_discovery_consents_insert on public.football_player_discovery_consents
for insert to authenticated with check (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  and exists(select 1 from public.football_player_discovery_profiles p where p.id=profile_id and p.business_id=football_player_discovery_consents.business_id)
);
drop policy if exists football_player_discovery_consents_update on public.football_player_discovery_consents;
create policy football_player_discovery_consents_update on public.football_player_discovery_consents
for update to authenticated using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
with check (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  and exists(select 1 from public.football_player_discovery_profiles p where p.id=profile_id and p.business_id=football_player_discovery_consents.business_id)
);

create or replace function public.guard_football_player_discovery_publication()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  if new.scouting_status='published' then
    if not public.has_business_role(new.business_id,array['owner','admin','manager']::public.business_role[]) then
      raise exception 'Only the club owner, administrator or manager can approve and publish a player scouting profile.';
    end if;
    if not public.football_player_discovery_has_consent(new.id,new.is_minor) then
      raise exception 'Player consent is required; guardian consent is also required for a player under 18.';
    end if;
    new.club_approved_by:=auth.uid();
    new.club_approved_at:=now();
  end if;
  new.updated_at:=now();
  if auth.uid() is not null then new.updated_by:=auth.uid(); end if;
  return new;
end;
$function$;
revoke all on function public.guard_football_player_discovery_publication() from public,anon,authenticated;
drop trigger if exists guard_football_player_discovery_publication on public.football_player_discovery_profiles;
create trigger guard_football_player_discovery_publication before insert or update
on public.football_player_discovery_profiles for each row
execute function public.guard_football_player_discovery_publication();

drop trigger if exists football_player_discovery_profile_activity on public.football_player_discovery_profiles;
create trigger football_player_discovery_profile_activity after insert or update or delete
on public.football_player_discovery_profiles for each row
execute function public.log_football_club_website_activity();

drop policy if exists football_scout_accounts_select on public.football_scout_accounts;
create policy football_scout_accounts_select on public.football_scout_accounts
for select to authenticated using (user_id=auth.uid() or public.is_platform_developer());
drop policy if exists football_scout_accounts_insert on public.football_scout_accounts;
create policy football_scout_accounts_insert on public.football_scout_accounts
for insert to authenticated with check (user_id=auth.uid() and verification_status='pending');
drop policy if exists football_scout_accounts_update on public.football_scout_accounts;
create policy football_scout_accounts_update on public.football_scout_accounts
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists football_scout_enquiries_select on public.football_scout_enquiries;
create policy football_scout_enquiries_select on public.football_scout_enquiries
for select to authenticated using (
  scout_user_id=auth.uid()
  or public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website_content(business_id,'enquiries'))
);
drop policy if exists football_scout_enquiries_update on public.football_scout_enquiries;
create policy football_scout_enquiries_update on public.football_scout_enquiries
for update to authenticated using (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website_content_direct(business_id,'enquiries'))
)
with check (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website_content_direct(business_id,'enquiries'))
);

create or replace function public.football_scout_portal_is_developer()
returns boolean language sql stable security invoker set search_path = ''
as $function$ select auth.uid() is not null and public.is_platform_developer(); $function$;
revoke all on function public.football_scout_portal_is_developer() from public,anon;
grant execute on function public.football_scout_portal_is_developer() to authenticated;

create or replace function public.review_football_scout_account(p_account_id uuid,p_decision text,p_comment text default null)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_account public.football_scout_accounts%rowtype;
begin
  if auth.uid() is null or not public.is_platform_developer() then raise exception 'Only the Koroma Leone Tech platform developer can review scout accounts.'; end if;
  if p_decision not in ('verified','rejected','suspended') then raise exception 'Choose verify, reject or suspend.'; end if;
  select * into v_account from public.football_scout_accounts where id=p_account_id for update;
  if not found then raise exception 'Scout account not found.'; end if;
  update public.football_scout_accounts set verification_status=p_decision,
    verification_comment=nullif(trim(coalesce(p_comment,'')),''),
    verified_by=case when p_decision='verified' then auth.uid() else verified_by end,
    verified_at=case when p_decision='verified' then now() else verified_at end,updated_at=now()
  where id=p_account_id;
  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  values (
    v_account.user_id,null,'approvals',
    case p_decision when 'verified' then 'Scout account verified' when 'suspended' then 'Scout account suspended' else 'Scout account not approved' end,
    case p_decision when 'verified' then 'Your Koroma Leone Tech scouting portal account has been verified. You can now send player enquiries.'
      when 'suspended' then 'Your scouting portal account has been suspended. Contact Koroma Leone Tech for assistance.'
      else 'Your scouting portal verification was not approved.' end
      || case when nullif(trim(coalesce(p_comment,'')),'') is not null then ' Review note: '||trim(p_comment) else '' end,
    'football-scouting','scout-review-'||p_account_id::text||'-'||p_decision||'-'||extract(epoch from now())::bigint::text
  );
  return true;
end;
$function$;
revoke all on function public.review_football_scout_account(uuid,text,text) from public,anon;
grant execute on function public.review_football_scout_account(uuid,text,text) to authenticated;

create or replace function public.submit_football_scout_enquiry(p_profile_id uuid,p_enquiry_type text,p_message text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_profile public.football_player_discovery_profiles%rowtype; v_scout public.football_scout_accounts%rowtype;
  v_email text; v_enquiry_id uuid; v_daily_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in with your verified scout account to contact a club.'; end if;
  if char_length(trim(coalesce(p_message,'')))<20 or char_length(trim(p_message))>3000 then raise exception 'Your enquiry must contain between 20 and 3000 characters.'; end if;
  if p_enquiry_type not in ('Player scouting','Trial invitation','Additional footage','Club partnership','Other') then raise exception 'Choose a valid enquiry type.'; end if;
  select * into v_scout from public.football_scout_accounts where user_id=auth.uid() and verification_status='verified';
  if not found then raise exception 'Your scout account must be verified by Koroma Leone Tech before you can contact clubs.'; end if;
  select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirm your scout account email before sending enquiries.'; end if;
  select * into v_profile from public.football_player_discovery_profiles
  where id=p_profile_id and scouting_status='published'
    and public.is_published_football_club_website(business_id)
    and public.football_player_discovery_has_consent(id,is_minor);
  if not found then raise exception 'This player profile is not currently available for scouting enquiries.'; end if;
  select count(*) into v_daily_count from public.football_scout_enquiries
  where scout_user_id=auth.uid() and created_at>=now()-interval '24 hours';
  if v_daily_count>=15 then raise exception 'The daily scouting enquiry limit has been reached. Try again later.'; end if;
  insert into public.football_scout_enquiries(
    business_id,website_id,profile_id,scout_user_id,scout_name,scout_organisation,scout_email,enquiry_type,message
  ) values (
    v_profile.business_id,v_profile.website_id,v_profile.id,auth.uid(),v_scout.full_name,
    v_scout.organisation,v_email,p_enquiry_type,trim(p_message)
  ) returning id into v_enquiry_id;
  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  select bm.user_id,v_profile.business_id,'approvals','New international scouting enquiry',
    'A verified scout from '||v_scout.organisation||' sent an enquiry about a player profile.',
    'club-website-studio','scout-enquiry-'||v_enquiry_id::text||'-'||bm.user_id::text
  from public.business_members bm where bm.business_id=v_profile.business_id and bm.is_active=true
    and bm.role::text in ('owner','admin','manager');
  return v_enquiry_id;
end;
$function$;
revoke all on function public.submit_football_scout_enquiry(uuid,text,text) from public,anon;
grant execute on function public.submit_football_scout_enquiry(uuid,text,text) to authenticated;

create or replace function public.notify_football_scout_enquiry_response()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.status is distinct from old.status or new.club_response is distinct from old.club_response then
    insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    values (
      new.scout_user_id,new.business_id,'approvals','Club responded to your scouting enquiry',
      coalesce(nullif(new.club_response,''),'The club updated the status of your scouting enquiry.'),
      'football-scouting','scout-response-'||new.id::text||'-'||extract(epoch from now())::bigint::text
    );
  end if;
  return new;
end;
$function$;
revoke all on function public.notify_football_scout_enquiry_response() from public,anon,authenticated;
drop trigger if exists notify_football_scout_enquiry_response on public.football_scout_enquiries;
create trigger notify_football_scout_enquiry_response after update of status,club_response
on public.football_scout_enquiries for each row execute function public.notify_football_scout_enquiry_response();

create or replace function public.submit_football_club_website_change(
  p_business_id uuid,p_target_table text,p_target_id uuid,p_operation text,p_content jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_website public.football_club_websites%rowtype; v_delegation public.football_club_website_delegations%rowtype;
  v_request_id uuid; v_exists boolean; v_permission text;
  v_allowed_tables constant text[] := array[
    'football_club_websites','football_club_website_pages','football_club_website_news',
    'football_club_website_squad','football_club_website_staff','football_club_website_fixtures',
    'football_club_website_standings','football_club_website_transfers','football_club_website_gallery',
    'football_club_website_sponsors','football_club_website_events','football_club_website_honours',
    'football_player_discovery_profiles'
  ];
begin
  if auth.uid() is null or not public.is_platform_developer() then raise exception 'Only the Koroma Leone Tech platform developer can submit delegated website changes.'; end if;
  if not (p_target_table=any(v_allowed_tables)) then raise exception 'This content type is not eligible for delegated changes.'; end if;
  if p_operation not in ('insert','update','delete') then raise exception 'Unsupported change operation.'; end if;
  if jsonb_typeof(coalesce(p_content,'{}'::jsonb))<>'object' then raise exception 'Change content must be a JSON object.'; end if;
  v_permission:=case p_target_table
    when 'football_club_websites' then 'profile' when 'football_club_website_pages' then 'pages'
    when 'football_club_website_news' then 'news' when 'football_club_website_squad' then 'squad'
    when 'football_player_discovery_profiles' then 'squad'
    when 'football_club_website_staff' then 'staff' when 'football_club_website_fixtures' then 'fixtures'
    when 'football_club_website_standings' then 'standings' when 'football_club_website_transfers' then 'transfers'
    when 'football_club_website_gallery' then 'gallery' when 'football_club_website_sponsors' then 'sponsors'
    when 'football_club_website_events' then 'events' when 'football_club_website_honours' then 'honours'
  end;
  if not public.can_manage_football_club_website_content(p_business_id,v_permission) then raise exception 'The club has not granted you permission for this content area.'; end if;
  select * into v_website from public.football_club_websites where business_id=p_business_id;
  if not found then raise exception 'Club website does not exist.'; end if;
  select * into v_delegation from public.football_club_website_delegations
  where business_id=p_business_id and website_id=v_website.id and status='active';
  if not found then raise exception 'This club has not authorised active Koroma Leone Tech website management.'; end if;
  if v_delegation.approval_mode<>'approval_required' then raise exception 'This club uses direct publishing. Save the change directly instead.'; end if;
  if p_target_table='football_club_websites' and p_operation<>'update' then raise exception 'A club website profile can only be updated, not inserted or deleted here.'; end if;
  if p_target_table='football_player_discovery_profiles' and p_operation='delete' then raise exception 'Scouting profiles cannot be deleted by developer submission.'; end if;
  if p_operation='insert' and p_target_id is not null then raise exception 'A new content item must not include an existing record ID.'; end if;
  if p_operation in ('update','delete') then
    if p_target_id is null then raise exception 'The record ID is required for updates and deletions.'; end if;
    execute format('select exists(select 1 from public.%I where id=$1 and business_id=$2)',p_target_table) into v_exists using p_target_id,p_business_id;
    if not v_exists then raise exception 'The target record does not exist in this club website.'; end if;
  end if;
  insert into public.football_club_website_change_requests(business_id,website_id,submitted_by,target_table,target_id,operation,proposed_content)
  values(p_business_id,v_website.id,auth.uid(),p_target_table,p_target_id,p_operation,coalesce(p_content,'{}'::jsonb))
  returning id into v_request_id;
  insert into public.football_club_website_activity(business_id,website_id,actor_user_id,actor_type,action,target_table,target_id,summary,metadata)
  values(p_business_id,v_website.id,auth.uid(),'platform_developer','submitted_for_approval',p_target_table,p_target_id,
    'Submitted a website change for club approval.',jsonb_build_object('request_id',v_request_id,'operation',p_operation));
  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  select bm.user_id,p_business_id,'approvals','Website update awaiting approval',
    'Koroma Leone Tech submitted a website content change for your review.','club-website-studio',
    'fcw-submit-'||v_request_id::text||'-'||bm.user_id::text
  from public.business_members bm where bm.business_id=p_business_id and bm.is_active=true and bm.role::text in ('owner','admin','manager');
  return v_request_id;
end;
$function$;
revoke all on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) from public,anon;
grant execute on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) to authenticated;

create or replace function public.review_football_club_website_change(
  p_request_id uuid,p_decision text,p_manager_comment text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_req public.football_club_website_change_requests%rowtype; v_keys text[]; v_column_list text;
  v_select_list text; v_set_list text; v_sql text; v_rows integer; v_website_id uuid;
  v_allowed_tables constant text[] := array[
    'football_club_websites','football_club_website_pages','football_club_website_news',
    'football_club_website_squad','football_club_website_staff','football_club_website_fixtures',
    'football_club_website_standings','football_club_website_transfers','football_club_website_gallery',
    'football_club_website_sponsors','football_club_website_events','football_club_website_honours',
    'football_player_discovery_profiles'
  ];
begin
  if auth.uid() is null then raise exception 'You must sign in to review website changes.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
  select * into v_req from public.football_club_website_change_requests where id=p_request_id for update;
  if not found then raise exception 'Change request not found.'; end if;
  if not public.has_business_role(v_req.business_id,array['owner','admin','manager']::public.business_role[]) then raise exception 'Only the club owner, administrator or manager can review website changes.'; end if;
  if v_req.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
  if not (v_req.target_table=any(v_allowed_tables)) then raise exception 'This requested content type cannot be reviewed.'; end if;
  if v_req.operation not in ('insert','update','delete') then raise exception 'Unsupported change operation.'; end if;
  if v_req.target_table='football_club_websites' and v_req.operation<>'update' then raise exception 'A club website profile can only be updated, not inserted or deleted through an approval.'; end if;
  if v_req.target_table='football_player_discovery_profiles' and v_req.operation='delete' then raise exception 'Scouting profiles cannot be deleted through developer approval.'; end if;
  if v_req.operation in ('update','delete') and v_req.target_id is null then raise exception 'The target record ID is missing.'; end if;
  if v_req.operation='insert' and v_req.target_id is not null then raise exception 'An insert request cannot target an existing record ID.'; end if;
  if p_decision='approved' then
    if v_req.operation='insert' then
      select array_agg(keys.key order by keys.key) into v_keys
      from jsonb_object_keys(v_req.proposed_content) as keys(key)
      where keys.key not in ('id','business_id','created_at','updated_at','is_minor','club_approved_by','club_approved_at')
        and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_req.target_table and c.column_name=keys.key);
      if coalesce(array_length(v_keys,1),0)=0 then raise exception 'The submitted content contains no recognised fields.'; end if;
      select string_agg(format('%I',selected.key),', ' order by selected.key),string_agg(format('r.%I',selected.key),', ' order by selected.key)
      into v_column_list,v_select_list from unnest(v_keys) as selected(key);
      v_sql:=format('insert into public.%I (business_id,%s) select $1,%s from jsonb_populate_record(null::public.%I,$2) as r',
        v_req.target_table,v_column_list,v_select_list,v_req.target_table);
      execute v_sql using v_req.business_id,v_req.proposed_content;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'The content item was not inserted.'; end if;
    elsif v_req.operation='update' then
      select array_agg(keys.key order by keys.key) into v_keys
      from jsonb_object_keys(v_req.proposed_content) as keys(key)
      where keys.key not in ('id','business_id','created_at','updated_at','is_minor','club_approved_by','club_approved_at')
        and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_req.target_table and c.column_name=keys.key);
      if coalesce(array_length(v_keys,1),0)=0 then raise exception 'The submitted content contains no editable fields.'; end if;
      select string_agg(format('%I = r.%I',selected.key,selected.key),', ' order by selected.key)
      into v_set_list from unnest(v_keys) as selected(key);
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=v_req.target_table and column_name='updated_at') then v_set_list:=v_set_list||', updated_at=now()'; end if;
      v_sql:=format('update public.%I as t set %s from jsonb_populate_record(null::public.%I,$1) as r where t.id=$2 and t.business_id=$3',
        v_req.target_table,v_set_list,v_req.target_table);
      execute v_sql using v_req.proposed_content,v_req.target_id,v_req.business_id;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'The target record was not updated.'; end if;
    elsif v_req.operation='delete' then
      execute format('delete from public.%I where id=$1 and business_id=$2',v_req.target_table) using v_req.target_id,v_req.business_id;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'The target record was not deleted.'; end if;
    end if;
  end if;
  update public.football_club_website_change_requests set status=p_decision,manager_comment=nullif(trim(coalesce(p_manager_comment,'')),''),
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
  select id into v_website_id from public.football_club_websites where business_id=v_req.business_id;
  insert into public.football_club_website_activity(business_id,website_id,actor_user_id,actor_type,action,target_table,target_id,summary,metadata)
  values(v_req.business_id,v_website_id,auth.uid(),'club_user',case when p_decision='approved' then 'change_approved' else 'change_rejected' end,
    v_req.target_table,v_req.target_id,case when p_decision='approved' then 'Approved a website content change.' else 'Rejected a website content change.' end,
    jsonb_build_object('request_id',p_request_id,'comment',p_manager_comment));
  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  values(v_req.submitted_by,v_req.business_id,'approvals',
    case when p_decision='approved' then 'Website update approved' else 'Website update rejected' end,
    case when p_decision='approved' then 'The club approved your submitted website update.' else 'The club rejected your submitted website update.' end
      || case when nullif(trim(coalesce(p_manager_comment,'')),'') is not null then ' Manager note: '||trim(p_manager_comment) else '' end,
    'club-website-studio','fcw-review-'||p_request_id::text||'-'||p_decision);
  return true;
end;
$function$;
revoke all on function public.review_football_club_website_change(uuid,text,text) from public,anon;
grant execute on function public.review_football_club_website_change(uuid,text,text) to authenticated;

drop policy if exists football_club_change_requests_select on public.football_club_website_change_requests;
create policy football_club_change_requests_select on public.football_club_website_change_requests
for select to authenticated using (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website_content(business_id,
    case target_table
      when 'football_club_websites' then 'profile' when 'football_club_website_pages' then 'pages'
      when 'football_club_website_news' then 'news' when 'football_club_website_squad' then 'squad'
      when 'football_player_discovery_profiles' then 'squad' when 'football_club_website_staff' then 'staff'
      when 'football_club_website_fixtures' then 'fixtures' when 'football_club_website_standings' then 'standings'
      when 'football_club_website_transfers' then 'transfers' when 'football_club_website_gallery' then 'gallery'
      when 'football_club_website_sponsors' then 'sponsors' when 'football_club_website_events' then 'events'
      when 'football_club_website_honours' then 'honours' else null end))
);
drop policy if exists football_club_activity_select on public.football_club_website_activity;
create policy football_club_activity_select on public.football_club_website_activity
for select to authenticated using (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website_content(business_id,
    case target_table
      when 'football_club_websites' then 'profile' when 'football_club_website_delegations' then 'profile'
      when 'football_club_website_pages' then 'pages' when 'football_club_website_news' then 'news'
      when 'football_club_website_squad' then 'squad' when 'football_player_discovery_profiles' then 'squad'
      when 'football_club_website_staff' then 'staff' when 'football_club_website_fixtures' then 'fixtures'
      when 'football_club_website_standings' then 'standings' when 'football_club_website_transfers' then 'transfers'
      when 'football_club_website_gallery' then 'gallery' when 'football_club_website_sponsors' then 'sponsors'
      when 'football_club_website_events' then 'events' when 'football_club_website_honours' then 'honours'
      when 'football_scout_enquiries' then 'enquiries' else null end))
);

comment on table public.football_player_discovery_profiles is 'Public-facing football scouting profiles. Under-18 players are protected by separate private consent rows.';
comment on table public.football_player_discovery_consents is 'Private club-held evidence that player and, when applicable, guardian consent was obtained.';
comment on table public.football_scout_accounts is 'Private registered scout accounts requiring platform-developer verification before enquiries.';
comment on table public.football_scout_enquiries is 'Private scout-to-club player enquiries.';
