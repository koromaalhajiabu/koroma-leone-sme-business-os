-- White Lion School Management Enterprise Suite — expansion foundation
-- Adds curriculum choice, multi-campus, people, academic operations, finance,
-- learning, library, transport, notifications and audit foundations.
begin;

create table if not exists public.school_campuses (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, campus_code text, address text, phone text, email text,
 is_main boolean not null default false, is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,business_id), unique(business_id,campus_code)
);

create table if not exists public.school_memberships (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 school_role text not null check(school_role in ('proprietor','principal','vice_principal','registrar','bursar','teacher','librarian','transport_manager','parent','student','support')),
 campus_id uuid,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(business_id,user_id),
 foreign key(campus_id,business_id) references public.school_campuses(id,business_id) on delete set null
);

create table if not exists public.school_curriculum_settings (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null unique references public.businesses(id) on delete cascade,
 curriculum_code text not null default 'SLE' check(curriculum_code in ('SLE','CAMBRIDGE','IB','CUSTOM')),
 curriculum_name text not null default 'Sierra Leone National Curriculum',
 programme_code text,
 country_code text not null default 'SL',
 grading_configuration jsonb not null default '{"scale":"percentage","pass_mark":50}'::jsonb,
 assessment_configuration jsonb not null default '{}'::jsonb,
 academic_year_start_month integer not null default 9 check(academic_year_start_month between 1 and 12),
 timezone text not null default 'Africa/Freetown',
 settings jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

create table if not exists public.school_academic_years (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, starts_on date not null, ends_on date not null, is_current boolean not null default false,
 created_at timestamptz not null default now(), unique(id,business_id), unique(business_id,name), check(ends_on>starts_on)
);
create table if not exists public.school_terms (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 academic_year_id uuid not null, name text not null, starts_on date not null, ends_on date not null,
 created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(academic_year_id,business_id) references public.school_academic_years(id,business_id) on delete cascade,
 check(ends_on>starts_on)
);
create table if not exists public.school_curriculum_subjects (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 curriculum_code text not null, programme_code text, education_level text not null, subject_code text,
 subject_name text not null, is_core boolean not null default false, configuration jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), unique(id,business_id)
);

create table if not exists public.school_staff (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 staff_number text not null, first_name text not null, last_name text not null, email text, phone text,
 job_title text not null, staff_category text not null default 'teaching' check(staff_category in ('teaching','administrative','support')),
 qualifications jsonb not null default '[]'::jsonb, employment_status text not null default 'active',
 hired_on date, salary_amount numeric(18,2), salary_currency text not null default 'SLE',
 campus_id uuid, user_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 unique(id,business_id), unique(business_id,staff_number),
 foreign key(campus_id,business_id) references public.school_campuses(id,business_id) on delete set null
);
create table if not exists public.school_teacher_assignments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 staff_id uuid not null, class_id uuid not null, subject_id uuid not null, academic_year_id uuid,
 created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(staff_id,business_id) references public.school_staff(id,business_id) on delete cascade,
 foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete cascade,
 foreign key(subject_id,business_id) references public.school_subjects(id,business_id) on delete cascade,
 foreign key(academic_year_id,business_id) references public.school_academic_years(id,business_id) on delete set null
);
create table if not exists public.school_staff_attendance (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 staff_id uuid not null, attendance_date date not null default current_date,
 status text not null check(status in ('present','absent','late','leave','holiday')),
 check_in timestamptz, check_out timestamptz, note text, recorded_by uuid default auth.uid(),
 created_at timestamptz not null default now(), unique(id,business_id), unique(staff_id,attendance_date),
 foreign key(staff_id,business_id) references public.school_staff(id,business_id) on delete cascade
);
create table if not exists public.school_leave_requests (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 staff_id uuid not null, leave_type text not null, starts_on date not null, ends_on date not null,
 reason text, status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(),
 unique(id,business_id), foreign key(staff_id,business_id) references public.school_staff(id,business_id) on delete cascade,
 check(ends_on>=starts_on)
);

create table if not exists public.school_timetables (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 class_id uuid not null, subject_id uuid not null, staff_id uuid, day_of_week smallint not null check(day_of_week between 1 and 7),
 starts_at time not null, ends_at time not null, room text, term_id uuid, created_at timestamptz not null default now(),
 unique(id,business_id), foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete cascade,
 foreign key(subject_id,business_id) references public.school_subjects(id,business_id) on delete cascade,
 foreign key(staff_id,business_id) references public.school_staff(id,business_id) on delete set null,
 foreign key(term_id,business_id) references public.school_terms(id,business_id) on delete set null, check(ends_at>starts_at)
);
create table if not exists public.school_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 title text not null, event_type text not null default 'school', starts_at timestamptz not null, ends_at timestamptz,
 venue text, description text, created_at timestamptz not null default now(), unique(id,business_id)
);

create table if not exists public.school_scholarships (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 student_id uuid not null, name text not null, award_type text not null default 'fixed',
 amount numeric(18,2) not null default 0, percentage numeric(5,2), starts_on date, ends_on date,
 is_active boolean not null default true, created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade
);
create table if not exists public.school_fee_adjustments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null, adjustment_type text not null check(adjustment_type in ('discount','waiver','penalty','credit')),
 amount numeric(18,2) not null check(amount>0), reason text, approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(invoice_id,business_id) references public.school_fee_invoices(id,business_id) on delete cascade
);
create table if not exists public.school_payroll_runs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 period_start date not null, period_end date not null, status text not null default 'draft' check(status in ('draft','approved','paid','cancelled')),
 currency text not null default 'SLE', total_gross numeric(18,2) not null default 0, total_deductions numeric(18,2) not null default 0,
 approved_by uuid references auth.users(id), paid_at timestamptz, created_at timestamptz not null default now(),
 unique(id,business_id), check(period_end>=period_start)
);
create table if not exists public.school_payroll_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 payroll_run_id uuid not null, staff_id uuid not null, gross_pay numeric(18,2) not null default 0,
 deductions numeric(18,2) not null default 0, net_pay numeric(18,2) not null default 0,
 payment_reference text, created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(payroll_run_id,business_id) references public.school_payroll_runs(id,business_id) on delete cascade,
 foreign key(staff_id,business_id) references public.school_staff(id,business_id) on delete restrict
);

create table if not exists public.school_library_books (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 isbn text, title text not null, author text, publisher text, category text, copies_total integer not null default 1 check(copies_total>=0),
 copies_available integer not null default 1 check(copies_available>=0), created_at timestamptz not null default now(), unique(id,business_id),
 check(copies_available<=copies_total)
);
create table if not exists public.school_library_loans (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 book_id uuid not null, student_id uuid not null, issued_on date not null default current_date, due_on date not null,
 returned_on date, status text not null default 'issued' check(status in ('issued','returned','overdue','lost')),
 created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(book_id,business_id) references public.school_library_books(id,business_id) on delete restrict,
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade
);
create table if not exists public.school_transport_routes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 route_name text not null, vehicle_registration text, driver_name text, driver_phone text, pickup_points jsonb not null default '[]'::jsonb,
 is_active boolean not null default true, created_at timestamptz not null default now(), unique(id,business_id)
);
create table if not exists public.school_transport_students (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 route_id uuid not null, student_id uuid not null, pickup_point text, created_at timestamptz not null default now(),
 unique(id,business_id), unique(route_id,student_id),
 foreign key(route_id,business_id) references public.school_transport_routes(id,business_id) on delete cascade,
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade
);

create table if not exists public.school_learning_resources (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 title text not null, description text, subject_id uuid, class_id uuid, resource_type text not null default 'document',
 storage_path text, external_url text, published boolean not null default false, created_by uuid default auth.uid(),
 created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(subject_id,business_id) references public.school_subjects(id,business_id) on delete set null,
 foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete set null
);
create table if not exists public.school_assignments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 title text not null, instructions text, class_id uuid not null, subject_id uuid not null, due_at timestamptz,
 max_score numeric(8,2) not null default 100, published boolean not null default false, created_by uuid default auth.uid(),
 created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete cascade,
 foreign key(subject_id,business_id) references public.school_subjects(id,business_id) on delete cascade
);
create table if not exists public.school_assignment_submissions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 assignment_id uuid not null, student_id uuid not null, submitted_at timestamptz not null default now(),
 submission_text text, storage_path text, score numeric(8,2), feedback text, graded_by uuid references auth.users(id),
 created_at timestamptz not null default now(), unique(id,business_id), unique(assignment_id,student_id),
 foreign key(assignment_id,business_id) references public.school_assignments(id,business_id) on delete cascade,
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade
);
create table if not exists public.school_notifications (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 recipient_user_id uuid references auth.users(id) on delete cascade, recipient_role text, title text not null,
 message text not null, channel text not null default 'in_app', read_at timestamptz, sent_at timestamptz,
 created_at timestamptz not null default now(), unique(id,business_id)
);
create table if not exists public.school_documents (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 student_id uuid, staff_id uuid, document_type text not null, file_name text not null, storage_path text not null,
 uploaded_by uuid default auth.uid(), created_at timestamptz not null default now(), unique(id,business_id),
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade,
 foreign key(staff_id,business_id) references public.school_staff(id,business_id) on delete cascade,
 check(student_id is not null or staff_id is not null)
);
create table if not exists public.school_audit_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid default auth.uid(), action text not null, entity_type text not null, entity_id uuid,
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now(), unique(id,business_id)
);

create index if not exists school_staff_business_idx on public.school_staff(business_id,employment_status);
create index if not exists school_timetable_class_day_idx on public.school_timetables(business_id,class_id,day_of_week,starts_at);
create index if not exists school_assignments_class_due_idx on public.school_assignments(business_id,class_id,due_at);
create index if not exists school_notifications_recipient_idx on public.school_notifications(business_id,recipient_user_id,created_at desc);
create index if not exists school_library_loans_student_idx on public.school_library_loans(business_id,student_id,status);
create index if not exists school_academic_year_current_idx on public.school_academic_years(business_id,is_current);

do $$
declare t text;
begin
 foreach t in array array[
 'school_campuses','school_memberships','school_curriculum_settings','school_academic_years','school_terms','school_curriculum_subjects',
 'school_staff','school_teacher_assignments','school_staff_attendance','school_leave_requests','school_timetables','school_events',
 'school_scholarships','school_fee_adjustments','school_payroll_runs','school_payroll_items','school_library_books','school_library_loans',
 'school_transport_routes','school_transport_students','school_learning_resources','school_assignments','school_assignment_submissions',
 'school_notifications','school_documents','school_audit_events'
 ] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists school_member_read on public.%I',t);
  execute format('create policy school_member_read on public.%I for select to authenticated using (public.is_business_member(business_id))',t);
  execute format('drop policy if exists school_manager_write on public.%I',t);
  execute format('create policy school_manager_write on public.%I for all to authenticated using (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']::public.business_role[])) with check (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']::public.business_role[]))',t);
 end loop;
end $$;

grant select,insert,update,delete on public.school_campuses,public.school_memberships,public.school_curriculum_settings,public.school_academic_years,public.school_terms,public.school_curriculum_subjects,public.school_staff,public.school_teacher_assignments,public.school_staff_attendance,public.school_leave_requests,public.school_timetables,public.school_events,public.school_scholarships,public.school_fee_adjustments,public.school_payroll_runs,public.school_payroll_items,public.school_library_books,public.school_library_loans,public.school_transport_routes,public.school_transport_students,public.school_learning_resources,public.school_assignments,public.school_assignment_submissions,public.school_notifications,public.school_documents,public.school_audit_events to authenticated;

commit;
