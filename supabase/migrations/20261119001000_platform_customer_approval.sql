-- White Lion SME OS: verified customer approval gate.
-- Customers may authenticate after email confirmation, but cannot use/create workspaces
-- until the platform developer approves them. Safe to re-run.
begin;

create table if not exists public.platform_customer_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_customer_approvals enable row level security;
revoke all on public.platform_customer_approvals from anon, authenticated;

create or replace function public.register_platform_customer()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.platform_customer_approvals(user_id,status)
  values(new.id,'pending')
  on conflict(user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_register_platform_customer on auth.users;
create trigger trg_register_platform_customer
after insert on auth.users
for each row execute function public.register_platform_customer();

-- Existing customers with a workspace are grandfathered as approved.
-- Existing accounts without a workspace remain pending review.
insert into public.platform_customer_approvals(user_id,status)
select u.id, case when exists(select 1 from public.business_members m where m.user_id=u.id and m.is_active) then 'approved' else 'pending' end
from auth.users u
where lower(coalesce(u.email,'')) <> 'koromaalhajiabu0@gmail.com'
on conflict(user_id) do nothing;

create or replace function public.is_platform_customer_approved()
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_platform_developer()
    or (
      exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
      and exists(select 1 from public.platform_customer_approvals a where a.user_id=auth.uid() and a.status='approved')
    );
$$;
revoke all on function public.is_platform_customer_approved() from public;
grant execute on function public.is_platform_customer_approved() to authenticated;

create or replace function public.get_my_platform_access_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_confirmed boolean; v_status text; v_note text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if public.is_platform_developer() then
    return jsonb_build_object('email_confirmed',true,'approval_status','approved','can_access',true,'is_developer',true);
  end if;
  select (u.email_confirmed_at is not null) into v_confirmed from auth.users u where u.id=auth.uid();
  select a.status,a.review_note into v_status,v_note from public.platform_customer_approvals a where a.user_id=auth.uid();
  return jsonb_build_object(
    'email_confirmed',coalesce(v_confirmed,false),
    'approval_status',coalesce(v_status,'pending'),
    'review_note',coalesce(v_note,''),
    'can_access',coalesce(v_confirmed,false) and coalesce(v_status,'pending')='approved',
    'is_developer',false
  );
end;
$$;
revoke all on function public.get_my_platform_access_status() from public;
grant execute on function public.get_my_platform_access_status() to authenticated;

create or replace function public.get_platform_pending_customers()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_rows jsonb;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,'email',u.email,
    'full_name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',''),
    'email_confirmed',u.email_confirmed_at is not null,
    'created_at',u.created_at,'status',coalesce(a.status,'pending')
  ) order by u.created_at desc),'[]'::jsonb)
  into v_rows
  from auth.users u
  left join public.platform_customer_approvals a on a.user_id=u.id
  where lower(coalesce(u.email,'')) <> 'koromaalhajiabu0@gmail.com'
    and coalesce(a.status,'pending')='pending';
  return v_rows;
end;
$$;
revoke all on function public.get_platform_pending_customers() from public;
grant execute on function public.get_platform_pending_customers() to authenticated;

create or replace function public.set_platform_customer_approval(
  p_user_id uuid, p_approved boolean, p_note text default ''
)
returns void language plpgsql security definer set search_path=''
as $$
declare v_email text; v_confirmed timestamptz;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  if p_user_id=auth.uid() then raise exception 'The platform developer account cannot be changed here.'; end if;
  select email,email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user_id;
  if not found then raise exception 'Customer account not found'; end if;
  if v_confirmed is null then raise exception 'Customer must verify their email before approval.'; end if;
  insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note,updated_at)
  values(p_user_id,case when p_approved then 'approved' else 'rejected' end,auth.uid(),now(),coalesce(p_note,''),now())
  on conflict(user_id) do update set status=excluded.status,reviewed_by=excluded.reviewed_by,
    reviewed_at=excluded.reviewed_at,review_note=excluded.review_note,updated_at=now();
  -- The approval row itself stores reviewer, timestamp and decision for an auditable history.
end;
$$;
revoke all on function public.set_platform_customer_approval(uuid,boolean,text) from public;
grant execute on function public.set_platform_customer_approval(uuid,boolean,text) to authenticated;

-- Approval is enforced in the shared membership/role gates used by workspace RLS policies.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_platform_customer_approved()
    and coalesce((select a.is_active from public.platform_account_access a where a.user_id=auth.uid()),true)
    and (public.is_platform_developer() or coalesce((select not (s.setting_value->>'enabled')::boolean from public.platform_settings s where s.setting_key='maintenance_mode'),true))
    and exists(select 1 from public.business_members m join public.businesses b on b.id=m.business_id
      where m.business_id=p_business_id and m.user_id=auth.uid() and m.is_active=true
      and b.is_suspended=false and (public.is_platform_developer() or b.is_frozen=false));
$$;
create or replace function public.has_business_role(p_business_id uuid,p_roles public.business_role[])
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_platform_customer_approved()
    and coalesce((select a.is_active from public.platform_account_access a where a.user_id=auth.uid()),true)
    and (public.is_platform_developer() or coalesce((select not (s.setting_value->>'enabled')::boolean from public.platform_settings s where s.setting_key='maintenance_mode'),true))
    and exists(select 1 from public.business_members m join public.businesses b on b.id=m.business_id
      where m.business_id=p_business_id and m.user_id=auth.uid() and m.is_active=true
      and b.is_suspended=false and (public.is_platform_developer() or b.is_frozen=false) and m.role=any(p_roles));
$$;
revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid,public.business_role[]) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid,public.business_role[]) to authenticated;

-- Prevent a non-approved customer from bypassing the UI and creating a workspace via RPC.
create or replace function public.enforce_customer_approval_before_workspace_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is not null and not public.is_platform_developer() then
    raise exception 'Customer workspaces are created and assigned by the White Lion platform developer. Contact the developer after approval.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_require_customer_approval_for_workspace on public.businesses;
create trigger trg_require_customer_approval_for_workspace
before insert on public.businesses
for each row execute function public.enforce_customer_approval_before_workspace_insert();

commit;
