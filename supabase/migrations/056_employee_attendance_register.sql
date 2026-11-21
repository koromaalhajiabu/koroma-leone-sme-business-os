create table if not exists public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null,
  branch_id uuid,
  attendance_date date not null,
  status text not null default 'present' check (status in ('present','late','absent','on_leave')),
  clock_in timestamptz,
  clock_out timestamptz,
  notes text,
  recorded_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_attendance_employee_business_fkey foreign key(employee_id,business_id) references public.employees(id,business_id) on delete restrict,
  constraint employee_attendance_branch_business_fkey foreign key(branch_id,business_id) references public.branches(id,business_id),
  constraint employee_attendance_clock_range check (clock_out is null or clock_in is null or clock_out >= clock_in),
  constraint employee_attendance_employee_day_key unique(business_id,employee_id,attendance_date)
);
alter table public.employee_attendance enable row level security;
grant select,insert,update,delete on public.employee_attendance to authenticated;
drop policy if exists employee_attendance_manage on public.employee_attendance;
create policy employee_attendance_manage on public.employee_attendance
for all to authenticated
using (has_business_role(business_id, array['owner'::business_role,'admin'::business_role,'manager'::business_role]))
with check (has_business_role(business_id, array['owner'::business_role,'admin'::business_role,'manager'::business_role]));
drop policy if exists employee_attendance_accountant_read on public.employee_attendance;
create policy employee_attendance_accountant_read on public.employee_attendance
for select to authenticated
using (has_business_role(business_id, array['owner'::business_role,'admin'::business_role,'manager'::business_role,'accountant'::business_role]));
create index if not exists employee_attendance_business_date_idx on public.employee_attendance(business_id,attendance_date desc);
