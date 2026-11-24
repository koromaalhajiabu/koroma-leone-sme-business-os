-- Tighten public identity and consent evidence for youth player profiles.
create or replace function public.football_player_discovery_has_consent(
  p_profile_id uuid,
  p_is_minor boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.football_player_discovery_consents c
    where c.profile_id=p_profile_id
      and c.player_or_parent_consent=true
      and c.consent_method <> 'not_recorded'
      and c.recorded_at is not null
      and c.withdrawn_at is null
      and (coalesce(p_is_minor,false)=false or c.guardian_consent=true)
  );
$function$;
revoke all on function public.football_player_discovery_has_consent(uuid,boolean) from public;
grant execute on function public.football_player_discovery_has_consent(uuid,boolean) to anon,authenticated;

create or replace function public.guard_football_player_discovery_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.is_minor then
    -- Do not publish a minor's full identity in the name or profile URL.
    new.public_name := 'Youth player';
    new.public_slug := 'youth-player-' || substr(replace(new.squad_member_id::text,'-',''),1,10);
  end if;

  if new.scouting_status='published' then
    if not public.has_business_role(new.business_id,array['owner','admin','manager']::public.business_role[]) then
      raise exception 'Only the club owner, administrator or manager can approve and publish a player scouting profile.';
    end if;
    if not public.football_player_discovery_has_consent(new.id,new.is_minor) then
      raise exception 'Recorded player consent is required; recorded guardian consent is also required for a player under 18.';
    end if;
    new.club_approved_by := auth.uid();
    new.club_approved_at := now();
  end if;
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$function$;
revoke all on function public.guard_football_player_discovery_publication() from public,anon,authenticated;

drop trigger if exists guard_football_player_discovery_publication on public.football_player_discovery_profiles;
create trigger guard_football_player_discovery_publication
before insert or update on public.football_player_discovery_profiles
for each row execute function public.guard_football_player_discovery_publication();
