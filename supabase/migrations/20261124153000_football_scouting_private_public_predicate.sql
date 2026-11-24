-- Keep the boolean publication predicate outside the exposed Data API schema.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon,authenticated;

create or replace function app_private.football_player_discovery_is_public(p_profile_id uuid)
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
revoke all on function app_private.football_player_discovery_is_public(uuid) from public;
grant execute on function app_private.football_player_discovery_is_public(uuid) to anon,authenticated;

drop policy if exists football_player_discovery_profiles_select
  on public.football_player_discovery_profiles;
create policy football_player_discovery_profiles_select
on public.football_player_discovery_profiles
for select to anon,authenticated
using (
  app_private.football_player_discovery_is_public(id)
  or public.can_manage_football_club_website_content(business_id,'squad')
);

drop function if exists public.football_player_discovery_is_public(uuid);
