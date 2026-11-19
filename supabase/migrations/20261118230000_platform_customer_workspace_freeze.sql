-- White Lion SME Business OS: customer workspace freeze controls.
-- Run in Supabase SQL Editor. Safe to re-run.
begin;

alter table public.businesses
  add column if not exists is_frozen boolean not null default false,
  add column if not exists freeze_note text not null default '',
  add column if not exists frozen_at timestamptz,
  add column if not exists frozen_by uuid references auth.users(id);

-- Keep account suspension and global maintenance behaviour, and add an
-- independent per-workspace freeze gate. The developer can still administer
-- frozen workspaces. The platform owner's workspace is protected.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select a.is_active from public.platform_account_access a where a.user_id=auth.uid()), true)
    and (
      public.is_platform_developer()
      or coalesce((
        select not (s.setting_value ->> 'enabled')::boolean
        from public.platform_settings s
        where s.setting_key='maintenance_mode'
      ), true)
    )
    and exists (
      select 1
      from public.business_members m
      join public.businesses b on b.id=m.business_id
      where m.business_id=p_business_id
        and m.user_id=auth.uid()
        and m.is_active=true
        and b.is_suspended=false
        and (public.is_platform_developer() or b.is_frozen=false)
    );
$$;

create or replace function public.has_business_role(
  p_business_id uuid,
  p_roles public.business_role[]
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select a.is_active from public.platform_account_access a where a.user_id=auth.uid()), true)
    and (
      public.is_platform_developer()
      or coalesce((
        select not (s.setting_value ->> 'enabled')::boolean
        from public.platform_settings s
        where s.setting_key='maintenance_mode'
      ), true)
    )
    and exists (
      select 1
      from public.business_members m
      join public.businesses b on b.id=m.business_id
      where m.business_id=p_business_id
        and m.user_id=auth.uid()
        and m.is_active=true
        and b.is_suspended=false
        and (public.is_platform_developer() or b.is_frozen=false)
        and m.role=any(p_roles)
    );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid,public.business_role[]) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid,public.business_role[]) to authenticated;

-- Return every workspace in the private developer directory.
create or replace function public.get_platform_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_developer() then
    raise exception 'Developer access required';
  end if;

  select jsonb_build_object(
    'business_count', (select count(*) from public.businesses),
    'suspended_count', (select count(*) from public.businesses where is_suspended),
    'frozen_count', (select count(*) from public.businesses where is_frozen),
    'user_count', (select count(*) from auth.users),
    'maintenance', coalesce((select setting_value from public.platform_settings where setting_key='maintenance_mode'), '{"enabled":false}'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'industry', b.industry,
        'currency_code', b.currency_code,
        'owner_email', u.email,
        'is_suspended', b.is_suspended,
        'is_frozen', b.is_frozen,
        'freeze_note', b.freeze_note,
        'created_at', b.created_at,
        'member_count', (select count(*) from public.business_members m where m.business_id=b.id),
        'subscription_status', (select s.status from public.business_subscriptions s where s.business_id=b.id order by s.created_at desc limit 1),
        'subscription_plan', (select s.plan_code from public.business_subscriptions s where s.business_id=b.id order by s.created_at desc limit 1)
      ) order by lower(b.name), b.created_at desc)
      from public.businesses b
      left join auth.users u on u.id=b.owner_user_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_platform_dashboard() from public;
grant execute on function public.get_platform_dashboard() to authenticated;

-- Suspension is a separate control from workspace freezing.
create or replace function public.set_platform_business_suspension(
  p_business_id uuid,
  p_is_suspended boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_name text;
begin
  if not public.is_platform_developer() then
    raise exception 'Developer access required';
  end if;
  if p_business_id = '50b69fb6-688c-4f28-8755-12cb5c34dc77'::uuid then
    raise exception 'The White Lion platform owner workspace is protected.';
  end if;
  update public.businesses
  set is_suspended=p_is_suspended, updated_at=now()
  where id=p_business_id
  returning name into v_business_name;
  if not found then raise exception 'Business not found'; end if;
  insert into public.audit_logs(business_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_business_id, auth.uid(),
    case when p_is_suspended then 'platform_business_suspended' else 'platform_business_restored' end,
    'businesses', p_business_id::text,
    jsonb_build_object('business_name',v_business_name,'is_suspended',p_is_suspended));
end;
$$;
revoke all on function public.set_platform_business_suspension(uuid,boolean) from public;
grant execute on function public.set_platform_business_suspension(uuid,boolean) to authenticated;

create or replace function public.set_platform_business_freeze(
  p_business_id uuid,
  p_is_frozen boolean,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_name text;
begin
  if not public.is_platform_developer() then
    raise exception 'Developer access required';
  end if;
  if p_business_id = '50b69fb6-688c-4f28-8755-12cb5c34dc77'::uuid then
    raise exception 'The White Lion platform owner workspace is protected.';
  end if;
  update public.businesses
  set is_frozen=p_is_frozen,
      freeze_note=case when p_is_frozen then coalesce(nullif(trim(p_note),''),'Workspace temporarily frozen by platform developer.') else '' end,
      frozen_at=case when p_is_frozen then now() else null end,
      frozen_by=case when p_is_frozen then auth.uid() else null end,
      updated_at=now()
  where id=p_business_id
  returning name into v_business_name;
  if not found then raise exception 'Business not found'; end if;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(p_business_id,auth.uid(),
    case when p_is_frozen then 'platform_business_frozen' else 'platform_business_unfrozen' end,
    'businesses',p_business_id::text,
    jsonb_build_object('business_name',v_business_name,'is_frozen',p_is_frozen,'note',coalesce(p_note,'')));
end;
$$;
revoke all on function public.set_platform_business_freeze(uuid,boolean,text) from public;
grant execute on function public.set_platform_business_freeze(uuid,boolean,text) to authenticated;

commit;
