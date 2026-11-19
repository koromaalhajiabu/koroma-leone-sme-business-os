-- Private student and staff identification photos
begin;

alter table public.school_students
  add column if not exists photo_path text;
alter table public.school_staff
  add column if not exists photo_path text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('school-people-photos','school-people-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=false,file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists school_people_photos_member_read on storage.objects;
create policy school_people_photos_member_read
on storage.objects for select to authenticated
using (
  bucket_id='school-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.is_business_member(b.id)
  )
);

drop policy if exists school_people_photos_management_insert on storage.objects;
create policy school_people_photos_management_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='school-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists school_people_photos_management_update on storage.objects;
create policy school_people_photos_management_update
on storage.objects for update to authenticated
using (
  bucket_id='school-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
)
with check (
  bucket_id='school-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists school_people_photos_management_delete on storage.objects;
create policy school_people_photos_management_delete
on storage.objects for delete to authenticated
using (
  bucket_id='school-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

commit;
