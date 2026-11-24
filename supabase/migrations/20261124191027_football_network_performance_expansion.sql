-- Structured player career, club match performance, inter-club transfer approvals and scout assessments.
-- This is a club/player workflow. It does not administer league competitions.

begin;

create table if not exists public.football_player_career_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.football_player_discovery_profiles(id) on delete cascade,
  club_name text not null check (char_length(trim(club_name)) between 2 and 140),
  country text, season text, start_date date, end_date date, position text,
  appearances integer not null default 0 check (appearances >= 0),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  honours text,
  summary text check (summary is null or char_length(summary) <= 1200),
  is_current boolean not null default false,
  is_published boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date),
  check (not is_current or end_date is null)
);
create index if not exists football_player_career_history_profile_idx
  on public.football_player_career_history(profile_id, sort_order, start_date desc);
create index if not exists football_player_career_history_business_idx
  on public.football_player_career_history(business_id, profile_id);

alter table public.football_player_career_history enable row level security;
revoke all on public.football_player_career_history from public, anon, authenticated;
grant select (
  id,business_id,profile_id,club_name,country,season,start_date,end_date,position,
  appearances,goals,assists,honours,summary,is_current,is_published,sort_order,created_at,updated_at
) on public.football_player_career_history to anon;
grant select,insert,update,delete on public.football_player_career_history to authenticated;

create policy football_player_career_history_select
on public.football_player_career_history for select to anon, authenticated
using (
  (
    is_published and exists (
      select 1 from public.football_player_discovery_profiles p
      where p.id=profile_id and p.business_id=football_player_career_history.business_id
        and p.scouting_status='published'
        and public.football_player_discovery_has_consent(p.id,p.is_minor)
    )
  )
  or public.can_manage_football_club_website_content_direct(business_id,'squad')
);
create policy football_player_career_history_insert
on public.football_player_career_history for insert to authenticated
with check (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and exists (select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_career_history.business_id)
);
create policy football_player_career_history_update
on public.football_player_career_history for update to authenticated
using (public.can_manage_football_club_website_content_direct(business_id,'squad'))
with check (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and exists (select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_career_history.business_id)
);
create policy football_player_career_history_delete
on public.football_player_career_history for delete to authenticated
using (public.can_manage_football_club_website_content_direct(business_id,'squad'));

create or replace function public.stamp_football_player_career_history()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  if tg_op='INSERT' then new.created_by:=auth.uid(); end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end;
$function$;
revoke all on function public.stamp_football_player_career_history() from public,anon,authenticated;
create trigger stamp_football_player_career_history
before insert or update on public.football_player_career_history
for each row execute function public.stamp_football_player_career_history();


create table if not exists public.football_player_match_performances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  fixture_id uuid not null references public.football_club_website_fixtures(id) on delete cascade,
  squad_member_id uuid not null references public.football_club_website_squad(id) on delete cascade,
  profile_id uuid references public.football_player_discovery_profiles(id) on delete set null,
  minutes_played integer not null default 0 check (minutes_played between 0 and 150),
  goals integer not null default 0 check (goals between 0 and 20),
  assists integer not null default 0 check (assists between 0 and 20),
  clean_sheets integer not null default 0 check (clean_sheets between 0 and 1),
  yellow_cards integer not null default 0 check (yellow_cards between 0 and 2),
  red_cards integer not null default 0 check (red_cards between 0 and 1),
  shots_on_target integer not null default 0 check (shots_on_target between 0 and 30),
  saves integer not null default 0 check (saves between 0 and 40),
  player_rating numeric(3,1) check (player_rating is null or player_rating between 1 and 10),
  coach_notes text check (coach_notes is null or char_length(coach_notes) <= 1200),
  is_approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,squad_member_id)
);
create index if not exists football_player_match_performances_business_idx
  on public.football_player_match_performances(business_id,fixture_id);
create index if not exists football_player_match_performances_profile_idx
  on public.football_player_match_performances(profile_id,created_at desc);

alter table public.football_player_match_performances enable row level security;
revoke all on public.football_player_match_performances from public,anon,authenticated;
grant select (
  id,business_id,fixture_id,squad_member_id,profile_id,minutes_played,goals,assists,
  clean_sheets,yellow_cards,red_cards,shots_on_target,saves,player_rating,approved_at,created_at
) on public.football_player_match_performances to anon;
grant select,insert,update,delete on public.football_player_match_performances to authenticated;

create policy football_player_match_performances_select
on public.football_player_match_performances for select to anon, authenticated
using (
  (
    is_approved and profile_id is not null
    and exists (
      select 1 from public.football_player_discovery_profiles p
      where p.id=profile_id and p.business_id=football_player_match_performances.business_id
        and p.scouting_status='published'
        and public.football_player_discovery_has_consent(p.id,p.is_minor)
    )
  )
  or (
    public.can_manage_football_club_website_content_direct(business_id,'squad')
    and public.can_manage_football_club_website_content_direct(business_id,'fixtures')
  )
);
create policy football_player_match_performances_insert
on public.football_player_match_performances for insert to authenticated
with check (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and public.can_manage_football_club_website_content_direct(business_id,'fixtures')
  and exists (select 1 from public.football_club_website_fixtures f
    where f.id=fixture_id and f.business_id=football_player_match_performances.business_id)
  and exists (select 1 from public.football_club_website_squad s
    where s.id=squad_member_id and s.business_id=football_player_match_performances.business_id)
  and (profile_id is null or exists (
    select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_match_performances.business_id
      and p.squad_member_id=football_player_match_performances.squad_member_id
  ))
);
create policy football_player_match_performances_update
on public.football_player_match_performances for update to authenticated
using (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and public.can_manage_football_club_website_content_direct(business_id,'fixtures')
)
with check (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and public.can_manage_football_club_website_content_direct(business_id,'fixtures')
  and exists (select 1 from public.football_club_website_fixtures f
    where f.id=fixture_id and f.business_id=football_player_match_performances.business_id)
  and exists (select 1 from public.football_club_website_squad s
    where s.id=squad_member_id and s.business_id=football_player_match_performances.business_id)
  and (profile_id is null or exists (
    select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_match_performances.business_id
      and p.squad_member_id=football_player_match_performances.squad_member_id
  ))
);
create policy football_player_match_performances_delete
on public.football_player_match_performances for delete to authenticated
using (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  and public.can_manage_football_club_website_content_direct(business_id,'fixtures')
);

create or replace function public.stamp_football_player_match_performance()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
declare v_was_approved boolean := false;
begin
  if tg_op='INSERT' then new.created_by:=auth.uid();
  else v_was_approved:=coalesce(old.is_approved,false);
  end if;
  new.updated_by:=auth.uid();
  if new.is_approved then
    if not public.can_manage_football_club_website_content_direct(new.business_id,'squad')
       or not public.can_manage_football_club_website_content_direct(new.business_id,'fixtures') then
      raise exception 'Only authorised club management can approve match performance records.';
    end if;
    if not v_was_approved then new.approved_by:=auth.uid();new.approved_at:=now();end if;
  else
    new.approved_by:=null;new.approved_at:=null;
  end if;
  new.updated_at:=now();
  return new;
end;
$function$;
revoke all on function public.stamp_football_player_match_performance() from public,anon,authenticated;
create trigger stamp_football_player_match_performance
before insert or update on public.football_player_match_performances
for each row execute function public.stamp_football_player_match_performance();


create table if not exists public.football_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid references public.football_player_discovery_profiles(id) on delete set null,
  player_squad_member_id uuid references public.football_club_website_squad(id) on delete set null,
  source_business_id uuid not null references public.businesses(id) on delete cascade,
  destination_business_id uuid not null references public.businesses(id) on delete cascade,
  source_website_id uuid not null references public.football_club_websites(id) on delete restrict,
  destination_website_id uuid not null references public.football_club_websites(id) on delete restrict,
  player_name_snapshot text not null,
  source_club_name_snapshot text not null,
  destination_club_name_snapshot text not null,
  transfer_type text not null default 'Permanent' check (transfer_type in ('Permanent','Loan','Trial')),
  proposed_terms text check (proposed_terms is null or char_length(proposed_terms) <= 2000),
  status text not null default 'pending_destination'
    check (status in ('pending_destination','pending_source_release','approved','rejected','cancelled','completed')),
  initiated_by uuid not null references auth.users(id) on delete restrict,
  destination_approved_by uuid references auth.users(id) on delete set null,
  destination_approved_at timestamptz,
  destination_decision_note text,
  source_approved_by uuid references auth.users(id) on delete set null,
  source_approved_at timestamptz,
  source_decision_note text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completion_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_business_id <> destination_business_id),
  check (source_website_id <> destination_website_id)
);
create index if not exists football_transfer_requests_source_idx
  on public.football_transfer_requests(source_business_id,status,created_at desc);
create index if not exists football_transfer_requests_destination_idx
  on public.football_transfer_requests(destination_business_id,status,created_at desc);
create unique index if not exists football_transfer_requests_one_open_per_player
  on public.football_transfer_requests(player_profile_id)
  where player_profile_id is not null
    and status in ('pending_destination','pending_source_release','approved');

alter table public.football_transfer_requests enable row level security;
revoke all on public.football_transfer_requests from public,anon,authenticated;
grant select on public.football_transfer_requests to authenticated;
create policy football_transfer_requests_select
on public.football_transfer_requests for select to authenticated
using (
  public.can_manage_football_club_website_content_direct(source_business_id,'transfers')
  or public.can_manage_football_club_website_content_direct(destination_business_id,'transfers')
);

create or replace function public.request_football_transfer(
  p_profile_id uuid,p_destination_business_id uuid,
  p_transfer_type text default 'Permanent',p_proposed_terms text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_profile record;v_destination record;v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a transfer request.';end if;
  if p_transfer_type not in ('Permanent','Loan','Trial') then raise exception 'Choose a valid transfer type.';end if;
  if length(coalesce(p_proposed_terms,''))>2000 then raise exception 'Transfer terms must be 2,000 characters or fewer.';end if;
  select p.id,p.business_id,p.website_id,p.squad_member_id,p.public_name,p.is_minor,w.club_name
  into v_profile
  from public.football_player_discovery_profiles p
  join public.football_club_websites w on w.id=p.website_id and w.business_id=p.business_id
  join public.football_player_market_listings l on l.profile_id=p.id and l.business_id=p.business_id
  where p.id=p_profile_id and p.scouting_status='published' and p.is_minor=false
    and l.status='published' and (l.expires_at is null or l.expires_at>=current_date)
    and ((p_transfer_type='Loan' and l.listing_type in ('Loan','Permanent transfer'))
      or (p_transfer_type='Trial' and l.listing_type='Trial opportunity')
      or (p_transfer_type='Permanent' and l.listing_type in ('Permanent transfer','Free agent')))
    and w.verification_status='verified' and w.is_published=true and w.maintenance_mode=false
    and public.football_player_discovery_has_consent(p.id,p.is_minor);
  if not found then raise exception 'The player profile is unavailable or not listed for this opportunity.';end if;
  if not public.can_manage_football_club_website_content_direct(v_profile.business_id,'transfers') then
    raise exception 'You are not authorised to initiate transfers for this club.';
  end if;
  if p_destination_business_id=v_profile.business_id then raise exception 'Choose a different destination club.';end if;
  select id,business_id,club_name into v_destination from public.football_club_websites
  where business_id=p_destination_business_id and verification_status='verified'
    and is_published=true and maintenance_mode=false;
  if not found then raise exception 'The destination must be a verified, published club website.';end if;
  insert into public.football_transfer_requests(
    player_profile_id,player_squad_member_id,source_business_id,destination_business_id,
    source_website_id,destination_website_id,player_name_snapshot,
    source_club_name_snapshot,destination_club_name_snapshot,transfer_type,proposed_terms,initiated_by,status
  ) values (
    v_profile.id,v_profile.squad_member_id,v_profile.business_id,v_destination.business_id,
    v_profile.website_id,v_destination.id,v_profile.public_name,v_profile.club_name,
    v_destination.club_name,p_transfer_type,nullif(trim(coalesce(p_proposed_terms,'')),''),auth.uid(),'pending_destination'
  ) returning id into v_request_id;
  return v_request_id;
end;
$function$;
revoke all on function public.request_football_transfer(uuid,uuid,text,text) from public,anon;
grant execute on function public.request_football_transfer(uuid,uuid,text,text) to authenticated;

create or replace function public.respond_football_transfer_request(
  p_request_id uuid,p_decision text,p_note text default null
)
returns text language plpgsql security definer set search_path = ''
as $function$
declare v_request public.football_transfer_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in before reviewing a transfer request.';end if;
  if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject.';end if;
  if length(coalesce(p_note,''))>1200 then raise exception 'Decision note must be 1,200 characters or fewer.';end if;
  select * into v_request from public.football_transfer_requests where id=p_request_id for update;
  if not found then raise exception 'Transfer request not found.';end if;
  if v_request.status='pending_destination' then
    if not public.can_manage_football_club_website_content_direct(v_request.destination_business_id,'transfers') then
      raise exception 'Only authorised management at the destination club can review this step.';
    end if;
    if p_decision='approve' then
      update public.football_transfer_requests set destination_approved_by=auth.uid(),destination_approved_at=now(),
        destination_decision_note=nullif(trim(coalesce(p_note,'')),''),status='pending_source_release',updated_at=now()
      where id=p_request_id;
    else
      update public.football_transfer_requests set destination_decision_note=nullif(trim(coalesce(p_note,'')),''),
        status='rejected',updated_at=now() where id=p_request_id;
    end if;
  elsif v_request.status='pending_source_release' then
    if not public.can_manage_football_club_website_content_direct(v_request.source_business_id,'transfers') then
      raise exception 'Only authorised management at the source club can approve player release.';
    end if;
    if p_decision='approve' then
      update public.football_transfer_requests set source_approved_by=auth.uid(),source_approved_at=now(),
        source_decision_note=nullif(trim(coalesce(p_note,'')),''),status='approved',updated_at=now()
      where id=p_request_id;
    else
      update public.football_transfer_requests set source_decision_note=nullif(trim(coalesce(p_note,'')),''),
        status='rejected',updated_at=now() where id=p_request_id;
    end if;
  else
    raise exception 'This transfer request is not awaiting your approval.';
  end if;
  select status into v_request.status from public.football_transfer_requests where id=p_request_id;
  return v_request.status;
end;
$function$;
revoke all on function public.respond_football_transfer_request(uuid,text,text) from public,anon;
grant execute on function public.respond_football_transfer_request(uuid,text,text) to authenticated;

create or replace function public.complete_football_transfer_request(
  p_request_id uuid,p_completion_note text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_request public.football_transfer_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in before completing a transfer.';end if;
  if length(coalesce(p_completion_note,''))>1200 then raise exception 'Completion note must be 1,200 characters or fewer.';end if;
  select * into v_request from public.football_transfer_requests where id=p_request_id for update;
  if not found then raise exception 'Transfer request not found.';end if;
  if v_request.status<>'approved' then raise exception 'Both clubs must approve before completion.';end if;
  if not public.can_manage_football_club_website_content_direct(v_request.source_business_id,'transfers') then
    raise exception 'Only authorised management at the source club can confirm completion.';
  end if;
  update public.football_transfer_requests set status='completed',completed_by=auth.uid(),completed_at=now(),
    completion_note=nullif(trim(coalesce(p_completion_note,'')),''),updated_at=now()
  where id=p_request_id;
  update public.football_player_market_listings set status='completed',updated_at=now(),updated_by=auth.uid()
  where profile_id=v_request.player_profile_id and business_id=v_request.source_business_id
    and status in ('published','paused');
  return true;
end;
$function$;
revoke all on function public.complete_football_transfer_request(uuid,text) from public,anon;
grant execute on function public.complete_football_transfer_request(uuid,text) to authenticated;

create or replace function public.cancel_football_transfer_request(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_request public.football_transfer_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in before cancelling a transfer.';end if;
  select * into v_request from public.football_transfer_requests where id=p_request_id for update;
  if not found then raise exception 'Transfer request not found.';end if;
  if v_request.status not in ('pending_destination','pending_source_release') then
    raise exception 'Only an open transfer request can be cancelled.';
  end if;
  if not (
    public.can_manage_football_club_website_content_direct(v_request.source_business_id,'transfers')
    or public.can_manage_football_club_website_content_direct(v_request.destination_business_id,'transfers')
  ) then raise exception 'You are not authorised to cancel this transfer request.';end if;
  update public.football_transfer_requests set status='cancelled',updated_at=now() where id=p_request_id;
  return true;
end;
$function$;
revoke all on function public.cancel_football_transfer_request(uuid) from public,anon;
grant execute on function public.cancel_football_transfer_request(uuid) to authenticated;


create table if not exists public.football_scout_assessments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.football_player_discovery_profiles(id) on delete cascade,
  scout_user_id uuid not null references auth.users(id) on delete cascade,
  overall_rating integer not null check (overall_rating between 1 and 10),
  technical_rating integer check (technical_rating is null or technical_rating between 1 and 10),
  tactical_rating integer check (tactical_rating is null or tactical_rating between 1 and 10),
  physical_rating integer check (physical_rating is null or physical_rating between 1 and 10),
  mental_rating integer check (mental_rating is null or mental_rating between 1 and 10),
  potential_rating integer check (potential_rating is null or potential_rating between 1 and 10),
  recommendation text not null default 'Further assessment'
    check (recommendation in ('Monitor','Further assessment','Invite for trial','Signing consideration','Not recommended')),
  strengths text check (strengths is null or char_length(strengths) <= 1500),
  development_areas text check (development_areas is null or char_length(development_areas) <= 1500),
  report_summary text check (report_summary is null or char_length(report_summary) <= 2000),
  is_shared_with_club boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id,scout_user_id)
);
create index if not exists football_scout_assessments_club_idx
  on public.football_scout_assessments(business_id,is_shared_with_club,created_at desc);
create index if not exists football_scout_assessments_scout_idx
  on public.football_scout_assessments(scout_user_id,created_at desc);

alter table public.football_scout_assessments enable row level security;
revoke all on public.football_scout_assessments from public,anon,authenticated;
grant select,insert,update,delete on public.football_scout_assessments to authenticated;
create policy football_scout_assessments_select
on public.football_scout_assessments for select to authenticated
using (scout_user_id=auth.uid() or (is_shared_with_club and
  public.can_manage_football_club_website_content(business_id,'squad')));
create policy football_scout_assessments_insert
on public.football_scout_assessments for insert to authenticated
with check (
  scout_user_id=auth.uid()
  and exists (select 1 from public.football_scout_accounts a
    where a.user_id=auth.uid() and a.verification_status='verified')
  and exists (select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_scout_assessments.business_id
      and p.scouting_status='published'
      and public.football_player_discovery_has_consent(p.id,p.is_minor))
);
create policy football_scout_assessments_update
on public.football_scout_assessments for update to authenticated
using (scout_user_id=auth.uid())
with check (
  scout_user_id=auth.uid()
  and exists (select 1 from public.football_scout_accounts a
    where a.user_id=auth.uid() and a.verification_status='verified')
  and exists (select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_scout_assessments.business_id
      and p.scouting_status='published'
      and public.football_player_discovery_has_consent(p.id,p.is_minor))
);
create policy football_scout_assessments_delete
on public.football_scout_assessments for delete to authenticated
using (scout_user_id=auth.uid());

create or replace function public.stamp_football_scout_assessment()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin new.updated_at:=now();return new;end;
$function$;
revoke all on function public.stamp_football_scout_assessment() from public,anon,authenticated;
create trigger stamp_football_scout_assessment
before insert or update on public.football_scout_assessments
for each row execute function public.stamp_football_scout_assessment();

comment on table public.football_player_career_history is
  'Club-entered player career timeline. Public entries require a published player profile and current consent.';
comment on table public.football_player_match_performances is
  'Club match statistics. Only manager-approved consent-linked statistics are public; coach notes remain private.';
comment on table public.football_transfer_requests is
  'Private two-club transfer approval workflow. It does not execute a legal contract or association registration.';
comment on table public.football_scout_assessments is
  'Private scout evaluations; club visibility is opt-in and controlled by the scout.';
commit;
