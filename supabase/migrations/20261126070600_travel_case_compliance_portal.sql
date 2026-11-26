-- Travel & Migration Desk: secure documents, applicant linkage, case history and reminders.
alter table public.travel_agency_applicants
 add column if not exists portal_user_id uuid references auth.users(id) on delete set null,
 add column if not exists case_reference text,
 add column if not exists consent_recorded_at timestamptz,
 add column if not exists privacy_notice_version text;
alter table public.travel_agency_applications
 add column if not exists next_action text,
 add column if not exists next_action_due_at timestamptz,
 add column if not exists interview_at timestamptz,
 add column if not exists visa_appointment_at timestamptz,
 add column if not exists deadline_at timestamptz;
alter table public.travel_agency_documents
 add column if not exists storage_path text,
 add column if not exists original_file_name text,
 add column if not exists mime_type text,
 add column if not exists file_size_bytes bigint,
 add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
 add column if not exists applicant_visible boolean not null default false;
alter table public.travel_agency_partner_agencies
 add column if not exists licence_expiry_date date,
 add column if not exists verification_checked_at timestamptz,
 add column if not exists verification_source text,
 add column if not exists verification_evidence_note text;
create table if not exists public.travel_agency_case_history (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 applicant_id uuid not null references public.travel_agency_applicants(id) on delete cascade,
 application_id uuid references public.travel_agency_applications(id) on delete set null,
 event_type text not null, event_summary text not null, old_value text, new_value text,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.travel_agency_deadlines (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 applicant_id uuid not null references public.travel_agency_applicants(id) on delete cascade,
 application_id uuid references public.travel_agency_applications(id) on delete cascade,
 title text not null, due_at timestamptz not null, reminder_at timestamptz,
 status text not null default 'open' check(status in ('open','completed','cancelled')),
 notes text, assigned_to uuid references auth.users(id) on delete set null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists travel_agency_applicants_portal_user_idx on public.travel_agency_applicants(portal_user_id) where portal_user_id is not null;
create index if not exists travel_agency_deadlines_due_idx on public.travel_agency_deadlines(business_id,due_at) where status='open';
create index if not exists travel_agency_case_history_applicant_idx on public.travel_agency_case_history(business_id,applicant_id,created_at desc);
alter table public.travel_agency_case_history enable row level security;
alter table public.travel_agency_deadlines enable row level security;
drop policy if exists travel_agency_history_member_read on public.travel_agency_case_history;
create policy travel_agency_history_member_read on public.travel_agency_case_history for select to authenticated using(public.is_business_member(business_id));
drop policy if exists travel_agency_history_manager_write on public.travel_agency_case_history;
create policy travel_agency_history_manager_write on public.travel_agency_case_history for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));
drop policy if exists travel_agency_deadline_member_read on public.travel_agency_deadlines;
create policy travel_agency_deadline_member_read on public.travel_agency_deadlines for select to authenticated using(public.is_business_member(business_id));
drop policy if exists travel_agency_deadline_manager_write on public.travel_agency_deadlines;
create policy travel_agency_deadline_manager_write on public.travel_agency_deadlines for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])) with check(public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));
drop policy if exists travel_agency_applicant_self_read on public.travel_agency_applicants;
create policy travel_agency_applicant_self_read on public.travel_agency_applicants for select to authenticated using(portal_user_id=(select auth.uid()));
drop policy if exists travel_agency_documents_applicant_read on public.travel_agency_documents;
create policy travel_agency_documents_applicant_read on public.travel_agency_documents for select to authenticated using(applicant_visible=true and exists(select 1 from public.travel_agency_applicants a where a.id=applicant_id and a.business_id=travel_agency_documents.business_id and a.portal_user_id=(select auth.uid())));
drop policy if exists travel_agency_applications_applicant_read on public.travel_agency_applications;
create policy travel_agency_applications_applicant_read on public.travel_agency_applications for select to authenticated using(exists(select 1 from public.travel_agency_applicants a where a.id=applicant_id and a.business_id=travel_agency_applications.business_id and a.portal_user_id=(select auth.uid())));
drop policy if exists travel_agency_deadlines_applicant_read on public.travel_agency_deadlines;
create policy travel_agency_deadlines_applicant_read on public.travel_agency_deadlines for select to authenticated using(exists(select 1 from public.travel_agency_applicants a where a.id=applicant_id and a.business_id=travel_agency_deadlines.business_id and a.portal_user_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('travel-agency-private','travel-agency-private',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists travel_agency_storage_member_read on storage.objects;
create policy travel_agency_storage_member_read on storage.objects for select to authenticated using(bucket_id='travel-agency-private' and (public.is_business_member(((storage.foldername(name))[1])::uuid) or exists(select 1 from public.travel_agency_applicants a where a.id=((storage.foldername(name))[2])::uuid and a.business_id=((storage.foldername(name))[1])::uuid and a.portal_user_id=(select auth.uid()))));
drop policy if exists travel_agency_storage_manager_insert on storage.objects;
create policy travel_agency_storage_manager_insert on storage.objects for insert to authenticated with check(bucket_id='travel-agency-private' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']::public.business_role[]));
drop policy if exists travel_agency_storage_manager_update on storage.objects;
create policy travel_agency_storage_manager_update on storage.objects for update to authenticated using(bucket_id='travel-agency-private' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']::public.business_role[])) with check(bucket_id='travel-agency-private' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']::public.business_role[]));
drop policy if exists travel_agency_storage_manager_delete on storage.objects;
create policy travel_agency_storage_manager_delete on storage.objects for delete to authenticated using(bucket_id='travel-agency-private' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']::public.business_role[]));
grant select,insert,update,delete on public.travel_agency_case_history,public.travel_agency_deadlines,public.travel_agency_documents to authenticated;
