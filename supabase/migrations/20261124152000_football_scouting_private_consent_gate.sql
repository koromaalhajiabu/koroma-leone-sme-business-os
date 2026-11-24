-- Keep consent evidence private: expose only a public-profile eligibility boolean.
revoke all on function public.football_player_discovery_has_consent(uuid,boolean)
  from public,anon,authenticated;

create or replace function public.football_player_discovery_is_public(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.football_player_discovery_profiles p
    join public.football_club_websites w
      on w.id=p.website_id
     and w.business_id=p.business_id
     and w.is_published=true
     and w.maintenance_mode=false
    join public.football_player_discovery_consents c
      on c.profile_id=p.id
     and c.business_id=p.business_id
    where p.id=p_profile_id
      and p.scouting_status='published'
      and c.player_or_parent_consent=true
      and c.consent_method <> 'not_recorded'
      and c.recorded_at is not null
      and c.withdrawn_at is null
      and (p.is_minor=false or c.guardian_consent=true)
  );
$function$;
revoke all on function public.football_player_discovery_is_public(uuid) from public;
grant execute on function public.football_player_discovery_is_public(uuid) to anon,authenticated;

drop policy if exists football_player_discovery_profiles_select
  on public.football_player_discovery_profiles;
create policy football_player_discovery_profiles_select
on public.football_player_discovery_profiles
for select to anon,authenticated
using (
  public.football_player_discovery_is_public(id)
  or public.can_manage_football_club_website_content(business_id,'squad')
);

alter function public.guard_football_player_discovery_publication()
  security definer;
revoke all on function public.guard_football_player_discovery_publication()
  from public,anon,authenticated;
