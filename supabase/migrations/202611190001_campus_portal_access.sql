-- Campus student & lecturer self-service portals: account linking and scoped RPCs
begin;

alter table public.campus_students
  add column if not exists user_id uuid references auth.users(id);

create unique index if not exists campus_students_user_id_key
  on public.campus_students(user_id) where user_id is not null;

create unique index if not exists campus_staff_user_id_key
  on public.campus_staff(user_id) where user_id is not null;

create index if not exists campus_course_sections_instructor_idx
  on public.campus_course_sections(business_id,instructor_staff_id);

create index if not exists campus_enrollments_section_idx
  on public.campus_enrollments(business_id,section_id);

-- Link a student record to their own verified White Lion account
create or replace function public.campus_link_student_account(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student public.campus_students%rowtype;
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_student
  from public.campus_students
  where id = p_student_id
  for update;

  if not found then raise exception 'Student record not found'; end if;
  if not public.has_business_role(v_student.business_id, array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only campus administrators can link student portal accounts';
  end if;
  if v_student.status <> 'active' then
    raise exception 'Only active students can be linked to the student portal';
  end if;
  if coalesce(trim(v_student.email),'') = '' then
    raise exception 'Add the student email address to the student record first';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(v_student.email))
    and u.email_confirmed_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'No verified White Lion account was found for this email. Ask the student to register and verify their email, then try again.';
  end if;
  if v_student.user_id is not null and v_student.user_id <> v_user_id then
    raise exception 'This student record is already linked to a different account. Contact the campus administrator.';
  end if;
  if exists (
    select 1 from public.campus_students s2
    where s2.business_id = v_student.business_id and s2.user_id = v_user_id and s2.id <> v_student.id
  ) then
    raise exception 'This account is already linked to a different student record.';
  end if;

  update public.campus_students set user_id = v_user_id where id = p_student_id;

  return jsonb_build_object('linked',true,'student_id',p_student_id,'user_id',v_user_id,'email',v_student.email);
end;
$$;

-- Link a lecturer staff record to their own verified White Lion account
create or replace function public.campus_link_lecturer_account(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.campus_staff%rowtype;
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_staff
  from public.campus_staff
  where id = p_staff_id
  for update;

  if not found then raise exception 'Staff record not found'; end if;
  if not public.has_business_role(v_staff.business_id, array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only campus administrators can link lecturer portal accounts';
  end if;
  if v_staff.staff_role <> 'lecturer' then
    raise exception 'Only lecturers can be linked to the lecturer portal';
  end if;
  if v_staff.employment_status <> 'active' then
    raise exception 'Only active staff can be linked to the lecturer portal';
  end if;
  if coalesce(trim(v_staff.email),'') = '' then
    raise exception 'Add the lecturer email address to the staff record first';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(v_staff.email))
    and u.email_confirmed_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'No verified White Lion account was found for this email. Ask the lecturer to register and verify their email, then try again.';
  end if;
  if v_staff.user_id is not null and v_staff.user_id <> v_user_id then
    raise exception 'This staff record is already linked to a different account. Contact the campus administrator.';
  end if;
  if exists (
    select 1 from public.campus_staff s2
    where s2.business_id = v_staff.business_id and s2.user_id = v_user_id and s2.id <> v_staff.id
  ) then
    raise exception 'This account is already linked to a different staff record.';
  end if;

  update public.campus_staff set user_id = v_user_id where id = p_staff_id;

  return jsonb_build_object('linked',true,'staff_id',p_staff_id,'user_id',v_user_id,'email',v_staff.email);
end;
$$;

-- Student portal: the caller's own profile, enrollments/grades, cumulative GPA and billing
create or replace function public.campus_student_portal_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student public.campus_students%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_student
  from public.campus_students
  where user_id = auth.uid()
  limit 1;

  if not found then raise exception 'No student profile is linked to this account. Contact your campus administrator.'; end if;

  select jsonb_build_object(
    'campus_name', b.name,
    'student', jsonb_build_object(
      'id', v_student.id, 'student_number', v_student.student_number,
      'first_name', v_student.first_name, 'last_name', v_student.last_name,
      'status', v_student.status
    ),
    'program', (select jsonb_build_object('name',p.name,'code',p.code,'degree_level',p.degree_level,'total_credits_required',p.total_credits_required) from public.campus_programs p where p.id = v_student.program_id),
    'enrollments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'course_code', c.course_code, 'course_title', c.title,
        'credit_hours', c.credit_hours, 'section_code', sec.section_code,
        'term_name', t.name, 'status', e.status,
        'percentage_score', e.percentage_score, 'letter_grade', e.letter_grade, 'gpa_points', e.gpa_points
      ) order by t.starts_on desc nulls last, c.course_code)
      from public.campus_enrollments e
      join public.campus_course_sections sec on sec.id = e.section_id and sec.business_id = e.business_id
      join public.campus_courses c on c.id = sec.course_id and c.business_id = e.business_id
      left join public.campus_terms t on t.id = e.term_id and t.business_id = e.business_id
      where e.business_id = v_student.business_id and e.student_id = v_student.id
    ), '[]'::jsonb),
    'cumulative_gpa', (
      select case when sum(c.credit_hours) > 0 then round((sum(e.gpa_points * c.credit_hours) / sum(c.credit_hours))::numeric, 2) else null end
      from public.campus_enrollments e
      join public.campus_course_sections sec on sec.id = e.section_id and sec.business_id = e.business_id
      join public.campus_courses c on c.id = sec.course_id and c.business_id = e.business_id
      where e.business_id = v_student.business_id and e.student_id = v_student.id and e.gpa_points is not null
    ),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice_number', i.invoice_number, 'description', i.description,
        'amount', i.amount, 'due_date', i.due_date, 'status', i.status
      ) order by i.due_date nulls last)
      from public.campus_invoices i
      where i.business_id = v_student.business_id and i.student_id = v_student.id
    ), '[]'::jsonb)
  ) into v_result
  from public.businesses b
  where b.id = v_student.business_id;

  return v_result;
end;
$$;

-- Lecturer portal: the caller's own assigned sections and enrolled students
create or replace function public.campus_lecturer_portal_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.campus_staff%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_staff
  from public.campus_staff
  where user_id = auth.uid() and staff_role = 'lecturer' and employment_status = 'active'
  limit 1;

  if not found then raise exception 'No active lecturer profile is linked to this account. Contact your campus administrator.'; end if;

  select jsonb_build_object(
    'campus_name', b.name,
    'lecturer', jsonb_build_object('id', v_staff.id, 'first_name', v_staff.first_name, 'last_name', v_staff.last_name, 'job_title', v_staff.job_title),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section_id', sec.id, 'section_code', sec.section_code, 'course_code', c.course_code,
        'course_title', c.title, 'credit_hours', c.credit_hours, 'term_name', t.name,
        'schedule', sec.schedule, 'room', sec.room, 'capacity', sec.capacity
      ) order by t.starts_on desc nulls last, c.course_code)
      from public.campus_course_sections sec
      join public.campus_courses c on c.id = sec.course_id and c.business_id = sec.business_id
      left join public.campus_terms t on t.id = sec.term_id and t.business_id = sec.business_id
      where sec.business_id = v_staff.business_id and sec.instructor_staff_id = v_staff.id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', e.id, 'section_id', e.section_id,
        'student_id', s.id, 'student_number', s.student_number,
        'first_name', s.first_name, 'last_name', s.last_name,
        'status', e.status, 'percentage_score', e.percentage_score,
        'letter_grade', e.letter_grade, 'gpa_points', e.gpa_points
      ) order by s.last_name, s.first_name)
      from public.campus_enrollments e
      join public.campus_students s on s.id = e.student_id and s.business_id = e.business_id
      where e.business_id = v_staff.business_id
        and e.section_id in (
          select sec.id from public.campus_course_sections sec
          where sec.business_id = v_staff.business_id and sec.instructor_staff_id = v_staff.id
        )
    ), '[]'::jsonb)
  ) into v_result
  from public.businesses b
  where b.id = v_staff.business_id;

  return v_result;
end;
$$;

-- Lecturer write: save/update a grade for one of their own assigned enrollments
create or replace function public.campus_lecturer_save_grade(
  p_enrollment_id uuid,
  p_percentage_score numeric
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.campus_staff%rowtype;
  v_enrollment public.campus_enrollments%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_staff
  from public.campus_staff
  where user_id = auth.uid() and staff_role = 'lecturer' and employment_status = 'active'
  limit 1;
  if not found then raise exception 'Lecturer account is not active'; end if;

  select * into v_enrollment
  from public.campus_enrollments
  where id = p_enrollment_id and business_id = v_staff.business_id
  for update;
  if not found then raise exception 'Enrollment not found'; end if;

  if not exists (
    select 1 from public.campus_course_sections sec
    where sec.id = v_enrollment.section_id and sec.business_id = v_staff.business_id
      and sec.instructor_staff_id = v_staff.id
  ) then
    raise exception 'You are not the instructor for this course section';
  end if;

  if p_percentage_score < 0 or p_percentage_score > 100 then
    raise exception 'Score must be between 0 and 100';
  end if;

  update public.campus_enrollments
  set percentage_score = p_percentage_score, status = 'completed'
  where id = p_enrollment_id;

  return p_enrollment_id;
end;
$$;

revoke all on function public.campus_link_student_account(uuid) from public;
revoke all on function public.campus_link_lecturer_account(uuid) from public;
revoke all on function public.campus_student_portal_data() from public;
revoke all on function public.campus_lecturer_portal_data() from public;
revoke all on function public.campus_lecturer_save_grade(uuid,numeric) from public;

grant execute on function public.campus_link_student_account(uuid) to authenticated;
grant execute on function public.campus_link_lecturer_account(uuid) to authenticated;
grant execute on function public.campus_student_portal_data() to authenticated;
grant execute on function public.campus_lecturer_portal_data() to authenticated;
grant execute on function public.campus_lecturer_save_grade(uuid,numeric) to authenticated;

commit;
