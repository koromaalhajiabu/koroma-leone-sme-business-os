-- Read the age band directly in the BEFORE trigger; generated columns are
-- calculated after BEFORE triggers and must not be used for the guardian gate.
create or replace function public.guard_football_player_discovery_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_minor boolean;
begin
  v_is_minor := (new.age_band='Under 18');
  if v_is_minor then
    new.public_name := 'Youth player';
    new.public_slug := 'youth-player-' || substr(replace(new.squad_member_id::text,'-',''),1,10);
  end if;

  if new.scouting_status='published' then
    if not public.has_business_role(new.business_id,array['owner','admin','manager']::public.business_role[]) then
      raise exception 'Only the club owner, administrator or manager can approve and publish a player scouting profile.';
    end if;
    if not public.football_player_discovery_has_consent(new.id,v_is_minor) then
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
revoke all on function public.guard_football_player_discovery_publication()
  from public,anon,authenticated;
