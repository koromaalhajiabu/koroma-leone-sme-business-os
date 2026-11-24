-- This helper returns only a boolean and exposes no underlying consent records.
revoke all on function public.football_player_discovery_has_consent(uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.football_player_discovery_has_consent(uuid,boolean)
  to anon,authenticated;
