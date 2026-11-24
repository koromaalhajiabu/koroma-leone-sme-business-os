-- Prevent customer workspace members from assigning or altering the platform verification badge.
create or replace function public.guard_football_club_website_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_developer() then
    if tg_op = 'INSERT' then
      new.verification_status := 'unverified';
      new.verified_at := null;
      new.verified_by := null;
    elsif new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by then
      raise exception 'Only Koroma Leone Tech platform developers can change club verification status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_football_club_website_verification
  on public.football_club_websites;
create trigger guard_football_club_website_verification
before insert or update on public.football_club_websites
for each row execute function public.guard_football_club_website_verification();

revoke all on function public.guard_football_club_website_verification() from public, anon, authenticated;
