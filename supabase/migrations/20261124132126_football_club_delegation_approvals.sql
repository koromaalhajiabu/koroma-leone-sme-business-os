-- Club website delegation, approval and audit foundation.
-- Applied to the Koroma Leone Tech Supabase project.

create table if not exists public.football_club_website_delegations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid not null references public.football_club_websites(id) on delete cascade,
  status text not null default 'inactive' check (status in ('inactive','active','suspended','revoked')),
  approval_mode text not null default 'direct' check (approval_mode in ('direct','approval_required')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id),
  unique (website_id)
);

create table if not exists public.football_club_website_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid not null references public.football_club_websites(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  target_table text not null,
  target_id uuid,
  operation text not null check (operation in ('insert','update','delete')),
  proposed_content jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  manager_comment text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.football_club_website_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid not null references public.football_club_websites(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('platform_developer','club_user','system')),
  action text not null,
  target_table text not null,
  target_id uuid,
  summary text not null,
  changed_fields text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists football_club_delegations_business_status_idx
  on public.football_club_website_delegations(business_id,status);
create index if not exists football_club_change_requests_business_status_created_idx
  on public.football_club_website_change_requests(business_id,status,created_at desc);
create index if not exists football_club_change_requests_submitter_idx
  on public.football_club_website_change_requests(submitted_by,created_at desc);
create index if not exists football_club_activity_business_created_idx
  on public.football_club_website_activity(business_id,created_at desc);

alter table public.football_club_website_delegations enable row level security;
alter table public.football_club_website_change_requests enable row level security;
alter table public.football_club_website_activity enable row level security;

grant select, insert, update on public.football_club_website_delegations to authenticated;
grant select, insert, update on public.football_club_website_change_requests to authenticated;
grant select on public.football_club_website_activity to authenticated;

drop policy if exists football_club_delegations_select on public.football_club_website_delegations;
create policy football_club_delegations_select
on public.football_club_website_delegations
for select to authenticated
using (
  public.is_platform_developer()
  or public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[])
);

drop policy if exists football_club_delegations_insert on public.football_club_website_delegations;
create policy football_club_delegations_insert
on public.football_club_website_delegations
for insert to authenticated
with check (
  public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[])
);

drop policy if exists football_club_delegations_update on public.football_club_website_delegations;
create policy football_club_delegations_update
on public.football_club_website_delegations
for update to authenticated
using (
  public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[])
)
with check (
  public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[])
);

drop policy if exists football_club_change_requests_select on public.football_club_website_change_requests;
create policy football_club_change_requests_select
on public.football_club_website_change_requests
for select to authenticated
using (
  public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website(business_id))
);

drop policy if exists football_club_change_requests_insert on public.football_club_website_change_requests;
create policy football_club_change_requests_insert
on public.football_club_website_change_requests
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and public.is_platform_developer()
  and public.can_manage_football_club_website(business_id)
);

drop policy if exists football_club_change_requests_update on public.football_club_website_change_requests;
create policy football_club_change_requests_update
on public.football_club_website_change_requests
for update to authenticated
using (public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[]))
with check (public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[]));

drop policy if exists football_club_activity_select on public.football_club_website_activity;
create policy football_club_activity_select
on public.football_club_website_activity
for select to authenticated
using (
  public.has_business_role(business_id, array['owner','admin','manager']::public.business_role[])
  or (public.is_platform_developer() and public.can_manage_football_club_website(business_id))
);

create or replace function public.can_manage_football_club_website(p_business_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.has_business_role(p_business_id, array['owner','admin','manager']::public.business_role[])
    or (
      public.is_platform_developer()
      and exists (
        select 1 from public.football_club_website_delegations d
        where d.business_id=p_business_id and d.status='active'
      )
    )
  );
$function$;

create or replace function public.submit_football_club_website_change(
  p_business_id uuid,
  p_target_table text,
  p_target_id uuid,
  p_operation text,
  p_content jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_website public.football_club_websites%rowtype;
  v_delegation public.football_club_website_delegations%rowtype;
  v_request_id uuid;
  v_exists boolean;
  v_allowed_tables constant text[] := array[
    'football_club_websites','football_club_website_pages','football_club_website_news',
    'football_club_website_squad','football_club_website_staff','football_club_website_fixtures',
    'football_club_website_standings','football_club_website_transfers','football_club_website_gallery',
    'football_club_website_sponsors','football_club_website_events','football_club_website_honours'
  ];
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Only the Koroma Leone Tech platform developer can submit delegated website changes.';
  end if;
  if not (p_target_table = any(v_allowed_tables)) then
    raise exception 'This content type is not eligible for delegated changes.';
  end if;
  if p_operation not in ('insert','update','delete') then
    raise exception 'Unsupported change operation.';
  end if;
  if jsonb_typeof(coalesce(p_content,'{}'::jsonb)) <> 'object' then
    raise exception 'Change content must be a JSON object.';
  end if;
  select * into v_website from public.football_club_websites where business_id=p_business_id;
  if not found then raise exception 'Club website does not exist.'; end if;
  select * into v_delegation from public.football_club_website_delegations
  where business_id=p_business_id and website_id=v_website.id and status='active';
  if not found then raise exception 'This club has not authorised active Koroma Leone Tech website management.'; end if;
  if v_delegation.approval_mode <> 'approval_required' then
    raise exception 'This club uses direct publishing. Save the change directly instead.';
  end if;
  if p_target_table='football_club_websites' and p_operation<>'update' then
    raise exception 'The club website profile can only be updated, not inserted or deleted here.';
  end if;
  if p_operation='insert' and p_target_id is not null then raise exception 'A new content item must not include an existing record ID.'; end if;
  if p_operation in ('update','delete') then
    if p_target_id is null then raise exception 'The record ID is required for updates and deletions.'; end if;
    execute format('select exists(select 1 from public.%I where id=$1 and business_id=$2)',p_target_table)
      into v_exists using p_target_id,p_business_id;
    if not v_exists then raise exception 'The target record does not exist in this club website.'; end if;
  end if;
  insert into public.football_club_website_change_requests(
    business_id,website_id,submitted_by,target_table,target_id,operation,proposed_content
  ) values (p_business_id,v_website.id,auth.uid(),p_target_table,p_target_id,p_operation,coalesce(p_content,'{}'::jsonb))
  returning id into v_request_id;

  insert into public.football_club_website_activity(
    business_id,website_id,actor_user_id,actor_type,action,target_table,target_id,summary,metadata
  ) values (
    p_business_id,v_website.id,auth.uid(),'platform_developer','submitted_for_approval',
    p_target_table,p_target_id,'Submitted a website change for club approval.',
    jsonb_build_object('request_id',v_request_id,'operation',p_operation)
  );

  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  select bm.user_id,p_business_id,'approvals','Website update awaiting approval',
    'Koroma Leone Tech submitted a website content change for your review.',
    'club-website-studio','fcw-submit-'||v_request_id::text||'-'||bm.user_id::text
  from public.business_members bm
  where bm.business_id=p_business_id and bm.is_active=true and bm.role::text in ('owner','admin','manager');
  return v_request_id;
end;
$function$;

create or replace function public.review_football_club_website_change(
  p_request_id uuid,
  p_decision text,
  p_manager_comment text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req public.football_club_website_change_requests%rowtype;
  v_keys text[];
  v_column_list text;
  v_select_list text;
  v_set_list text;
  v_sql text;
  v_rows integer;
  v_website_id uuid;
  v_allowed_tables constant text[] := array[
    'football_club_websites','football_club_website_pages','football_club_website_news',
    'football_club_website_squad','football_club_website_staff','football_club_website_fixtures',
    'football_club_website_standings','football_club_website_transfers','football_club_website_gallery',
    'football_club_website_sponsors','football_club_website_events','football_club_website_honours'
  ];
begin
  if auth.uid() is null then raise exception 'You must sign in to review website changes.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
  select * into v_req from public.football_club_website_change_requests where id=p_request_id for update;
  if not found then raise exception 'Change request not found.'; end if;
  if not public.has_business_role(v_req.business_id,array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only the club owner, administrator or manager can review website changes.';
  end if;
  if v_req.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
  if not (v_req.target_table=any(v_allowed_tables)) then raise exception 'This requested content type cannot be reviewed.'; end if;
  if v_req.operation not in ('insert','update','delete') then raise exception 'Unsupported change operation.'; end if;
  if v_req.target_table='football_club_websites' and v_req.operation<>'update' then
    raise exception 'A club website profile can only be updated through an approval.';
  end if;
  if v_req.operation in ('update','delete') and v_req.target_id is null then raise exception 'The target record ID is missing.'; end if;
  if v_req.operation='insert' and v_req.target_id is not null then raise exception 'An insert request cannot target an existing record ID.'; end if;

  if p_decision='approved' then
    if v_req.operation='insert' then
      select array_agg(keys.key order by keys.key) into v_keys
      from jsonb_object_keys(v_req.proposed_content) as keys(key)
      where keys.key not in ('id','business_id','created_at','updated_at')
        and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_req.target_table and c.column_name=keys.key);
      if coalesce(array_length(v_keys,1),0)=0 then raise exception 'The submitted content contains no recognised fields.'; end if;
      select string_agg(format('%I',selected.key),', ' order by selected.key),
             string_agg(format('r.%I',selected.key),', ' order by selected.key)
      into v_column_list,v_select_list from unnest(v_keys) as selected(key);
      v_sql:=format('insert into public.%I (business_id,%s) select $1,%s from jsonb_populate_record(null::public.%I,$2) as r',
        v_req.target_table,v_column_list,v_select_list,v_req.target_table);
      execute v_sql using v_req.business_id,v_req.proposed_content;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'The content item was not inserted.'; end if;

    elsif v_req.operation='update' then
      select array_agg(keys.key order by keys.key) into v_keys
      from jsonb_object_keys(v_req.proposed_content) as keys(key)
      where keys.key not in ('id','business_id','created_at','updated_at')
        and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_req.target_table and c.column_name=keys.key);
      if coalesce(array_length(v_keys,1),0)=0 then raise exception 'The submitted content contains no editable fields.'; end if;
      select string_agg(format('%I = r.%I',selected.key,selected.key),', ' order by selected.key)
      into v_set_list from unnest(v_keys) as selected(key);
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=v_req.target_table and column_name='updated_at') then
        v_set_list:=v_set_list||', updated_at=now()';
      end if;
      v_sql:=format('update public.%I as t set %s from jsonb_populate_record(null::public.%I,$1) as r where t.id=$2 and t.business_id=$3',
        v_req.target_table,v_set_list,v_req.target_table);
      execute v_sql using v_req.proposed_content,v_req.target_id,v_req.business_id;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'The target record was not updated.'; end if;

    elsif v_req.operation='delete' then
      execute format('delete from public.%I where id=$1 and business_id=$2',v_req.target_table)
        using v_req.target_id,v_req.business_id;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'The target record was not deleted.'; end if;
    end if;
  end if;

  update public.football_club_website_change_requests set status=p_decision,
    manager_comment=nullif(trim(coalesce(p_manager_comment,'')),''),
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
  select id into v_website_id from public.football_club_websites where business_id=v_req.business_id;

  insert into public.football_club_website_activity(
    business_id,website_id,actor_user_id,actor_type,action,target_table,target_id,summary,metadata
  ) values (
    v_req.business_id,v_website_id,auth.uid(),'club_user',
    case when p_decision='approved' then 'change_approved' else 'change_rejected' end,
    v_req.target_table,v_req.target_id,
    case when p_decision='approved' then 'Approved a website content change.' else 'Rejected a website content change.' end,
    jsonb_build_object('request_id',p_request_id,'comment',p_manager_comment)
  );

  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  values (
    v_req.submitted_by,v_req.business_id,'approvals',
    case when p_decision='approved' then 'Website update approved' else 'Website update rejected' end,
    case when p_decision='approved' then 'The club approved your submitted website update.'
         else 'The club rejected your submitted website update.' end
      || case when nullif(trim(coalesce(p_manager_comment,'')),'') is not null then ' Manager note: '||trim(p_manager_comment) else '' end,
    'club-website-studio','fcw-review-'||p_request_id::text||'-'||p_decision
  );
  return true;
end;
$function$;

create or replace function public.log_football_club_website_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row jsonb;
  v_old jsonb;
  v_business_id uuid;
  v_target_id uuid;
  v_website_id uuid;
  v_action text;
  v_actor_type text;
  v_changed text[] := array[]::text[];
begin
  if tg_op='DELETE' then v_row:=to_jsonb(old);v_old:=v_row;v_action:='delete';
  elsif tg_op='INSERT' then v_row:=to_jsonb(new);v_action:='create';
  else
    v_row:=to_jsonb(new);v_old:=to_jsonb(old);v_action:='update';
    select coalesce(array_agg(n.key order by n.key),array[]::text[]) into v_changed
    from jsonb_each(v_row) as n left join jsonb_each(v_old) as o using(key)
    where n.value is distinct from o.value and n.key not in ('updated_at');
  end if;
  v_business_id:=(v_row->>'business_id')::uuid;
  v_target_id:=(v_row->>'id')::uuid;
  v_actor_type:=case when auth.uid() is null then 'system'
    when public.is_platform_developer() then 'platform_developer' else 'club_user' end;
  select id into v_website_id from public.football_club_websites where business_id=v_business_id;
  if v_website_id is not null then
    insert into public.football_club_website_activity(
      business_id,website_id,actor_user_id,actor_type,action,target_table,target_id,summary,changed_fields
    ) values (
      v_business_id,v_website_id,auth.uid(),v_actor_type,v_action,tg_table_name,v_target_id,
      initcap(v_action)||'d a record in '||replace(tg_table_name,'football_club_website_','')||'.',v_changed
    );
  end if;
  if v_actor_type='platform_developer' then
    insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    select bm.user_id,v_business_id,'approvals','Club website updated',
      'Koroma Leone Tech updated content on your club website.','club-website-studio',
      'fcw-activity-'||gen_random_uuid()::text
    from public.business_members bm
    where bm.business_id=v_business_id and bm.is_active=true
      and bm.role::text in ('owner','admin','manager') and bm.user_id<>auth.uid();
  end if;
  if tg_table_name='football_club_website_delegations' then
    insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    select u.id,v_business_id,'approvals','Club website delegation changed',
      'A club workspace has updated its Koroma Leone Tech website management authorisation.',
      'club-website-studio','fcw-delegation-'||gen_random_uuid()::text
    from auth.users u join public.platform_developer_emails d on lower(d.email)=lower(u.email);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

do $triggers$
declare
  v_table text;
  v_tables constant text[] := array[
    'football_club_websites','football_club_website_pages','football_club_website_news',
    'football_club_website_squad','football_club_website_staff','football_club_website_fixtures',
    'football_club_website_standings','football_club_website_transfers','football_club_website_gallery',
    'football_club_website_sponsors','football_club_website_events','football_club_website_honours',
    'football_club_website_delegations'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop trigger if exists log_football_club_website_activity on public.%I',v_table);
    execute format('create trigger log_football_club_website_activity after insert or update or delete on public.%I for each row execute function public.log_football_club_website_activity()',v_table);
  end loop;
end;
$triggers$;

revoke all on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) from public,anon;
revoke all on function public.review_football_club_website_change(uuid,text,text) from public,anon;
grant execute on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) to authenticated;
grant execute on function public.review_football_club_website_change(uuid,text,text) to authenticated;
