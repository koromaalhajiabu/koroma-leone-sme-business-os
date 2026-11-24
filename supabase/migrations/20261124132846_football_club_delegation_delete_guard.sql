-- Clubs may grant, update, suspend or revoke developer access, but cannot
-- hard-delete their delegation consent record from the browser client.
revoke delete on public.football_club_website_delegations from authenticated;
grant select, insert, update on public.football_club_website_delegations to authenticated;
