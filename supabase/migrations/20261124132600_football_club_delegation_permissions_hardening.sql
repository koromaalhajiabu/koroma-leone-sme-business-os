-- Keep audit and approval records read-only through the browser API.
revoke insert,update,delete on public.football_club_website_change_requests from authenticated;
grant select on public.football_club_website_change_requests to authenticated;
revoke insert,update,delete on public.football_club_website_activity from authenticated;
grant select on public.football_club_website_activity to authenticated;

-- Trigger functions execute through their attached triggers, not as callable RPCs.
revoke all on function public.log_football_club_website_activity() from public,anon,authenticated;

-- The review RPC must re-check the target type and operation before dynamic SQL.
-- See the guarded replacement in the live migration (review_football_club_website_change).
