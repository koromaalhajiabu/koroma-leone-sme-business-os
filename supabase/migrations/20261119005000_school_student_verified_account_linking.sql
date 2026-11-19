-- Simplify student account linking: use the same verified-email pattern as teacher accounts.
-- Remove the one-time activation-code workflow while preserving the Student Activation Register.
begin;

drop trigger if exists school_students_issue_portal_activation_code on public.school_students;
drop function if exists public.school_issue_student_portal_activation_code();
drop table if exists public.school_student_portal_activation_codes;

create or replace function public.school_link_student_account(
  p_student_id uuid,
  p_student_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student public.school_students%rowtype;
  v_user_id uuid;
  v_email text := lower(trim(coalesce(p_student_email,'')));
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if v_email = '' then
    raise exception 'Enter the email address used by the student to register';
  end if;

  select * into v_student
  from public.school_students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'Student record not found';
  end if;
  if not public.has_business_role(v_student.business_id, array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only school administrators can link student accounts';
  end if;
  if v_student.status <> 'active' then
    raise exception 'Only active students can be linked to the Student Portal';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'No verified White Lion account was found for this email. Ask the student to register and verify the email first.';
  end if;
  if v_student.user_id is not null and v_student.user_id <> v_user_id then
    raise exception 'This student record is already linked to another account. Contact the school administrator.';
  end if;

  if exists (
    select 1 from public.school_memberships sm
    where sm.business_id = v_student.business_id
      and sm.user_id = v_user_id
      and sm.school_role <> 'student'
  ) then
    raise exception 'This account already has another school role. Use a separate student account.';
  end if;

  update public.school_students
  set user_id = v_user_id
  where id = p_student_id;

  insert into public.school_memberships(business_id,user_id,school_role,is_active)
  values (v_student.business_id,v_user_id,'student',true)
  on conflict (business_id,user_id)
  do update set school_role='student',is_active=true;

  return jsonb_build_object(
    'linked',true,
    'student_id',p_student_id,
    'user_id',v_user_id,
    'email',v_email
  );
end;
$$;

revoke all on function public.school_link_student_account(uuid,text) from public, anon;
grant execute on function public.school_link_student_account(uuid,text) to authenticated;

commit;
