-- Fine-grained delegation scopes for football club websites.
alter table public.football_club_website_delegations
  add column if not exists permissions jsonb not null default
  '{"profile":true,"pages":true,"news":true,"squad":true,"staff":true,"fixtures":true,"standings":true,"transfers":true,"gallery":true,"sponsors":true,"events":true,"honours":true,"enquiries":true}'::jsonb;

alter table public.football_club_website_delegations
  drop constraint if exists football_club_website_delegations_permissions_object_check;
alter table public.football_club_website_delegations
  add constraint football_club_website_delegations_permissions_object_check
  check (jsonb_typeof(permissions) = 'object');

create or replace function public.can_manage_football_club_website_content(
  p_business_id uuid,
  p_permission text
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.has_business_role(p_business_id, array['owner','admin','manager']::public.business_role[])
    or (
      public.is_platform_developer()
      and p_permission = any(array[
        'profile','pages','news','squad','staff','fixtures','standings',
        'transfers','gallery','sponsors','events','honours','enquiries'
      ]::text[])
      and exists (
        select 1
        from public.football_club_website_delegations d
        where d.business_id = p_business_id
          and d.status = 'active'
          and coalesce(d.permissions -> p_permission, 'true'::jsonb) = 'true'::jsonb
      )
    )
  );
$function$;

revoke all on function public.can_manage_football_club_website_content(uuid,text) from public,anon;
grant execute on function public.can_manage_football_club_website_content(uuid,text) to authenticated;

-- Replace broad developer writes with the club-approved content scopes.
do $policies$
declare r record;
begin
  for r in
    select * from (values
      ('football_club_website_pages','pages'),
      ('football_club_website_news','news'),
      ('football_club_website_squad','squad'),
      ('football_club_website_staff','staff'),
      ('football_club_website_fixtures','fixtures'),
      ('football_club_website_standings','standings'),
      ('football_club_website_transfers','transfers'),
      ('football_club_website_gallery','gallery'),
      ('football_club_website_sponsors','sponsors'),
      ('football_club_website_events','events'),
      ('football_club_website_honours','honours')
    ) as modules(table_name,permission_key)
  loop
    execute format('drop policy if exists %I on public.%I',r.table_name||'_select',r.table_name);
    execute format('drop policy if exists %I on public.%I',r.table_name||'_insert',r.table_name);
    execute format('drop policy if exists %I on public.%I',r.table_name||'_update',r.table_name);
    execute format('drop policy if exists %I on public.%I',r.table_name||'_delete',r.table_name);

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (public.can_manage_football_club_website_content(business_id,%L) or (is_published=true and public.is_published_football_club_website(business_id)))',
      r.table_name||'_select',r.table_name,r.permission_key
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_football_club_website_content(business_id,%L))',
      r.table_name||'_insert',r.table_name,r.permission_key
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_football_club_website_content(business_id,%L)) with check (public.can_manage_football_club_website_content(business_id,%L))',
      r.table_name||'_update',r.table_name,r.permission_key,r.permission_key
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_football_club_website_content(business_id,%L))',
      r.table_name||'_delete',r.table_name,r.permission_key
    );
  end loop;
end;
$policies$;

drop policy if exists football_club_website_select on public.football_club_websites;
drop policy if exists football_club_website_insert on public.football_club_websites;
drop policy if exists football_club_website_update on public.football_club_websites;
drop policy if exists football_club_website_delete on public.football_club_websites;

create policy football_club_website_select
on public.football_club_websites
for select to anon, authenticated
using (is_published=true or public.can_manage_football_club_website_content(business_id,'profile'));
create policy football_club_website_insert
on public.football_club_websites
for insert to authenticated
with check (public.can_manage_football_club_website_content(business_id,'profile'));
create policy football_club_website_update
on public.football_club_websites
for update to authenticated
using (public.can_manage_football_club_website_content(business_id,'profile'))
with check (public.can_manage_football_club_website_content(business_id,'profile'));
create policy football_club_website_delete
on public.football_club_websites
for delete to authenticated
using (public.can_manage_football_club_website_content(business_id,'profile'));

-- The public enquiry INSERT policy is preserved; inbox access has its own scope.
drop policy if exists football_club_website_enquiries_select on public.football_club_website_enquiries;
drop policy if exists football_club_website_enquiries_update on public.football_club_website_enquiries;
drop policy if exists football_club_website_enquiries_delete on public.football_club_website_enquiries;
create policy football_club_website_enquiries_select
on public.football_club_website_enquiries
for select to authenticated
using (public.can_manage_football_club_website_content(business_id,'enquiries'));
create policy football_club_website_enquiries_update
on public.football_club_website_enquiries
for update to authenticated
using (public.can_manage_football_club_website_content(business_id,'enquiries'))
with check (public.can_manage_football_club_website_content(business_id,'enquiries'));
create policy football_club_website_enquiries_delete
on public.football_club_website_enquiries
for delete to authenticated
using (public.can_manage_football_club_website_content(business_id,'enquiries'));

drop policy if exists football_club_change_requests_select on public.football_club_website_change_requests;
create policy football_club_change_requests_select
on public.football_club_website_change_requests
for select to authenticated
using (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (
    public.is_platform_developer()
    and public.can_manage_football_club_website_content(
      business_id,
      case target_table
        when 'football_club_websites' then 'profile'
        when 'football_club_website_pages' then 'pages'
        when 'football_club_website_news' then 'news'
        when 'football_club_website_squad' then 'squad'
        when 'football_club_website_staff' then 'staff'
        when 'football_club_website_fixtures' then 'fixtures'
        when 'football_club_website_standings' then 'standings'
        when 'football_club_website_transfers' then 'transfers'
        when 'football_club_website_gallery' then 'gallery'
        when 'football_club_website_sponsors' then 'sponsors'
        when 'football_club_website_events' then 'events'
        when 'football_club_website_honours' then 'honours'
        else null
      end
    )
  )
);

drop policy if exists football_club_activity_select on public.football_club_website_activity;
create policy football_club_activity_select
on public.football_club_website_activity
for select to authenticated
using (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (
    public.is_platform_developer()
    and public.can_manage_football_club_website_content(
      business_id,
      case target_table
        when 'football_club_websites' then 'profile'
        when 'football_club_website_delegations' then 'profile'
        when 'football_club_website_pages' then 'pages'
        when 'football_club_website_news' then 'news'
        when 'football_club_website_squad' then 'squad'
        when 'football_club_website_staff' then 'staff'
        when 'football_club_website_fixtures' then 'fixtures'
        when 'football_club_website_standings' then 'standings'
        when 'football_club_website_transfers' then 'transfers'
        when 'football_club_website_gallery' then 'gallery'
        when 'football_club_website_sponsors' then 'sponsors'
        when 'football_club_website_events' then 'events'
        when 'football_club_website_honours' then 'honours'
        else null
      end
    )
  )
);

-- Permission checks also apply when developer updates are submitted for approval.
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
  v_permission text;
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

  v_permission := case p_target_table
    when 'football_club_websites' then 'profile'
    when 'football_club_website_pages' then 'pages'
    when 'football_club_website_news' then 'news'
    when 'football_club_website_squad' then 'squad'
    when 'football_club_website_staff' then 'staff'
    when 'football_club_website_fixtures' then 'fixtures'
    when 'football_club_website_standings' then 'standings'
    when 'football_club_website_transfers' then 'transfers'
    when 'football_club_website_gallery' then 'gallery'
    when 'football_club_website_sponsors' then 'sponsors'
    when 'football_club_website_events' then 'events'
    when 'football_club_website_honours' then 'honours'
  end;
  if not public.can_manage_football_club_website_content(p_business_id,v_permission) then
    raise exception 'The club has not granted you permission for this content area.';
  end if;

  select * into v_website from public.football_club_websites where business_id=p_business_id;
  if not found then raise exception 'Club website does not exist.'; end if;
  select * into v_delegation from public.football_club_website_delegations
  where business_id=p_business_id and website_id=v_website.id and status='active';
  if not found then raise exception 'This club has not authorised active Koroma Leone Tech website management.'; end if;
  if v_delegation.approval_mode<>'approval_required' then
    raise exception 'This club uses direct publishing. Save the change directly instead.';
  end if;
  if p_target_table='football_club_websites' and p_operation<>'update' then
    raise exception 'The club website profile can only be updated, not inserted or deleted here.';
  end if;
  if p_operation='insert' and p_target_id is not null then
    raise exception 'A new content item must not include an existing record ID.';
  end if;
  if p_operation in ('update','delete') then
    if p_target_id is null then raise exception 'The record ID is required for updates and deletions.'; end if;
    execute format('select exists(select 1 from public.%I where id=$1 and business_id=$2)',p_target_table)
      into v_exists using p_target_id,p_business_id;
    if not v_exists then raise exception 'The target record does not exist in this club website.'; end if;
  end if;

  insert into public.football_club_website_change_requests(
    business_id,website_id,submitted_by,target_table,target_id,operation,proposed_content
  ) values (
    p_business_id,v_website.id,auth.uid(),p_target_table,p_target_id,p_operation,coalesce(p_content,'{}'::jsonb)
  ) returning id into v_request_id;

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

revoke all on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) from public,anon;
grant execute on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) to authenticated;

-- Tenant-folder uploads are constrained by the same content-area permissions.
drop policy if exists club_website_media_upload on storage.objects;
drop policy if exists club_website_media_update on storage.objects;
drop policy if exists club_website_media_delete on storage.objects;

create policy club_website_media_upload on storage.objects
for insert to authenticated
with check (
  bucket_id='club-website-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text=(storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website_content(
        b.id,
        case
          when (storage.foldername(storage.objects.name))[2] like 'brand-%' then 'profile'
          when (storage.foldername(storage.objects.name))[2] like 'squad-%' then 'squad'
          when (storage.foldername(storage.objects.name))[2] like 'staff-%' then 'staff'
          when (storage.foldername(storage.objects.name))[2] like 'news-%' then 'news'
          when (storage.foldername(storage.objects.name))[2] like 'gallery-%' then 'gallery'
          when (storage.foldername(storage.objects.name))[2] like 'sponsors-%' then 'sponsors'
          when (storage.foldername(storage.objects.name))[2] like 'events-%' then 'events'
          when (storage.foldername(storage.objects.name))[2] like 'honours-%' then 'honours'
          else null
        end
      )
  )
);
create policy club_website_media_update on storage.objects
for update to authenticated
using (
  bucket_id='club-website-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text=(storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website_content(
        b.id,
        case
          when (storage.foldername(storage.objects.name))[2] like 'brand-%' then 'profile'
          when (storage.foldername(storage.objects.name))[2] like 'squad-%' then 'squad'
          when (storage.foldername(storage.objects.name))[2] like 'staff-%' then 'staff'
          when (storage.foldername(storage.objects.name))[2] like 'news-%' then 'news'
          when (storage.foldername(storage.objects.name))[2] like 'gallery-%' then 'gallery'
          when (storage.foldername(storage.objects.name))[2] like 'sponsors-%' then 'sponsors'
          when (storage.foldername(storage.objects.name))[2] like 'events-%' then 'events'
          when (storage.foldername(storage.objects.name))[2] like 'honours-%' then 'honours'
          else null
        end
      )
  )
)
with check (
  bucket_id='club-website-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text=(storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website_content(
        b.id,
        case
          when (storage.foldername(storage.objects.name))[2] like 'brand-%' then 'profile'
          when (storage.foldername(storage.objects.name))[2] like 'squad-%' then 'squad'
          when (storage.foldername(storage.objects.name))[2] like 'staff-%' then 'staff'
          when (storage.foldername(storage.objects.name))[2] like 'news-%' then 'news'
          when (storage.foldername(storage.objects.name))[2] like 'gallery-%' then 'gallery'
          when (storage.foldername(storage.objects.name))[2] like 'sponsors-%' then 'sponsors'
          when (storage.foldername(storage.objects.name))[2] like 'events-%' then 'events'
          when (storage.foldername(storage.objects.name))[2] like 'honours-%' then 'honours'
          else null
        end
      )
  )
);
create policy club_website_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id='club-website-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text=(storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website_content(
        b.id,
        case
          when (storage.foldername(storage.objects.name))[2] like 'brand-%' then 'profile'
          when (storage.foldername(storage.objects.name))[2] like 'squad-%' then 'squad'
          when (storage.foldername(storage.objects.name))[2] like 'staff-%' then 'staff'
          when (storage.foldername(storage.objects.name))[2] like 'news-%' then 'news'
          when (storage.foldername(storage.objects.name))[2] like 'gallery-%' then 'gallery'
          when (storage.foldername(storage.objects.name))[2] like 'sponsors-%' then 'sponsors'
          when (storage.foldername(storage.objects.name))[2] like 'events-%' then 'events'
          when (storage.foldername(storage.objects.name))[2] like 'honours-%' then 'honours'
          else null
        end
      )
  )
);
