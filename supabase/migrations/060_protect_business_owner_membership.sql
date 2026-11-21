-- Preserve business ownership during developer-managed membership changes.
-- An existing owner must be changed only through a dedicated ownership-transfer workflow.
begin;

create or replace function public.set_platform_member_access(
  p_business_id uuid,
  p_email text,
  p_role public.business_role,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_existing_role public.business_role;
begin
  if not public.is_platform_developer() then
    raise exception 'Developer access required';
  end if;

  if p_business_id is null or coalesce(trim(p_email), '') = '' or p_role is null then
    raise exception 'Business, registered email and role are required';
  end if;

  select id
    into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No registered account found for that email';
  end if;

  if p_role = 'owner' then
    raise exception 'Owner role changes require a separate transfer process';
  end if;

  select role
    into v_existing_role
  from public.business_members
  where business_id = p_business_id
    and user_id = v_user_id
  for update;

  if found and v_existing_role = 'owner' then
    raise exception 'The existing business owner cannot be changed through staff access management. Use the ownership-transfer process.';
  end if;

  insert into public.business_members(business_id, user_id, role, is_active, invited_by)
  values (p_business_id, v_user_id, p_role, p_is_active, auth.uid())
  on conflict (business_id, user_id) do update
    set role = excluded.role,
        is_active = excluded.is_active;

  insert into public.audit_logs(
    business_id, actor_user_id, action, entity_table, entity_id, details
  )
  values (
    p_business_id,
    auth.uid(),
    'platform_membership_changed',
    'business_members',
    v_user_id::text,
    jsonb_build_object(
      'email', lower(trim(p_email)),
      'role', p_role,
      'active', p_is_active
    )
  );
end;
$function$;

revoke all on function public.set_platform_member_access(uuid, text, public.business_role, boolean) from public, anon;
grant execute on function public.set_platform_member_access(uuid, text, public.business_role, boolean) to authenticated;

commit;