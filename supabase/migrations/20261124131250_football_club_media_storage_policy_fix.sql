-- Fix storage object path checks for football club website media.
-- Platform developers and the club workspace owner/admin/manager can upload,
-- replace and delete media only inside that club's business-ID folder.

drop policy if exists club_website_media_upload on storage.objects;
drop policy if exists club_website_media_update on storage.objects;
drop policy if exists club_website_media_delete on storage.objects;

create policy club_website_media_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'club-website-media'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website(b.id)
  )
);

create policy club_website_media_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'club-website-media'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website(b.id)
  )
)
with check (
  bucket_id = 'club-website-media'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website(b.id)
  )
);

create policy club_website_media_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'club-website-media'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_manage_football_club_website(b.id)
  )
);
