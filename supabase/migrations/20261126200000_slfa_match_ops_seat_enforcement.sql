begin;
create unique index if not exists slfa_match_team_official_single_assignment_idx
  on public.slfa_match_official_assignments(business_id,competition_id,club_id)
  where role='team_official' and is_active=true;

create or replace function public.slfa_match_ops_assign_official(
  p_business_id uuid,p_competition_id uuid,p_user_id uuid,p_role text,
  p_fixture_id uuid default null,p_club_id uuid default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid;
  v_seat_limit integer;
  v_current_seats integer;
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

  select l.seat_limit into v_seat_limit
  from public.slfa_match_ops_licenses l
  where l.business_id=p_business_id and l.status='active'
    and (l.starts_on is null or l.starts_on<=current_date)
    and (l.valid_until is null or l.valid_until>=current_date);
  if not found then raise exception 'An active SLFA Match Operations licence is required'; end if;

  if p_role='team_official' then
    update public.slfa_match_official_assignments set is_active=false,updated_at=now()
    where business_id=p_business_id and competition_id=p_competition_id
      and club_id=p_club_id and role='team_official' and is_active=true and user_id<>p_user_id;
  elsif p_role in ('referee','match_commissioner') then
    update public.slfa_match_official_assignments set is_active=false,updated_at=now()
    where business_id=p_business_id and competition_id=p_competition_id
      and fixture_id=p_fixture_id and role=p_role and is_active=true and user_id<>p_user_id;
  end if;

  select count(distinct a.user_id)::integer into v_current_seats
  from public.slfa_match_official_assignments a
  where a.business_id=p_business_id and a.is_active=true
    and not (
      (p_role='team_official' and a.role='team_official' and a.club_id=p_club_id)
      or
      (p_role in ('referee','match_commissioner') and a.role=p_role and a.fixture_id=p_fixture_id)
    );

  if not exists(select 1 from public.slfa_match_official_assignments a
      where a.business_id=p_business_id and a.user_id=p_user_id and a.is_active=true)
     and v_current_seats>=v_seat_limit then
    raise exception 'The product licence seat limit has been reached. Increase the authorised seat limit before adding another official.';
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
    jsonb_build_object('competition_id',p_competition_id,'fixture_id',p_fixture_id,'club_id',p_club_id,'user_id',p_user_id,'role',p_role,'licence_seat_limit',v_seat_limit));
  return v_id;
end;
$$;

revoke all on function public.slfa_match_ops_provision_association() from public,anon,authenticated;
commit;