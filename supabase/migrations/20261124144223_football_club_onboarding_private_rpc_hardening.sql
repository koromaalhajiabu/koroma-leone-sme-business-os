-- Move privileged club onboarding data access into the non-exposed app_private schema.
-- Public PostgREST RPCs become SECURITY INVOKER wrappers; private functions enforce identity/role checks.

do $$
declare
  v record;
  v_definition text;
begin
  for v in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'submit_football_club_application',
        'update_my_football_club_application',
        'attach_my_football_club_application_evidence',
        'get_platform_club_applications',
        'review_football_club_application'
      )
  loop
    v_definition := pg_get_functiondef(v.oid);
    v_definition := replace(
      v_definition,
      'FUNCTION public.' || v.proname,
      'FUNCTION app_private.' || v.proname
    );
    if position('FUNCTION app_private.' || v.proname in v_definition)=0 then
      raise exception 'Could not relocate function % into app_private',v.proname;
    end if;
    execute v_definition;
  end loop;
end;
$$;

revoke all on function app_private.submit_football_club_application(jsonb) from public, anon;
revoke all on function app_private.update_my_football_club_application(uuid,jsonb) from public, anon;
revoke all on function app_private.attach_my_football_club_application_evidence(uuid,text) from public, anon;
revoke all on function app_private.get_platform_club_applications() from public, anon;
revoke all on function app_private.review_football_club_application(uuid,text,text,text) from public, anon;
grant execute on function app_private.submit_football_club_application(jsonb) to authenticated;
grant execute on function app_private.update_my_football_club_application(uuid,jsonb) to authenticated;
grant execute on function app_private.attach_my_football_club_application_evidence(uuid,text) to authenticated;
grant execute on function app_private.get_platform_club_applications() to authenticated;
grant execute on function app_private.review_football_club_application(uuid,text,text,text) to authenticated;

create or replace function public.submit_football_club_application(p_payload jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.submit_football_club_application(p_payload);
$$;

create or replace function public.update_my_football_club_application(
  p_application_id uuid,
  p_payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.update_my_football_club_application(p_application_id,p_payload);
$$;

create or replace function public.attach_my_football_club_application_evidence(
  p_application_id uuid,
  p_evidence_path text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.attach_my_football_club_application_evidence(p_application_id,p_evidence_path);
$$;

create or replace function public.get_platform_club_applications()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_platform_club_applications();
$$;

create or replace function public.review_football_club_application(
  p_application_id uuid,
  p_decision text,
  p_note text default '',
  p_website_slug text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.review_football_club_application(
    p_application_id,p_decision,p_note,p_website_slug
  );
$$;

revoke all on function public.submit_football_club_application(jsonb) from public, anon;
revoke all on function public.update_my_football_club_application(uuid,jsonb) from public, anon;
revoke all on function public.attach_my_football_club_application_evidence(uuid,text) from public, anon;
revoke all on function public.get_platform_club_applications() from public, anon;
revoke all on function public.review_football_club_application(uuid,text,text,text) from public, anon;
grant execute on function public.submit_football_club_application(jsonb) to authenticated;
grant execute on function public.update_my_football_club_application(uuid,jsonb) to authenticated;
grant execute on function public.attach_my_football_club_application_evidence(uuid,text) to authenticated;
grant execute on function public.get_platform_club_applications() to authenticated;
grant execute on function public.review_football_club_application(uuid,text,text,text) to authenticated;

create index if not exists football_club_applications_business_id_idx
  on public.football_club_applications(business_id);
create index if not exists football_club_applications_reviewed_by_idx
  on public.football_club_applications(reviewed_by);
create index if not exists football_club_applications_website_id_idx
  on public.football_club_applications(website_id);
create index if not exists football_club_websites_verified_by_idx
  on public.football_club_websites(verified_by);

drop policy if exists football_club_applications_read_own_or_developer
  on public.football_club_applications;
create policy football_club_applications_read_own_or_developer
  on public.football_club_applications
  for select to authenticated
  using (
    applicant_user_id = (select auth.uid())
    or (select public.is_platform_developer())
  );
