-- White Lion SME Business OS: School Management module foundation
-- Tenant-scoped education records. Apply in Supabase SQL Editor after reviewing.
begin;

insert into public.business_industry_modules (business_id,module_key,is_enabled)
select id,'school',false from public.businesses
on conflict (business_id,module_key) do nothing;

create table if not exists public.school_classes (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null,
 academic_year text not null,
 class_teacher_name text,
 capacity integer check (capacity is null or capacity > 0),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,business_id),
 unique(business_id,name,academic_year)
);

create table if not exists public.school_students (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 admission_number text not null,
 first_name text not null,
 last_name text not null,
 date_of_birth date,
 gender text check (gender is null or gender in ('female','male','other','prefer_not_to_say')),
 class_id uuid,
 guardian_name text,
 guardian_phone text,
 guardian_email text,
 address text,
 admission_date date not null default current_date,
 status text not null default 'active' check(status in ('active','inactive','graduated','transferred')),
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,business_id),
 unique(business_id,admission_number),
 foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete set null
);

create table if not exists public.school_subjects (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 class_id uuid not null,
 name text not null,
 subject_code text,
 teacher_name text,
 created_at timestamptz not null default now(),
 unique(id,business_id),
 unique(business_id,class_id,name),
 foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete cascade
);

create table if not exists public.school_attendance (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 student_id uuid not null,
 attendance_date date not null default current_date,
 status text not null check(status in ('present','absent','late','excused')),
 note text,
 recorded_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(student_id,attendance_date),
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade
);

create table if not exists public.school_fee_invoices (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 student_id uuid not null,
 invoice_number text not null,
 description text not null,
 academic_term text,
 amount numeric(18,2) not null check(amount > 0),
 due_date date,
 status text not null default 'unpaid' check(status in ('unpaid','part_paid','paid','waived','cancelled')),
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,business_id),
 unique(business_id,invoice_number),
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete restrict
);

create table if not exists public.school_fee_payments (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null,
 receipt_number text not null,
 amount numeric(18,2) not null check(amount > 0),
 payment_method text not null default 'cash',
 paid_at timestamptz not null default now(),
 received_by uuid default auth.uid() references auth.users(id),
 note text,
 unique(business_id,receipt_number),
 foreign key(invoice_id,business_id) references public.school_fee_invoices(id,business_id) on delete restrict
);

create table if not exists public.school_exams (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 class_id uuid not null,
 title text not null,
 academic_term text,
 exam_date date,
 max_score numeric(8,2) not null default 100 check(max_score > 0),
 created_at timestamptz not null default now(),
 unique(id,business_id),
 foreign key(class_id,business_id) references public.school_classes(id,business_id) on delete cascade
);

create table if not exists public.school_exam_results (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 exam_id uuid not null,
 student_id uuid not null,
 score numeric(8,2) not null check(score >= 0),
 remarks text,
 entered_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(exam_id,student_id),
 foreign key(exam_id,business_id) references public.school_exams(id,business_id) on delete cascade,
 foreign key(student_id,business_id) references public.school_students(id,business_id) on delete cascade
);

create index if not exists school_students_business_class_idx on public.school_students(business_id,class_id,status);
create index if not exists school_attendance_business_date_idx on public.school_attendance(business_id,attendance_date desc);
create index if not exists school_fee_invoices_business_student_idx on public.school_fee_invoices(business_id,student_id,created_at desc);
create index if not exists school_exam_results_business_exam_idx on public.school_exam_results(business_id,exam_id);

do $$
declare t text;
begin
 foreach t in array array['school_classes','school_students','school_subjects','school_attendance','school_fee_invoices','school_fee_payments','school_exams','school_exam_results'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists school_member_read on public.%I',t);
  execute format('create policy school_member_read on public.%I for select to authenticated using (public.is_business_member(business_id))',t);
  execute format('drop policy if exists school_manager_write on public.%I',t);
  execute format('create policy school_manager_write on public.%I for all to authenticated using (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']::public.business_role[])) with check (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']::public.business_role[]))',t);
 end loop;
end $$;

grant select,insert,update,delete on public.school_classes,public.school_students,public.school_subjects,public.school_attendance,public.school_fee_invoices,public.school_fee_payments,public.school_exams,public.school_exam_results to authenticated;

commit;
