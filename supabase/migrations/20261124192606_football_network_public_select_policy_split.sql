-- Keep anonymous SELECT policies free of internal management helper calls.
-- Authenticated club users retain tenant-scoped management access.

drop policy if exists football_player_career_history_select on public.football_player_career_history;
create policy football_player_career_history_public_select
on public.football_player_career_history for select to anon
using (
  is_published and exists (
    select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_career_history.business_id
      and p.scouting_status='published'
      and public.football_player_discovery_has_consent(p.id,p.is_minor)
  )
);
create policy football_player_career_history_member_select
on public.football_player_career_history for select to authenticated
using (
  public.can_manage_football_club_website_content_direct(business_id,'squad')
  or (is_published and exists (
    select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_career_history.business_id
      and p.scouting_status='published'
      and public.football_player_discovery_has_consent(p.id,p.is_minor)
  ))
);

drop policy if exists football_player_match_performances_select on public.football_player_match_performances;
create policy football_player_match_performances_public_select
on public.football_player_match_performances for select to anon
using (
  is_approved and profile_id is not null and exists (
    select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_match_performances.business_id
      and p.scouting_status='published'
      and public.football_player_discovery_has_consent(p.id,p.is_minor)
  )
);
create policy football_player_match_performances_member_select
on public.football_player_match_performances for select to authenticated
using (
  (is_approved and profile_id is not null and exists (
    select 1 from public.football_player_discovery_profiles p
    where p.id=profile_id and p.business_id=football_player_match_performances.business_id
      and p.scouting_status='published'
      and public.football_player_discovery_has_consent(p.id,p.is_minor)
  ))
  or (
    public.can_manage_football_club_website_content_direct(business_id,'squad')
    and public.can_manage_football_club_website_content_direct(business_id,'fixtures')
  )
);

drop policy if exists football_player_market_listings_select on public.football_player_market_listings;
create policy football_player_market_listings_public_select
on public.football_player_market_listings for select to anon
using (
  status='published'
  and (available_from is null or available_from<=current_date)
  and (expires_at is null or expires_at>=current_date)
  and exists (
    select 1 from public.football_player_discovery_profiles p
    join public.football_club_websites w on w.id=p.website_id and w.business_id=p.business_id
    where p.id=profile_id and p.business_id=football_player_market_listings.business_id
      and p.scouting_status='published' and p.is_minor=false
      and w.verification_status='verified' and w.is_published=true and w.maintenance_mode=false
      and public.football_player_discovery_has_consent(p.id,p.is_minor)
  )
);
create policy football_player_market_listings_member_select
on public.football_player_market_listings for select to authenticated
using (
  public.can_manage_football_club_website_content(business_id,'transfers')
  or (
    status='published'
    and (available_from is null or available_from<=current_date)
    and (expires_at is null or expires_at>=current_date)
    and exists (
      select 1 from public.football_player_discovery_profiles p
      join public.football_club_websites w on w.id=p.website_id and w.business_id=p.business_id
      where p.id=profile_id and p.business_id=football_player_market_listings.business_id
        and p.scouting_status='published' and p.is_minor=false
        and w.verification_status='verified' and w.is_published=true and w.maintenance_mode=false
        and public.football_player_discovery_has_consent(p.id,p.is_minor)
    )
  )
);
