-- A club's approval-required mode must block direct developer writes.
create or replace function public.can_manage_football_club_website_content_direct(
  p_business_id uuid,
  p_permission text
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.has_business_role(p_business_id,array['owner','admin','manager']::public.business_role[])
    or (
      public.is_platform_developer()
      and p_permission = any(array[
        'profile','pages','news','squad','staff','fixtures','standings',
        'transfers','gallery','sponsors','events','honours','enquiries'
      ]::text[])
      and exists (
        select 1
        from public.football_club_website_delegations d
        where d.business_id=p_business_id
          and d.status='active'
          and d.approval_mode='direct'
          and coalesce(d.permissions -> p_permission,'true'::jsonb)='true'::jsonb
      )
    )
  );
$function$;

revoke all on function public.can_manage_football_club_website_content_direct(uuid,text) from public,anon;
grant execute on function public.can_manage_football_club_website_content_direct(uuid,text) to authenticated;

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
    execute format('drop policy if exists %I on public.%I',r.table_name||'_insert',r.table_name);
    execute format('drop policy if exists %I on public.%I',r.table_name||'_update',r.table_name);
    execute format('drop policy if exists %I on public.%I',r.table_name||'_delete',r.table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_football_club_website_content_direct(business_id,%L))',
      r.table_name||'_insert',r.table_name,r.permission_key
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_football_club_website_content_direct(business_id,%L)) with check (public.can_manage_football_club_website_content_direct(business_id,%L))',
      r.table_name||'_update',r.table_name,r.permission_key,r.permission_key
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_football_club_website_content_direct(business_id,%L))',
      r.table_name||'_delete',r.table_name,r.permission_key
    );
  end loop;
end;
$policies$;

drop policy if exists football_club_website_insert on public.football_club_websites;
drop policy if exists football_club_website_update on public.football_club_websites;
drop policy if exists football_club_website_delete on public.football_club_websites;
create policy football_club_website_insert
on public.football_club_websites
for insert to authenticated
with check (public.can_manage_football_club_website_content_direct(business_id,'profile'));
create policy football_club_website_update
on public.football_club_websites
for update to authenticated
using (public.can_manage_football_club_website_content_direct(business_id,'profile'))
with check (public.can_manage_football_club_website_content_direct(business_id,'profile'));
create policy football_club_website_delete
on public.football_club_websites
for delete to authenticated
using (public.can_manage_football_club_website_content_direct(business_id,'profile'));

-- The club enquiry inbox remains available to a delegated manager when that
-- separate enquiries permission is enabled, regardless of public-content mode.
drop policy if exists football_club_website_enquiries_update on public.football_club_website_enquiries;
drop policy if exists football_club_website_enquiries_delete on public.football_club_website_enquiries;
create policy football_club_website_enquiries_update
on public.football_club_website_enquiries
for update to authenticated
using (public.can_manage_football_club_website_content(business_id,'enquiries'))
with check (public.can_manage_football_club_website_content(business_id,'enquiries'));
create policy football_club_website_enquiries_delete
on public.football_club_website_enquiries
for delete to authenticated
using (public.can_manage_football_club_website_content(business_id,'enquiries'));
