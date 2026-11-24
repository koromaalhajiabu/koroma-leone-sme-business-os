-- Material changes to a verified scout's identity require a fresh platform review.
create or replace function app_private.require_scout_reverification_on_profile_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.verification_status='verified' and (
    new.full_name is distinct from old.full_name
    or new.organisation is distinct from old.organisation
    or new.job_title is distinct from old.job_title
    or new.contact_email is distinct from old.contact_email
    or new.country is distinct from old.country
    or new.website_url is distinct from old.website_url
  ) then
    new.verification_status := 'pending';
    new.verification_comment := 'Professional profile details changed. Re-verification is required.';
    new.verified_by := null;
    new.verified_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function app_private.require_scout_reverification_on_profile_change() from public,anon,authenticated;
drop trigger if exists football_scout_reverification_on_profile_change on public.football_scout_accounts;
create trigger football_scout_reverification_on_profile_change
before update on public.football_scout_accounts
for each row execute function app_private.require_scout_reverification_on_profile_change();
