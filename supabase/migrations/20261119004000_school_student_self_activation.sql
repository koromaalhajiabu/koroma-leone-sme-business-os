-- Automatic student self-activation using one-time codes stored separately from student records.
-- Codes are visible only to authorised school administrators, not parent/guardian or student queries.
begin;

create table if not exists public.school_student_portal_activation_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_id uuid not null references public.school_students(id) on delete cascade,
  activation_code text not null unique,
  created_at timestamptz not null default now(),
  unique(student_id)
);

alter table public.school_student_portal_activation_codes enable row level security;

drop policy if exists school_student_activation_codes_admin_read on public.school_student_portal_activation_codes;
create policy school_student_activation_codes_admin_read
on public.school_student_portal_activation_codes
for select to authenticated
using (
  exists (
    select 1 from public.business_members bm
    where bm.business_id = school_student_portal_activation_codes.business_id
      and bm.user_id = auth.uid()
      and coalesce(bm.is_active,true) = true
      and lower(bm.role) in ('owner','admin','manager')
  )
);

revoke all on public.school_student_portal_activation_codes from anon, authenticated;
grant select on public.school_student_portal_activation_codes to authenticated;

create or replace function public.school_issue_student_portal_activation_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.user_id is null then
    insert into public.school_student_portal_activation_codes
      (business_id, student_id, activation_code)
    values
      (new.business_id, new.id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
    on conflict (student_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists school_students_issue_portal_activation_code on public.school_students;
create trigger school_students_issue_portal_activation_code
after insert or update of status on public.school_students
for each row execute function public.school_issue_student_portal_activation_code();

-- Backfill current active students who have not yet activated.
insert into public.school_student_portal_activation_codes (business_id,student_id,activation_code)
select s.business_id,s.id,upper(substr(replace(gen_random_uuid()::text, '-', ''),1,12))
from public.school_students s
where s.status='active' and s.user_id is null
on conflict (student_id) do nothing;

commit;
