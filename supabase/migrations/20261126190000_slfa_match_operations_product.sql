-- SLFA Match Operations product foundation for Koroma Leone Tech SME Business OS.
-- Reuses association tenant, competition, season, club, player and fixture master data.
begin;

create table if not exists public.slfa_match_ops_licenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  status text not null default 'pending_activation'
    check (status in ('pending_activation','active','suspended','expired')),
  package_name text not null default 'Association Operations',
  starts_on date,
  valid_until date,
  seat_limit integer not null default 250 check (seat_limit between 1 and 50000),
  agreement_reference text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or starts_on is null or valid_until >= starts_on)
);

create table if not exists public.slfa_match_official_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  competition_id uuid not null,
  fixture_id uuid,
  club_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('referee','assistant_referee','match_commissioner','team_official')),
  is_active boolean not null default true,
  assigned_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competition_id,business_id)
    references public.league_competitions(id,business_id) on delete cascade,
  foreign key (fixture_id,business_id,competition_id)
    references public.league_fixtures(id,business_id,competition_id) on delete cascade,
  foreign key (club_id,business_id,competition_id)
    references public.league_clubs(id,business_id,competition_id) on delete cascade,
  foreign key (business_id,user_id)
    references public.business_members(business_id,user_id) on delete cascade,
  check (
    (role='team_official' and club_id is not null and fixture_id is null)
    or
    (role<>'team_official' and fixture_id is not null and club_id is null)
  )
);

create unique index if not exists slfa_match_team_official_unique
  on public.slfa_match_official_assignments(business_id,competition_id,club_id,user_id)
  where role='team_official' and is_active=true;
create unique index if not exists slfa_match_single_official_role_unique
  on public.slfa_match_official_assignments(fixture_id,role)
  where role in ('referee','match_commissioner') and is_active=true;
create unique index if not exists slfa_match_official_assignment_unique
  on public.slfa_match_official_assignments(fixture_id,user_id,role)
  where fixture_id is not null and is_active=true;
create index if not exists slfa_match_assignments_user_idx
  on public.slfa_match_official_assignments(business_id,user_id,is_active);
create index if not exists slfa_match_assignments_fixture_idx
  on public.slfa_match_official_assignments(business_id,competition_id,fixture_id,is_active);

create table if not exists public.slfa_match_team_sheets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  competition_id uuid not null,
  fixture_id uuid not null,
  club_id uuid not null,
  submitted_by uuid not null references auth.users(id),
  starting_player_ids uuid[] not null,
  substitute_player_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','returned')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,club_id),
  foreign key (fixture_id,business_id,competition_id)
    references public.league_fixtures(id,business_id,competition_id) on delete cascade,
  foreign key (club_id,business_id,competition_id)
    references public.league_clubs(id,business_id,competition_id) on delete cascade
);
create index if not exists slfa_match_team_sheets_queue_idx
  on public.slfa_match_team_sheets(business_id,competition_id,status,submitted_at);
create index if not exists slfa_match_team_sheets_club_idx
  on public.slfa_match_team_sheets(business_id,club_id,submitted_at);

create table if not exists public.slfa_match_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  competition_id uuid not null,
  fixture_id uuid not null,
  report_type text not null check (report_type in ('referee','match_commissioner')),
  submitted_by uuid not null references auth.users(id),
  report_data jsonb not null default '{}'::jsonb,
  evidence_paths text[] not null default '{}',
  ocr_text text not null default '',
  ocr_status text not null default 'not_run'
    check (ocr_status in ('not_run','complete','needs_review','failed')),
  ocr_confidence numeric(5,2) check (ocr_confidence is null or ocr_confidence between 0 and 100),
  ocr_processed_at timestamptz,
  verified_text text not null default '',
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  status text not null default 'pending' check (status in ('pending','reviewed','returned')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (fixture_id,business_id,competition_id)
    references public.league_fixtures(id,business_id,competition_id) on delete cascade
);
create index if not exists slfa_match_reports_queue_idx
  on public.slfa_match_reports(business_id,competition_id,status,submitted_at);
create index if not exists slfa_match_reports_fixture_idx
  on public.slfa_match_reports(business_id,fixture_id,report_type,submitted_at);
create index if not exists slfa_match_reports_submitter_idx
  on public.slfa_match_reports(submitted_by,submitted_at);

create or replace function public.slfa_match_ops_is_admin(p_business_id uuid,p_competition_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and (
    public.has_business_role(p_business_id,array['owner','admin','manager']::public.business_role[])
    or public.league_user_has_role(p_business_id,p_competition_id,array['competition_admin'])
  );
$$;

create or replace function public.slfa_match_ops_license_is_active(p_business_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.slfa_match_ops_licenses l
    where l.business_id=p_business_id
      and l.status='active'
      and (l.starts_on is null or l.starts_on<=current_date)
      and (l.valid_until is null or l.valid_until>=current_date)
  );
$$;

create or replace function public.slfa_match_ops_user_assigned(p_business_id uuid,p_competition_id uuid,p_fixture_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1 from public.slfa_match_official_assignments a
    where a.business_id=p_business_id and a.competition_id=p_competition_id
      and a.fixture_id=p_fixture_id and a.user_id=auth.uid() and a.is_active=true
      and a.role in ('referee','assistant_referee','match_commissioner')
  );
$$;

create or replace function public.slfa_match_ops_is_team_official(p_business_id uuid,p_competition_id uuid,p_club_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1 from public.slfa_match_official_assignments a
    where a.business_id=p_business_id and a.competition_id=p_competition_id
      and a.club_id=p_club_id and a.user_id=auth.uid()
      and a.role='team_official' and a.is_active=true
  );
$$;

revoke all on function public.slfa_match_ops_is_admin(uuid,uuid) from public,anon;
revoke all on function public.slfa_match_ops_license_is_active(uuid) from public,anon;
revoke all on function public.slfa_match_ops_user_assigned(uuid,uuid,uuid) from public,anon;
revoke all on function public.slfa_match_ops_is_team_official(uuid,uuid,uuid) from public,anon;
grant execute on function public.slfa_match_ops_is_admin(uuid,uuid) to authenticated;
grant execute on function public.slfa_match_ops_license_is_active(uuid) to authenticated;
grant execute on function public.slfa_match_ops_user_assigned(uuid,uuid,uuid) to authenticated;
grant execute on function public.slfa_match_ops_is_team_official(uuid,uuid,uuid) to authenticated;

alter table public.slfa_match_ops_licenses enable row level security;
alter table public.slfa_match_official_assignments enable row level security;
alter table public.slfa_match_team_sheets enable row level security;
alter table public.slfa_match_reports enable row level security;

drop policy if exists slfa_match_license_member_read on public.slfa_match_ops_licenses;
create policy slfa_match_license_member_read on public.slfa_match_ops_licenses
for select to authenticated
using (public.is_business_member(business_id) or public.is_platform_developer());

drop policy if exists slfa_match_assignment_scope_read on public.slfa_match_official_assignments;
create policy slfa_match_assignment_scope_read on public.slfa_match_official_assignments
for select to authenticated
using (
  public.slfa_match_ops_is_admin(business_id,competition_id)
  or user_id=auth.uid()
);

drop policy if exists slfa_match_team_sheet_scope_read on public.slfa_match_team_sheets;
create policy slfa_match_team_sheet_scope_read on public.slfa_match_team_sheets
for select to authenticated
using (
  public.slfa_match_ops_is_admin(business_id,competition_id)
  or submitted_by=auth.uid()
  or public.slfa_match_ops_is_team_official(business_id,competition_id,club_id)
  or public.slfa_match_ops_user_assigned(business_id,competition_id,fixture_id)
);

drop policy if exists slfa_match_report_scope_read on public.slfa_match_reports;
create policy slfa_match_report_scope_read on public.slfa_match_reports
for select to authenticated
using (
  public.slfa_match_ops_is_admin(business_id,competition_id)
  or submitted_by=auth.uid()
  or public.slfa_match_ops_user_assigned(business_id,competition_id,fixture_id)
);

revoke all on public.slfa_match_ops_licenses from anon,authenticated;
revoke all on public.slfa_match_official_assignments from anon,authenticated;
revoke all on public.slfa_match_team_sheets from anon,authenticated;
revoke all on public.slfa_match_reports from anon,authenticated;
grant select on public.slfa_match_ops_licenses,public.slfa_match_official_assignments,
  public.slfa_match_team_sheets,public.slfa_match_reports to authenticated;

create or replace function public.slfa_match_ops_assign_official(
  p_business_id uuid,p_competition_id uuid,p_user_id uuid,p_role text,
  p_fixture_id uuid default null,p_club_id uuid default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.slfa_match_ops_is_admin(p_business_id,p_competition_id) then
    raise exception 'Super Admin or workspace administrator access required';
  end if;
  if not public.slfa_match_ops_license_is_active(p_business_id) then
    raise exception 'An active SLFA Match Operations licence is required';
  end if;
  if p_role not in ('referee','assistant_referee','match_commissioner','team_official') then
    raise exception 'Select a valid match operations role';
  end if;
  if not exists(select 1 from public.business_members m
    where m.business_id=p_business_id and m.user_id=p_user_id and m.is_active=true) then
    raise exception 'The selected user must first be an active member of this association workspace';
  end if;
  if p_role='team_official' then
    if p_fixture_id is not null or p_club_id is null then
      raise exception 'A Team Official must be assigned to one club, not a single fixture';
    end if;
    if not exists(select 1 from public.league_clubs c
      where c.id=p_club_id and c.business_id=p_business_id and c.competition_id=p_competition_id and c.status='active') then
      raise exception 'Select an active club in this competition';
    end if;
  else
    if p_fixture_id is null or p_club_id is not null then
      raise exception 'Match officials must be assigned to a fixture';
    end if;
    if not exists(select 1 from public.league_fixtures f
      where f.id=p_fixture_id and f.business_id=p_business_id and f.competition_id=p_competition_id
        and f.status not in ('cancelled')) then
      raise exception 'Select a valid fixture in this competition';
    end if;
  end if;

  if p_role in ('referee','match_commissioner') then
    update public.slfa_match_official_assignments
      set is_active=false,updated_at=now()
    where business_id=p_business_id and competition_id=p_competition_id
      and fixture_id=p_fixture_id and role=p_role and is_active=true and user_id<>p_user_id;
  end if;

  insert into public.slfa_match_official_assignments(
    business_id,competition_id,fixture_id,club_id,user_id,role,is_active,assigned_by,updated_at
  ) values(
    p_business_id,p_competition_id,p_fixture_id,p_club_id,p_user_id,p_role,true,auth.uid(),now()
  )
  on conflict do nothing returning id into v_id;

  if v_id is null then
    select a.id into v_id from public.slfa_match_official_assignments a
    where a.business_id=p_business_id and a.competition_id=p_competition_id
      and a.user_id=p_user_id and a.role=p_role and a.is_active=true
      and (a.fixture_id is not distinct from p_fixture_id)
      and (a.club_id is not distinct from p_club_id)
    limit 1;
  end if;

  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(p_business_id,auth.uid(),'slfa_match_official_assigned','slfa_match_official_assignments',v_id::text,
    jsonb_build_object('competition_id',p_competition_id,'fixture_id',p_fixture_id,'club_id',p_club_id,'user_id',p_user_id,'role',p_role));
  return v_id;
end;
$$;

create or replace function public.slfa_match_ops_submit_team_sheet(
  p_business_id uuid,p_competition_id uuid,p_fixture_id uuid,p_club_id uuid,
  p_starting_player_ids uuid[],p_substitute_player_ids uuid[] default '{}'
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_kickoff timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.slfa_match_ops_license_is_active(p_business_id) then raise exception 'An active SLFA Match Operations licence is required'; end if;
  if not public.slfa_match_ops_is_team_official(p_business_id,p_competition_id,p_club_id) then
    raise exception 'Only the assigned Team Official can submit this club team sheet';
  end if;
  if coalesce(array_length(p_starting_player_ids,1),0)<>11 then raise exception 'Select exactly 11 starting players'; end if;
  if coalesce(array_length(p_substitute_player_ids,1),0)>9 then raise exception 'Select no more than 9 substitutes'; end if;
  if (select count(distinct x) from unnest(p_starting_player_ids||coalesce(p_substitute_player_ids,'{}')) x)
    <> coalesce(array_length(p_starting_player_ids,1),0)+coalesce(array_length(p_substitute_player_ids,1),0) then
    raise exception 'A player cannot appear twice on the team sheet';
  end if;
  select f.kickoff_at into v_kickoff from public.league_fixtures f
  where f.id=p_fixture_id and f.business_id=p_business_id and f.competition_id=p_competition_id
    and p_club_id in (f.home_club_id,f.away_club_id) and f.status='scheduled';
  if not found then raise exception 'The selected club is not in this scheduled fixture'; end if;
  if v_kickoff is null or v_kickoff<=now()+interval '20 minutes' then
    raise exception 'Team sheets close 20 minutes before kick-off';
  end if;
  if exists(
    select 1 from unnest(p_starting_player_ids||coalesce(p_substitute_player_ids,'{}')) x
    left join public.league_players p on p.id=x and p.business_id=p_business_id
      and p.competition_id=p_competition_id and p.club_id=p_club_id and p.status='active'
    where p.id is null
  ) then raise exception 'Every selected player must be active and registered to this club and competition'; end if;

  insert into public.slfa_match_team_sheets(
    business_id,competition_id,fixture_id,club_id,submitted_by,starting_player_ids,substitute_player_ids,status,
    review_note,reviewed_by,reviewed_at,submitted_at,updated_at
  ) values(p_business_id,p_competition_id,p_fixture_id,p_club_id,auth.uid(),p_starting_player_ids,
    coalesce(p_substitute_player_ids,'{}'),'pending','',null,null,now(),now())
  on conflict(fixture_id,club_id) do update set
    submitted_by=auth.uid(),starting_player_ids=excluded.starting_player_ids,
    substitute_player_ids=excluded.substitute_player_ids,status='pending',review_note='',
    reviewed_by=null,reviewed_at=null,submitted_at=now(),updated_at=now()
  where public.slfa_match_team_sheets.status='returned'
  returning id into v_id;
  if v_id is null then raise exception 'A team sheet is already pending review or has been approved'; end if;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(p_business_id,auth.uid(),'slfa_team_sheet_submitted','slfa_match_team_sheets',v_id::text,
    jsonb_build_object('competition_id',p_competition_id,'fixture_id',p_fixture_id,'club_id',p_club_id));
  return v_id;
end;
$$;

create or replace function public.slfa_match_ops_review_team_sheet(
  p_sheet_id uuid,p_decision text,p_review_note text default ''
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_sheet public.slfa_match_team_sheets%rowtype; v_decision text:=lower(trim(coalesce(p_decision,'')));
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_sheet from public.slfa_match_team_sheets where id=p_sheet_id for update;
  if not found then raise exception 'Team sheet not found'; end if;
  if not public.slfa_match_ops_is_admin(v_sheet.business_id,v_sheet.competition_id) then raise exception 'Super Admin access required'; end if;
  if not public.slfa_match_ops_license_is_active(v_sheet.business_id) then raise exception 'An active SLFA Match Operations licence is required'; end if;
  if v_sheet.status='approved' then raise exception 'Approved team sheets are locked'; end if;
  if v_decision not in ('approved','returned') then raise exception 'Choose approve or return'; end if;
  if v_decision='returned' and length(trim(coalesce(p_review_note,'')))<5 then raise exception 'Add a correction note of at least 5 characters'; end if;
  update public.slfa_match_team_sheets set status=v_decision,review_note=left(trim(coalesce(p_review_note,'')),2000),
    reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_sheet_id;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(v_sheet.business_id,auth.uid(),'slfa_team_sheet_'||v_decision,'slfa_match_team_sheets',p_sheet_id::text,
    jsonb_build_object('competition_id',v_sheet.competition_id,'fixture_id',v_sheet.fixture_id,'club_id',v_sheet.club_id,'review_note',left(coalesce(p_review_note,''),500)));
  return jsonb_build_object('success',true,'status',v_decision,'sheet_id',p_sheet_id);
end;
$$;

create or replace function public.slfa_match_ops_submit_report(
  p_business_id uuid,p_competition_id uuid,p_fixture_id uuid,p_report_type text,
  p_report_data jsonb,p_evidence_paths text[] default '{}',p_ocr_text text default '',
  p_ocr_status text default 'not_run',p_ocr_confidence numeric default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_role text:=lower(trim(coalesce(p_report_type,''))); v_ocr_state text:=lower(trim(coalesce(p_ocr_status,'not_run')));
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.slfa_match_ops_license_is_active(p_business_id) then raise exception 'An active SLFA Match Operations licence is required'; end if;
  if v_role not in ('referee','match_commissioner') then raise exception 'Choose a valid match report type'; end if;
  if jsonb_typeof(coalesce(p_report_data,'{}'::jsonb))<>'object' then raise exception 'Match report data must be a JSON object'; end if;
  if v_ocr_state not in ('not_run','complete','needs_review','failed') then raise exception 'Invalid OCR status'; end if;
  if v_role='referee' and not exists(select 1 from public.slfa_match_official_assignments a
    where a.business_id=p_business_id and a.competition_id=p_competition_id and a.fixture_id=p_fixture_id
      and a.user_id=auth.uid() and a.role='referee' and a.is_active) then
    raise exception 'Only the assigned match referee can submit the referee report';
  end if;
  if v_role='match_commissioner' and not exists(select 1 from public.slfa_match_official_assignments a
    where a.business_id=p_business_id and a.competition_id=p_competition_id and a.fixture_id=p_fixture_id
      and a.user_id=auth.uid() and a.role='match_commissioner' and a.is_active) then
    raise exception 'Only the assigned Match Commissioner can submit the commissioner report';
  end if;
  if not exists(select 1 from public.league_fixtures f
    where f.id=p_fixture_id and f.business_id=p_business_id and f.competition_id=p_competition_id) then
    raise exception 'Fixture not found in this competition';
  end if;
  if coalesce(length(trim(p_report_data::text)),0)<3 and coalesce(array_length(p_evidence_paths,1),0)=0 then
    raise exception 'Enter match report details or attach photographic evidence';
  end if;
  insert into public.slfa_match_reports(
    business_id,competition_id,fixture_id,report_type,submitted_by,report_data,evidence_paths,
    ocr_text,ocr_status,ocr_confidence,ocr_processed_at,status,submitted_at,updated_at
  ) values (
    p_business_id,p_competition_id,p_fixture_id,v_role,auth.uid(),coalesce(p_report_data,'{}'::jsonb),
    coalesce(p_evidence_paths,'{}'),left(coalesce(p_ocr_text,''),30000),v_ocr_state,
    case when p_ocr_confidence is null then null else greatest(0,least(100,p_ocr_confidence)) end,
    case when v_ocr_state='not_run' then null else now() end,'pending',now(),now()
  ) returning id into v_id;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(p_business_id,auth.uid(),'slfa_match_report_submitted','slfa_match_reports',v_id::text,
    jsonb_build_object('competition_id',p_competition_id,'fixture_id',p_fixture_id,'report_type',v_role,'ocr_status',v_ocr_state));
  return v_id;
end;
$$;

create or replace function public.slfa_match_ops_review_report(
  p_report_id uuid,p_decision text,p_verified_text text default '',p_review_note text default ''
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_report public.slfa_match_reports%rowtype; v_decision text:=lower(trim(coalesce(p_decision,'')));
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_report from public.slfa_match_reports where id=p_report_id for update;
  if not found then raise exception 'Match report not found'; end if;
  if not public.slfa_match_ops_is_admin(v_report.business_id,v_report.competition_id) then raise exception 'Super Admin access required'; end if;
  if not public.slfa_match_ops_license_is_active(v_report.business_id) then raise exception 'An active SLFA Match Operations licence is required'; end if;
  if v_decision not in ('reviewed','returned') then raise exception 'Choose a valid review decision'; end if;
  if v_decision='returned' and length(trim(coalesce(p_review_note,'')))<5 then raise exception 'Add a correction note of at least 5 characters'; end if;
  update public.slfa_match_reports set status=v_decision,review_note=left(trim(coalesce(p_review_note,'')),2000),
    verified_text=left(trim(coalesce(p_verified_text,'')),30000),
    verified_by=case when length(trim(coalesce(p_verified_text,'')))>0 then auth.uid() else verified_by end,
    verified_at=case when length(trim(coalesce(p_verified_text,'')))>0 then now() else verified_at end,
    reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_report_id;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(v_report.business_id,auth.uid(),'slfa_match_report_'||v_decision,'slfa_match_reports',p_report_id::text,
    jsonb_build_object('competition_id',v_report.competition_id,'fixture_id',v_report.fixture_id,'report_type',v_report.report_type,'review_note',left(coalesce(p_review_note,''),500)));
  return jsonb_build_object('success',true,'status',v_decision,'report_id',p_report_id);
end;
$$;

create or replace function public.slfa_match_ops_set_license(
  p_business_id uuid,p_status text,p_starts_on date default null,p_valid_until date default null,
  p_package_name text default 'Association Operations',p_seat_limit integer default 250,
  p_agreement_reference text default '',p_notes text default ''
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if not public.is_platform_developer() then raise exception 'Koroma Leone Tech Developer access required'; end if;
  if not exists(select 1 from public.businesses b where b.id=p_business_id) then raise exception 'Association workspace not found'; end if;
  if v_status not in ('pending_activation','active','suspended','expired') then raise exception 'Invalid licence status'; end if;
  if p_seat_limit is null or p_seat_limit<1 or p_seat_limit>50000 then raise exception 'Seat limit must be between 1 and 50000'; end if;
  if p_starts_on is not null and p_valid_until is not null and p_valid_until<p_starts_on then raise exception 'Licence expiry cannot be before its start date'; end if;
  insert into public.slfa_match_ops_licenses(
    business_id,status,package_name,starts_on,valid_until,seat_limit,agreement_reference,notes,created_by,updated_by,updated_at
  ) values (
    p_business_id,v_status,left(trim(coalesce(p_package_name,'Association Operations')),100),
    p_starts_on,p_valid_until,p_seat_limit,left(trim(coalesce(p_agreement_reference,'')),180),
    left(trim(coalesce(p_notes,'')),3000),auth.uid(),auth.uid(),now()
  )
  on conflict(business_id) do update set
    status=excluded.status,package_name=excluded.package_name,starts_on=excluded.starts_on,
    valid_until=excluded.valid_until,seat_limit=excluded.seat_limit,
    agreement_reference=excluded.agreement_reference,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
  insert into public.business_industry_modules(business_id,module_key,is_enabled,configuration,updated_by,updated_at)
  values(p_business_id,'slfa_match_ops',true,jsonb_build_object('label','SLFA Match Operations','licensing','managed_by_koroma_leone_tech'),auth.uid(),now())
  on conflict(business_id,module_key) do update set is_enabled=true,configuration=excluded.configuration,updated_by=auth.uid(),updated_at=now();
  return jsonb_build_object('success',true,'business_id',p_business_id,'status',v_status);
end;
$$;

create or replace function public.slfa_match_ops_get_license_overview()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_rows jsonb;
begin
  if not public.is_platform_developer() then raise exception 'Koroma Leone Tech Developer access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'license_id',l.id,'business_id',b.id,'business_name',b.name,'industry',b.industry,
    'status',l.status,'package_name',l.package_name,'starts_on',l.starts_on,
    'valid_until',l.valid_until,'seat_limit',l.seat_limit,
    'agreement_reference',l.agreement_reference,'notes',l.notes,'updated_at',l.updated_at
  ) order by b.name),'[]'::jsonb)
  into v_rows
  from public.slfa_match_ops_licenses l
  join public.businesses b on b.id=l.business_id;
  return v_rows;
end;
$$;

revoke all on function public.slfa_match_ops_assign_official(uuid,uuid,uuid,text,uuid,uuid) from public,anon;
revoke all on function public.slfa_match_ops_submit_team_sheet(uuid,uuid,uuid,uuid,uuid[],uuid[]) from public,anon;
revoke all on function public.slfa_match_ops_review_team_sheet(uuid,text,text) from public,anon;
revoke all on function public.slfa_match_ops_submit_report(uuid,uuid,uuid,text,jsonb,text[],text,text,numeric) from public,anon;
revoke all on function public.slfa_match_ops_review_report(uuid,text,text,text) from public,anon;
revoke all on function public.slfa_match_ops_set_license(uuid,text,date,date,text,integer,text,text) from public,anon;
revoke all on function public.slfa_match_ops_get_license_overview() from public,anon;
grant execute on function public.slfa_match_ops_assign_official(uuid,uuid,uuid,text,uuid,uuid) to authenticated;
grant execute on function public.slfa_match_ops_submit_team_sheet(uuid,uuid,uuid,uuid,uuid[],uuid[]) to authenticated;
grant execute on function public.slfa_match_ops_review_team_sheet(uuid,text,text) to authenticated;
grant execute on function public.slfa_match_ops_submit_report(uuid,uuid,uuid,text,jsonb,text[],text,text,numeric) to authenticated;
grant execute on function public.slfa_match_ops_review_report(uuid,text,text,text) to authenticated;
grant execute on function public.slfa_match_ops_set_license(uuid,text,date,date,text,integer,text,text) to authenticated;
grant execute on function public.slfa_match_ops_get_license_overview() to authenticated;

create or replace function public.slfa_match_ops_provision_association()
returns trigger language plpgsql security definer set search_path='public'
as $$
begin
  if lower(coalesce(new.industry,'')) like '%football association%'
     or lower(coalesce(new.industry,'')) like '%football federation%'
     or lower(coalesce(new.industry,''))='sports association / federation' then
    insert into public.business_industry_modules(business_id,module_key,is_enabled,configuration)
    values(new.id,'sports_league',true,'{"label":"Competition Setup","version":1}'::jsonb)
    on conflict(business_id,module_key) do update set is_enabled=true,configuration=excluded.configuration,updated_at=now();
    insert into public.business_industry_modules(business_id,module_key,is_enabled,configuration)
    values(new.id,'slfa_match_ops',true,'{"label":"SLFA Match Operations","version":1,"licensing":"managed_by_koroma_leone_tech"}'::jsonb)
    on conflict(business_id,module_key) do update set is_enabled=true,configuration=excluded.configuration,updated_at=now();
    insert into public.slfa_match_ops_licenses(business_id,status,package_name,seat_limit)
    values(new.id,'pending_activation','Association Operations',250)
    on conflict(business_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists slfa_match_ops_provision_association on public.businesses;
create trigger slfa_match_ops_provision_association after insert on public.businesses
for each row execute function public.slfa_match_ops_provision_association();

-- The module is intentionally available only to football-association/federation workspaces.
-- Product activation is controlled by the Koroma Leone Tech Developer through its licence RPC.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('slfa-match-evidence','slfa-match-evidence',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists slfa_match_evidence_read on storage.objects;
create policy slfa_match_evidence_read on storage.objects
for select to authenticated
using (
  bucket_id='slfa-match-evidence'
  and array_length(storage.foldername(name),1)>=4
  and (
    public.slfa_match_ops_is_admin((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
    or public.slfa_match_ops_user_assigned((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid,(storage.foldername(name))[3]::uuid)
    or exists(select 1 from public.slfa_match_reports r
      where r.business_id=(storage.foldername(name))[1]::uuid
        and r.competition_id=(storage.foldername(name))[2]::uuid
        and r.fixture_id=(storage.foldername(name))[3]::uuid
        and r.submitted_by=auth.uid() and (r.evidence_paths @> array[name]))
  )
);

drop policy if exists slfa_match_evidence_upload on storage.objects;
create policy slfa_match_evidence_upload on storage.objects
for insert to authenticated
with check (
  bucket_id='slfa-match-evidence'
  and array_length(storage.foldername(name),1)>=4
  and (storage.foldername(name))[4]=auth.uid()::text
  and (
    public.slfa_match_ops_is_admin((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
    or public.slfa_match_ops_user_assigned((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid,(storage.foldername(name))[3]::uuid)
  )
);

drop policy if exists slfa_match_evidence_delete on storage.objects;
create policy slfa_match_evidence_delete on storage.objects
for delete to authenticated
using (
  bucket_id='slfa-match-evidence'
  and (storage.foldername(name))[4]=auth.uid()::text
);

commit;