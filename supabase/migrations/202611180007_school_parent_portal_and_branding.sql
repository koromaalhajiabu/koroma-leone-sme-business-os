-- White Lion School Management: secure parent portal and per-school branding
-- Additive migration. Preserves existing school, student and guardian records.

begin;

create table if not exists public.school_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  school_name text not null,
  crest_path text,
  crest_url text,
  portal_code uuid not null default gen_random_uuid() unique,
  portal_enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_profiles enable row level security;

drop policy if exists school_profiles_management on public.school_profiles;
create policy school_profiles_management
on public.school_profiles for all to authenticated
using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

grant select, insert, update, delete on public.school_profiles to authenticated;

-- Expose only the requested school's public name and crest, never a directory of tenant IDs.
create or replace function public.school_get_public_portal_profile(p_portal_code uuid)
returns table (business_id uuid, school_name text, crest_url text, portal_enabled boolean)
language sql
stable
security definer
set search_path = public
as $
  select sp.business_id, sp.school_name, sp.crest_url, sp.portal_enabled
  from public.school_profiles sp
  where sp.portal_code = p_portal_code
    and sp.portal_enabled = true
  limit 1;
$;
revoke all on function public.school_get_public_portal_profile(uuid) from public;
grant execute on function public.school_get_public_portal_profile(uuid) to anon, authenticated;

-- Allow linked guardians to read only their children's core records.
-- Student profile data is returned through a narrowly scoped RPC so guardians
-- cannot query private student columns such as internal notes or contact details.
drop policy if exists school_students_guardian_read on public.school_students;
drop policy if exists school_classes_guardian_read on public.school_classes;

create or replace function public.school_get_linked_students(p_business_id uuid)
returns table (
  id uuid,
  admission_number text,
  first_name text,
  last_name text,
  status text,
  class_name text,
  relationship text,
  can_view_attendance boolean,
  can_view_results boolean,
  can_view_fees boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select st.id, st.admission_number, st.first_name, st.last_name, st.status,
         cl.name, gl.relationship, gl.can_view_attendance, gl.can_view_results, gl.can_view_fees
  from public.school_guardian_links gl
  join public.school_students st
    on st.id = gl.student_id and st.business_id = gl.business_id
  left join public.school_classes cl
    on cl.id = st.class_id and cl.business_id = st.business_id
  where gl.business_id = p_business_id
    and gl.guardian_user_id = auth.uid()
    and gl.is_active = true;
$$;
revoke all on function public.school_get_linked_students(uuid) from public;
grant execute on function public.school_get_linked_students(uuid) to authenticated;

drop policy if exists school_attendance_guardian_read on public.school_attendance;
create policy school_attendance_guardian_read
on public.school_attendance for select to authenticated
using (
  exists (
    select 1 from public.school_guardian_links gl
    where gl.business_id = school_attendance.business_id
      and gl.student_id = school_attendance.student_id
      and gl.guardian_user_id = auth.uid()
      and gl.is_active = true
      and gl.can_view_attendance = true
  )
);

drop policy if exists school_fee_invoices_guardian_read on public.school_fee_invoices;
create policy school_fee_invoices_guardian_read
on public.school_fee_invoices for select to authenticated
using (
  exists (
    select 1 from public.school_guardian_links gl
    where gl.business_id = school_fee_invoices.business_id
      and gl.student_id = school_fee_invoices.student_id
      and gl.guardian_user_id = auth.uid()
      and gl.is_active = true
      and gl.can_view_fees = true
  )
);

drop policy if exists school_fee_payments_guardian_read on public.school_fee_payments;
create policy school_fee_payments_guardian_read
on public.school_fee_payments for select to authenticated
using (
  exists (
    select 1
    from public.school_fee_invoices inv
    join public.school_guardian_links gl
      on gl.business_id = inv.business_id and gl.student_id = inv.student_id
    where inv.id = school_fee_payments.invoice_id
      and inv.business_id = school_fee_payments.business_id
      and gl.guardian_user_id = auth.uid()
      and gl.is_active = true
      and gl.can_view_fees = true
  )
);

drop policy if exists school_exam_results_guardian_read on public.school_exam_results;
create policy school_exam_results_guardian_read
on public.school_exam_results for select to authenticated
using (
  exists (
    select 1 from public.school_guardian_links gl
    where gl.business_id = school_exam_results.business_id
      and gl.student_id = school_exam_results.student_id
      and gl.guardian_user_id = auth.uid()
      and gl.is_active = true
      and gl.can_view_results = true
  )
);

drop policy if exists school_exams_guardian_read on public.school_exams;
create policy school_exams_guardian_read
on public.school_exams for select to authenticated
using (
  exists (
    select 1
    from public.school_exam_results er
    join public.school_guardian_links gl
      on gl.business_id = er.business_id and gl.student_id = er.student_id
    where er.business_id = school_exams.business_id
      and er.exam_id = school_exams.id
      and gl.guardian_user_id = auth.uid()
      and gl.is_active = true
      and gl.can_view_results = true
  )
);

-- School crests are public brand assets; uploads and changes remain management-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-branding','school-branding',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update
set public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists school_branding_public_read on storage.objects;
create policy school_branding_public_read
on storage.objects for select to public
using (bucket_id = 'school-branding');

drop policy if exists school_branding_management_insert on storage.objects;
create policy school_branding_management_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'school-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text = split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists school_branding_management_update on storage.objects;
create policy school_branding_management_update
on storage.objects for update to authenticated
using (
  bucket_id = 'school-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text = split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
)
with check (
  bucket_id = 'school-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text = split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

drop policy if exists school_branding_management_delete on storage.objects;
create policy school_branding_management_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'school-branding'
  and exists (
    select 1 from public.businesses b
    where b.id::text = split_part(name,'/',1)
      and public.has_business_role(b.id,array['owner','admin','manager']::public.business_role[])
  )
);

commit;
