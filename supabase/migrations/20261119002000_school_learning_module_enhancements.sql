-- White Lion School Management: additive enhancements for the five existing modules.
-- Does not recreate or replace existing timetable, assignment, admission or library tables.
begin;

-- 1. Timetable: enforce class/teacher/room clash prevention in the database,
-- including concurrent edits and records entered outside the web interface.
create or replace function public.school_prevent_timetable_conflicts()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.ends_at <= new.starts_at then
    raise exception 'A lesson must end after it starts.';
  end if;

  if exists (
    select 1
    from public.school_timetables t
    where t.business_id = new.business_id
      and t.id is distinct from new.id
      and t.day_of_week = new.day_of_week
      and coalesce(t.term_id::text, '') = coalesce(new.term_id::text, '')
      and t.starts_at < new.ends_at
      and t.ends_at > new.starts_at
      and (
        t.class_id = new.class_id
        or (new.staff_id is not null and t.staff_id = new.staff_id)
        or (nullif(trim(new.room), '') is not null and lower(trim(t.room)) = lower(trim(new.room)))
      )
  ) then
    raise exception 'Timetable conflict: the class, teacher or room is already scheduled during this period.';
  end if;
  return new;
end;
$$;

drop trigger if exists school_timetable_conflict_guard on public.school_timetables;
create trigger school_timetable_conflict_guard
before insert or update of business_id,class_id,staff_id,day_of_week,starts_at,ends_at,room,term_id
on public.school_timetables
for each row execute function public.school_prevent_timetable_conflicts();

-- 2. Assignments: add workflow metadata without disturbing existing submissions.
alter table public.school_assignment_submissions
  add column if not exists status text not null default 'submitted',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_late boolean not null default false,
  add column if not exists attachment_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_assignment_submissions'::regclass
      and conname = 'school_assignment_submission_status_check'
  ) then
    alter table public.school_assignment_submissions
      add constraint school_assignment_submission_status_check
      check (status in ('draft','submitted','late','returned','resubmitted'));
  end if;
end $$;

create index if not exists school_assignment_submissions_business_status_idx
  on public.school_assignment_submissions(business_id,status,submitted_at desc);

-- 3. Academic analytics: security-invoker views preserve the underlying table RLS.
create or replace view public.school_analytics_student_performance
with (security_invoker = true)
as
select
  r.business_id,
  r.student_id,
  s.class_id,
  r.exam_id,
  e.title as exam_title,
  e.academic_term,
  e.exam_date,
  e.max_score,
  r.score,
  round((r.score / nullif(e.max_score,0)) * 100, 2) as percentage,
  r.remarks,
  r.created_at
from public.school_exam_results r
join public.school_exams e
  on e.id = r.exam_id and e.business_id = r.business_id
join public.school_students s
  on s.id = r.student_id and s.business_id = r.business_id;

create or replace view public.school_analytics_class_summary
with (security_invoker = true)
as
select
  business_id,
  class_id,
  count(*) as result_count,
  count(distinct student_id) as students_assessed,
  round(avg(percentage),2) as average_percentage,
  round(100.0 * count(*) filter (where percentage >= 50) / nullif(count(*),0),2) as pass_rate
from public.school_analytics_student_performance
group by business_id,class_id;

create or replace view public.school_analytics_attendance_summary
with (security_invoker = true)
as
select
  business_id,
  student_id,
  count(*) as attendance_records,
  count(*) filter (where status in ('present','late')) as present_or_late,
  count(*) filter (where status = 'absent') as absences,
  count(*) filter (where status = 'excused') as excused,
  round(100.0 * count(*) filter (where status in ('present','late')) / nullif(count(*),0),2) as attendance_rate
from public.school_attendance
group by business_id,student_id;

grant select on public.school_analytics_student_performance to authenticated;
grant select on public.school_analytics_class_summary to authenticated;
grant select on public.school_analytics_attendance_summary to authenticated;

-- 4. Admissions already has application review and enrolment. Add an index
-- to support secure status tracking and efficient application queues.
create index if not exists school_admissions_business_created_idx
  on public.school_admissions(business_id,created_at desc);

-- 5. Library: keep available-copy counts accurate when books are issued,
-- returned, marked lost, or a loan is deleted.
create or replace function public.school_sync_library_available_copies()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_active boolean := false;
  new_active boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_active := old.status in ('issued','overdue');
  end if;
  if tg_op <> 'DELETE' then
    new_active := new.status in ('issued','overdue');
  end if;

  if tg_op = 'INSERT' then
    if new_active then
      update public.school_library_books
         set copies_available = copies_available - 1
       where id = new.book_id
         and business_id = new.business_id
         and copies_available > 0;
      if not found then
        raise exception 'No available copy of this book remains.';
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old_active then
      update public.school_library_books
         set copies_available = least(copies_total,copies_available + 1)
       where id = old.book_id and business_id = old.business_id;
    end if;
    return old;
  else
    if old_active and (not new_active or new.book_id <> old.book_id) then
      update public.school_library_books
         set copies_available = least(copies_total,copies_available + 1)
       where id = old.book_id and business_id = old.business_id;
    end if;
    if new_active and (not old_active or new.book_id <> old.book_id) then
      update public.school_library_books
         set copies_available = copies_available - 1
       where id = new.book_id
         and business_id = new.business_id
         and copies_available > 0;
      if not found then
        raise exception 'No available copy of this book remains.';
      end if;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists school_library_loan_stock_sync on public.school_library_loans;
create trigger school_library_loan_stock_sync
after insert or update of book_id,status or delete
on public.school_library_loans
for each row execute function public.school_sync_library_available_copies();

create or replace view public.school_library_overdue_loans
with (security_invoker = true)
as
select
  l.business_id,
  l.id as loan_id,
  l.book_id,
  b.title as book_title,
  l.student_id,
  s.first_name,
  s.last_name,
  l.issued_on,
  l.due_on,
  greatest(current_date - l.due_on,0) as days_overdue,
  l.status
from public.school_library_loans l
join public.school_library_books b
  on b.id = l.book_id and b.business_id = l.business_id
join public.school_students s
  on s.id = l.student_id and s.business_id = l.business_id
where l.status in ('issued','overdue') and l.due_on < current_date;

grant select on public.school_library_overdue_loans to authenticated;

commit;
