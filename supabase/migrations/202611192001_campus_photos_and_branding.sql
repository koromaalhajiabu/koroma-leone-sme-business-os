-- Campus module: admission/staff identification photos and institution crest/logo branding
begin;

alter table public.campus_students
  add column if not exists photo_path text;
alter table public.campus_staff
  add column if not exists photo_path text;
alter table public.campus_applications
  add column if not exists photo_path text;

create table if not exists public.campus_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  institution_name text not null,
  crest_path text,
  crest_url text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campus_profiles enable row level security;

drop policy if exists campus_profiles_member_read on public.campus_profiles;
create policy campus_profiles_member_read
on public.campus_profiles for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists campus_profiles_management_write on public.campus_profiles;
create policy campus_profiles_management_write
on public.campus_profiles for all to authenticated
using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

grant select, insert, update, delete on public.campus_profiles to authenticated;

-- Private identification photos for students, staff/lecturers and applicants.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('campus-people-photos','campus-people-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=false,file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists campus_people_photos_member_read on storage.objects;
create policy campus_people_photos_member_read
on storage.objects for select to authenticated
using (
  bucket_id='campus-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.is_business_member(b.id)
  )
);

drop policy if exists campus_people_photos_management_insert on storage.objects;
create policy campus_people_photos_management_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='campus-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists campus_people_photos_management_update on storage.objects;
create policy campus_people_photos_management_update
on storage.objects for update to authenticated
using (
  bucket_id='campus-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
)
with check (
  bucket_id='campus-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists campus_people_photos_management_delete on storage.objects;
create policy campus_people_photos_management_delete
on storage.objects for delete to authenticated
using (
  bucket_id='campus-people-photos'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

-- Institution crest/logo is a public brand asset; uploads and changes remain management-only.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('campus-branding','campus-branding',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update
set public=true,file_size_limit=2097152,
    allowed_mime_types=array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists campus_branding_public_read on storage.objects;
create policy campus_branding_public_read
on storage.objects for select to public
using (bucket_id='campus-branding');

drop policy if exists campus_branding_management_insert on storage.objects;
create policy campus_branding_management_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='campus-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists campus_branding_management_update on storage.objects;
create policy campus_branding_management_update
on storage.objects for update to authenticated
using (
  bucket_id='campus-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
)
with check (
  bucket_id='campus-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists campus_branding_management_delete on storage.objects;
create policy campus_branding_management_delete
on storage.objects for delete to authenticated
using (
  bucket_id='campus-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text=split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

commit;
