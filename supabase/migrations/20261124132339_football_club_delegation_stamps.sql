-- Stamp club consent actions and approver identity on every delegation write.
create or replace function public.stamp_football_club_website_delegation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
  elsif new.status is distinct from old.status and new.status = 'active' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists stamp_football_club_website_delegation on public.football_club_website_delegations;
create trigger stamp_football_club_website_delegation
before insert or update on public.football_club_website_delegations
for each row execute function public.stamp_football_club_website_delegation();
revoke all on function public.stamp_football_club_website_delegation() from public,anon;
grant execute on function public.stamp_football_club_website_delegation() to authenticated;
