-- Move internal travel case notes out of applicant-visible case records.
create table if not exists public.travel_agency_private_case_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  applicant_id uuid references public.travel_agency_applicants(id) on delete cascade,
  application_id uuid references public.travel_agency_applications(id) on delete cascade,
  deadline_id uuid references public.travel_agency_deadlines(id) on delete cascade,
  note text not null check (length(trim(note)) between 1 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_agency_private_case_notes_one_target
    check (num_nonnulls(applicant_id, application_id, deadline_id) = 1)
);
create index if not exists travel_agency_private_notes_applicant_idx
  on public.travel_agency_private_case_notes(business_id, applicant_id, created_at desc)
  where applicant_id is not null;
create index if not exists travel_agency_private_notes_application_idx
  on public.travel_agency_private_case_notes(business_id, application_id, created_at desc)
  where application_id is not null;
create index if not exists travel_agency_private_notes_deadline_idx
  on public.travel_agency_private_case_notes(business_id, deadline_id, created_at desc)
  where deadline_id is not null;
alter table public.travel_agency_private_case_notes enable row level security;
grant select, insert, update, delete on public.travel_agency_private_case_notes to authenticated;

drop policy if exists travel_agency_private_notes_staff_read on public.travel_agency_private_case_notes;
create policy travel_agency_private_notes_staff_read
  on public.travel_agency_private_case_notes for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists travel_agency_private_notes_manager_write on public.travel_agency_private_case_notes;
create policy travel_agency_private_notes_manager_write
  on public.travel_agency_private_case_notes for all to authenticated
  using (public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]))
  with check (public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]));

insert into public.travel_agency_private_case_notes(business_id,applicant_id,note,created_at)
select business_id,id,notes,created_at from public.travel_agency_applicants
where nullif(btrim(notes),'') is not null;
insert into public.travel_agency_private_case_notes(business_id,application_id,note,created_at)
select business_id,id,notes,created_at from public.travel_agency_applications
where nullif(btrim(notes),'') is not null;
insert into public.travel_agency_private_case_notes(business_id,deadline_id,note,created_at)
select business_id,id,notes,created_at from public.travel_agency_deadlines
where nullif(btrim(notes),'') is not null;

alter table public.travel_agency_applicants drop column if exists notes;
alter table public.travel_agency_applications drop column if exists notes;
alter table public.travel_agency_deadlines drop column if exists notes;
