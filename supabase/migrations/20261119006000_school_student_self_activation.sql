-- White Lion School Management: verified student self-activation without an Edge Function
begin;

alter table public.school_students
  add column if not exists student_email text;

create index if not exists school_students_business_student_email_lookup
  on public.school_students (business_id, lower(student_email))
  where student_email is not null;

create or replace function public.school_student_portal_enabled(p_portal_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select exists (
    select 1
    from public.school_profiles sp
    join public.school_classes sc on sc.business_id = sp.business_id
    where sp.portal_code = p_portal_code
      and coalesce(sp.portal_enabled,true) = true
      and lower(coalesce(sc.education_level::text,'')) in ('junior_secondary','senior_secondary')
  );
$;

revoke all on function public.school_student_portal_enabled(text) from public;
grant execute on function public.school_student_portal_enabled(text) to anon, authenticated;

create or replace function public.school_set_student_portal_email(
  p_student_id uuid,
  p_student_email text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student public.school_students%rowtype;
  v_email text;
  v_education_level text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  v_email := lower(trim(coalesce(p_student_email,'')));
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid student email address';
  end if;
  select * into v_student
  from public.school_students
  where id = p_student_id
  for update;
  if not found then raise exception 'Student record not found'; end if;
  select lower(coalesce(sc.education_level::text,'')) into v_education_level
  from public.school_classes sc where sc.id = v_student.class_id;
  if coalesce(v_education_level,'') not in ('junior_secondary','senior_secondary') then
    raise exception 'Student Portal email registration is only available for Junior and Senior Secondary students';
  end if;
  if not public.has_business_role(v_student.business_id,array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only authorised school administrators can update student portal emails';
  end if;
  if v_student.status <> 'active' then raise exception 'Only active students can use the Student Portal'; end if;
  if v_student.user_id is not null then raise exception 'This student account is already active. Contact support to change its sign-in email.';
  end if;
  if exists (
    select 1 from public.school_students other
    where other.business_id = v_student.business_id
      and other.id <> v_student.id
      and lower(other.student_email) = v_email
  ) then raise exception 'This email address is already assigned to another student in this school'; end if;
  update public.school_students set student_email = v_email where id = p_student_id;
  return jsonb_build_object('saved',true,'student_id',p_student_id);
end;
$$;

create or replace function public.school_activate_student_account(
  p_portal_code text,
  p_admission_number text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student public.school_students%rowtype;
  v_business_id uuid;
  v_email text;
  v_user_id uuid;
  v_education_level text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Sign in and verify your email first'; end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify your email address before activating your Student Portal'; end if;

  select sp.business_id into v_business_id
  from public.school_profiles sp
  where sp.portal_code = p_portal_code
    and coalesce(sp.portal_enabled,true) = true
  limit 1;
  if v_business_id is null then raise exception 'This school portal is unavailable'; end if;

  select * into v_student
  from public.school_students st
  where st.business_id = v_business_id
    and lower(trim(st.admission_number)) = lower(trim(coalesce(p_admission_number,'')))
  for update;
  if not found then raise exception 'Student ID was not found in this school'; end if;
  if v_student.status <> 'active' then raise exception 'This student record is not active'; end if;
  select lower(coalesce(sc.education_level::text,'')) into v_education_level
  from public.school_classes sc where sc.id = v_student.class_id;
  if coalesce(v_education_level,'') not in ('junior_secondary','senior_secondary') then
    raise exception 'Direct Student Portal activation is available only for Junior and Senior Secondary students. Please use the Parent/Guardian Portal.';
  end if;
  if v_student.student_email is null or lower(trim(v_student.student_email)) <> v_email then
    raise exception 'The verified email does not match the email recorded by your school. Contact the school administration.';
  end if;
  if v_student.user_id is not null and v_student.user_id <> v_user_id then
    raise exception 'This student record is already linked to another account. Contact the school administration.';
  end if;
  if exists (
    select 1 from public.school_students other
    where other.user_id = v_user_id and other.id <> v_student.id
  ) then raise exception 'This account is already linked to another student record'; end if;
  if exists (
    select 1 from public.school_memberships sm
    where sm.business_id = v_business_id
      and sm.user_id = v_user_id
      and sm.school_role not in ('student')
  ) then raise exception 'This account already has another school role. Use a separate student account'; end if;

  update public.school_students set user_id = v_user_id where id = v_student.id;
  insert into public.school_memberships(business_id,user_id,school_role,is_active)
  values(v_business_id,v_user_id,'student',true)
  on conflict(business_id,user_id)
  do update set school_role='student',is_active=true;

  return jsonb_build_object('activated',true,'student_id',v_student.id);
end;
$$;

revoke all on function public.school_set_student_portal_email(uuid,text) from public, anon;
grant execute on function public.school_set_student_portal_email(uuid,text) to authenticated;
revoke all on function public.school_activate_student_account(text,text) from public, anon;
grant execute on function public.school_activate_student_account(text,text) to authenticated;

commit;
