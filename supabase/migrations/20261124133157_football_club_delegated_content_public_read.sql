-- Keep public access to published club websites while the delegated access
-- helper is evaluated inside SELECT RLS policies.
grant execute on function public.can_manage_football_club_website_content(uuid,text)
  to anon,authenticated;

drop policy if exists football_club_website_select on public.football_club_websites;
create policy football_club_website_select
on public.football_club_websites
for select to anon,authenticated
using (is_published=true or public.can_manage_football_club_website(business_id));
