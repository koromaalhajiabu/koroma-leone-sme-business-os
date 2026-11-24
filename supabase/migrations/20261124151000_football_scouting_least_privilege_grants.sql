-- Revoke inherited broad Data API grants and regrant least-privilege access.
revoke all on table public.football_player_discovery_profiles from public,anon,authenticated;
revoke all on table public.football_player_discovery_consents from public,anon,authenticated;
revoke all on table public.football_scout_accounts from public,anon,authenticated;
revoke all on table public.football_scout_enquiries from public,anon,authenticated;

grant select on table public.football_player_discovery_profiles to anon,authenticated;
grant insert,update on table public.football_player_discovery_profiles to authenticated;

grant select,insert,update on table public.football_player_discovery_consents to authenticated;

grant select on table public.football_scout_accounts to authenticated;
grant insert (user_id,full_name,organisation,job_title,contact_email,country,website_url)
  on table public.football_scout_accounts to authenticated;
grant update (full_name,organisation,job_title,contact_email,country,website_url,updated_at)
  on table public.football_scout_accounts to authenticated;

grant select on table public.football_scout_enquiries to authenticated;
grant update (status,club_response,responded_by,responded_at,updated_at)
  on table public.football_scout_enquiries to authenticated;
