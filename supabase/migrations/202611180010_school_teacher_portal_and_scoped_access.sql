-- Teacher account linking and scoped teacher portal
begin;

alter table public.school_exams
  add column if not exists subject_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'school_exams_subject_business_fk'
      and conrelid = 'public.school_exams'::regclass
  ) then
    alter table public.school_exams
      add constraint school_exams_subject_business_fk
      foreign key (subject_id,business_id)
      references public.school_subjects(id,business_id)
      on delete set null (subject_id);
  end if;
end $$;

create index if not exists school_teacher_assignments_staff_class_idx
  on public.school_teacher_assignments(business_id,staff_id,class_id,subject_id);

create or replace function public.school_link_teacher_account(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.school_staff%rowtype;
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_staff
  from public.school_staff
  where id = p_staff_id
  for update;

  if not found then raise exception 'Staff record not found'; end if;
  if not public.has_business_role(v_staff.business_id, array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only school administrators can link teacher accounts';
  end if;
  if v_staff.staff_category <> 'teaching' then
    raise exception 'Only teaching staff can be linked to the teacher portal';
  end if;
  if v_staff.employment_status <> 'active' then
    raise exception 'Only active staff can be linked to the teacher portal';
  end if;
  if coalesce(trim(v_staff.email),'') = '' then
    raise exception 'Add the teacher email address to the staff record first';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(v_staff.email))
    and u.email_confirmed_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'No verified White Lion account was found for this email. Ask the teacher to register and verify their email, then try again.';
  end if;
  if v_staff.user_id is not null and v_staff.user_id <> v_user_id then
    raise exception 'This staff record is already linked to a different account. Contact the school administrator.';
  end if;

  if exists (
    select 1 from public.school_memberships sm
    where sm.business_id=v_staff.business_id and sm.user_id=v_user_id
      and sm.school_role not in ('teacher','support')
  ) then
    raise exception 'This account already has another school role. Use a separate verified teacher account.';
  end if;

  update public.school_staff set user_id = v_user_id where id = p_staff_id;
  insert into public.school_memberships(business_id,user_id,school_role,is_active)
  values (v_staff.business_id,v_user_id,'teacher',true)
  on conflict (business_id,user_id)
  do update set school_role='teacher', is_active=true;

  return jsonb_build_object('linked',true,'staff_id',p_staff_id,'user_id',v_user_id,'email',v_staff.email);
end;
$$;

create or replace function public.school_teacher_portal_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.school_staff%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select st.* into v_staff
  from public.school_staff st
  join public.school_memberships sm
    on sm.business_id=st.business_id
   and sm.user_id=st.user_id
   and sm.is_active=true
   and sm.school_role='teacher'
  where st.user_id=auth.uid()
    and st.employment_status='active'
  limit 1;

  if not found then raise exception 'No active teacher profile is linked to this account. Contact your school administrator.'; end if;

  select jsonb_build_object(
    'school_name', coalesce(sp.school_name,b.name),
    'school_crest', sp.crest_url,
    'teacher', jsonb_build_object('id',v_staff.id,'first_name',v_staff.first_name,'last_name',v_staff.last_name,'job_title',v_staff.job_title),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id',ta.id,'class_id',c.id,'class_name',c.name,
        'subject_id',su.id,'subject_name',su.name,'subject_code',su.subject_code
      ) order by c.name,su.name)
      from public.school_teacher_assignments ta
      join public.school_classes c on c.id=ta.class_id and c.business_id=ta.business_id
      join public.school_subjects su on su.id=ta.subject_id and su.business_id=ta.business_id
      where ta.business_id=v_staff.business_id and ta.staff_id=v_staff.id and c.is_active=true
    ),'[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',st.id,'admission_number',st.admission_number,
        'first_name',st.first_name,'last_name',st.last_name,
        'class_id',st.class_id,'status',st.status
      ) order by st.last_name,st.first_name)
      from public.school_students st
      where st.business_id=v_staff.business_id
        and st.status='active'
        and st.class_id in (
          select distinct ta.class_id from public.school_teacher_assignments ta
          where ta.business_id=v_staff.business_id and ta.staff_id=v_staff.id
        )
    ),'[]'::jsonb),
    'timetable', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',tt.id,'day_of_week',tt.day_of_week,'starts_at',tt.starts_at,'ends_at',tt.ends_at,
        'room',tt.room,'class_name',c.name,'subject_name',su.name
      ) order by tt.day_of_week,tt.starts_at)
      from public.school_timetables tt
      join public.school_classes c on c.id=tt.class_id and c.business_id=tt.business_id
      join public.school_subjects su on su.id=tt.subject_id and su.business_id=tt.business_id
      where tt.business_id=v_staff.business_id and tt.staff_id=v_staff.id
    ),'[]'::jsonb),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ex.id,'title',ex.title,'class_id',ex.class_id,'subject_id',ex.subject_id,
        'subject_name',su.name,'class_name',c.name,'exam_date',ex.exam_date,
        'max_score',ex.max_score,'academic_term',ex.academic_term
      ) order by ex.exam_date desc nulls last)
      from public.school_exams ex
      join public.school_classes c on c.id=ex.class_id and c.business_id=ex.business_id
      left join public.school_subjects su on su.id=ex.subject_id and su.business_id=ex.business_id
      where ex.business_id=v_staff.business_id
        and exists (
          select 1 from public.school_teacher_assignments ta
          where ta.business_id=ex.business_id and ta.staff_id=v_staff.id
            and ta.class_id=ex.class_id
            and (ex.subject_id is null or ta.subject_id=ex.subject_id)
        )
    ),'[]'::jsonb),
    'attendance_today', coalesce((
      select jsonb_agg(jsonb_build_object('student_id',a.student_id,'status',a.status,'attendance_date',a.attendance_date))
      from public.school_attendance a
      where a.business_id=v_staff.business_id
        and a.attendance_date=current_date
        and a.student_id in (
          select st.id from public.school_students st
          join public.school_teacher_assignments ta
            on ta.business_id=st.business_id and ta.class_id=st.class_id
          where ta.business_id=v_staff.business_id and ta.staff_id=v_staff.id
        )
    ),'[]'::jsonb)
  ) into v_result
  from public.businesses b
  left join public.school_profiles sp on sp.business_id=b.id
  where b.id=v_staff.business_id;

  return v_result;
end;
$$;

create or replace function public.school_teacher_record_attendance(
  p_class_id uuid,
  p_attendance_date date,
  p_records jsonb
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.school_staff%rowtype;
  v_item jsonb;
  v_count integer := 0;
  v_student_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select st.* into v_staff
  from public.school_staff st
  join public.school_memberships sm on sm.business_id=st.business_id and sm.user_id=st.user_id
  where st.user_id=auth.uid() and sm.school_role='teacher' and sm.is_active=true and st.employment_status='active'
  limit 1;
  if not found then raise exception 'Teacher account is not active'; end if;

  if not exists (
    select 1 from public.school_teacher_assignments ta
    where ta.business_id=v_staff.business_id and ta.staff_id=v_staff.id and ta.class_id=p_class_id
  ) then raise exception 'You are not assigned to this class'; end if;

  if jsonb_typeof(p_records) <> 'array' then raise exception 'Attendance records must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_records)
  loop
    v_student_id := (v_item->>'student_id')::uuid;
    v_status := v_item->>'status';
    if v_status not in ('present','absent','late','excused') then raise exception 'Invalid attendance status'; end if;
    if not exists (
      select 1 from public.school_students st
      where st.id=v_student_id and st.business_id=v_staff.business_id
        and st.class_id=p_class_id and st.status='active'
    ) then raise exception 'A student is not in your assigned class'; end if;

    insert into public.school_attendance(business_id,student_id,attendance_date,status,note,recorded_by)
    values (v_staff.business_id,v_student_id,coalesce(p_attendance_date,current_date),v_status,nullif(v_item->>'note',''),auth.uid())
    on conflict (student_id,attendance_date)
    do update set status=excluded.status,note=excluded.note,recorded_by=auth.uid();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.school_teacher_save_result(
  p_exam_id uuid,
  p_subject_id uuid,
  p_student_id uuid,
  p_score numeric,
  p_remarks text default null
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_staff public.school_staff%rowtype;
  v_exam public.school_exams%rowtype;
  v_result_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select st.* into v_staff
  from public.school_staff st
  join public.school_memberships sm on sm.business_id=st.business_id and sm.user_id=st.user_id
  where st.user_id=auth.uid() and sm.school_role='teacher' and sm.is_active=true and st.employment_status='active'
  limit 1;
  if not found then raise exception 'Teacher account is not active'; end if;

  select * into v_exam from public.school_exams
  where id=p_exam_id and business_id=v_staff.business_id;
  if not found then raise exception 'Examination not found'; end if;
  if not exists (
    select 1 from public.school_teacher_assignments ta
    where ta.business_id=v_staff.business_id and ta.staff_id=v_staff.id
      and ta.class_id=v_exam.class_id and ta.subject_id=p_subject_id
  ) then raise exception 'You are not assigned to this subject and class'; end if;
  if v_exam.subject_id is not null and v_exam.subject_id <> p_subject_id then
    raise exception 'This examination belongs to a different subject';
  end if;
  if p_score < 0 or p_score > v_exam.max_score then raise exception 'Score must be between zero and the examination maximum'; end if;
  if not exists (
    select 1 from public.school_students st
    where st.id=p_student_id and st.business_id=v_staff.business_id
      and st.class_id=v_exam.class_id and st.status='active'
  ) then raise exception 'Student is not in the examination class'; end if;

  insert into public.school_exam_results(business_id,exam_id,student_id,score,remarks,entered_by)
  values (v_staff.business_id,p_exam_id,p_student_id,p_score,p_remarks,auth.uid())
  on conflict (exam_id,student_id)
  do update set score=excluded.score,remarks=excluded.remarks,entered_by=auth.uid()
  returning id into v_result_id;
  return v_result_id;
end;
$$;

revoke all on function public.school_link_teacher_account(uuid) from public;
revoke all on function public.school_teacher_portal_data() from public;
revoke all on function public.school_teacher_record_attendance(uuid,date,jsonb) from public;
revoke all on function public.school_teacher_save_result(uuid,uuid,uuid,numeric,text) from public;

grant execute on function public.school_link_teacher_account(uuid) to authenticated;
grant execute on function public.school_teacher_portal_data() to authenticated;
grant execute on function public.school_teacher_record_attendance(uuid,date,jsonb) to authenticated;
grant execute on function public.school_teacher_save_result(uuid,uuid,uuid,numeric,text) to authenticated;

commit;
