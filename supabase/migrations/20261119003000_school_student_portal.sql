-- White Lion School Management: secure student accounts and self-service portal
begin;

alter table public.school_students
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists school_students_user_id_unique
  on public.school_students(user_id) where user_id is not null;
create index if not exists school_students_business_admission_lookup
  on public.school_students(business_id, lower(admission_number));

-- A student's own profile is returned only for the authenticated account linked by an administrator.
create or replace function public.school_student_portal_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_student public.school_students%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select st.* into v_student
  from public.school_students st
  join public.school_memberships sm
    on sm.business_id = st.business_id
   and sm.user_id = auth.uid()
   and sm.school_role = 'student'
   and sm.is_active = true
  where st.user_id = auth.uid()
    and st.status = 'active'
  limit 1;

  if not found then raise exception 'No active student profile is linked to this account. Contact your school administration.'; end if;

  select jsonb_build_object(
    'school_name', coalesce(sp.school_name,b.name),
    'school_crest', sp.crest_url,
    'student', jsonb_build_object(
      'id',v_student.id,'admission_number',v_student.admission_number,
      'first_name',v_student.first_name,'last_name',v_student.last_name,
      'photo_path',v_student.photo_path,'class_name',c.name,
      'academic_year',c.academic_year,'status',v_student.status
    ),
    'timetable', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week',tt.day_of_week,'starts_at',tt.starts_at,'ends_at',tt.ends_at,
        'subject',su.name,'teacher',coalesce(sf.first_name || ' ' || sf.last_name,''),
        'room',tt.room
      ) order by tt.day_of_week,tt.starts_at)
      from public.school_timetables tt
      join public.school_subjects su on su.id=tt.subject_id and su.business_id=tt.business_id
      left join public.school_staff sf on sf.id=tt.staff_id and sf.business_id=tt.business_id
      where tt.business_id=v_student.business_id and tt.class_id=v_student.class_id
    ),'[]'::jsonb),
    'attendance', coalesce((
      select jsonb_build_object(
        'total',count(*),
        'present',count(*) filter(where a.status='present'),
        'late',count(*) filter(where a.status='late'),
        'absent',count(*) filter(where a.status='absent'),
        'excused',count(*) filter(where a.status='excused'),
        'recent',coalesce(jsonb_agg(jsonb_build_object('date',a.attendance_date,'status',a.status) order by a.attendance_date desc)
          filter(where a.id is not null),'[]'::jsonb)
      )
      from public.school_attendance a
      where a.business_id=v_student.business_id and a.student_id=v_student.id
    ),'{"total":0,"present":0,"late":0,"absent":0,"excused":0,"recent":[]}'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exam',e.title,'date',e.exam_date,'term',e.academic_term,
        'score',r.score,'maximum',e.max_score,'percentage',round(r.score/nullif(e.max_score,0)*100,2),
        'remarks',r.remarks
      ) order by e.exam_date desc nulls last,r.created_at desc)
      from public.school_exam_results r
      join public.school_exams e on e.id=r.exam_id and e.business_id=r.business_id
      where r.business_id=v_student.business_id and r.student_id=v_student.id
    ),'[]'::jsonb),
    'report_cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title',rc.report_title,'score',rc.overall_score,'grade',rc.overall_grade,
        'position',rc.class_position,'teacher_comment',rc.teacher_comment,
        'principal_comment',rc.principal_comment,'created_at',rc.created_at
      ) order by rc.created_at desc)
      from public.school_report_cards rc
      where rc.business_id=v_student.business_id and rc.student_id=v_student.id
        and rc.published=true
    ),'[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'title',a.title,'instructions',a.instructions,
        'subject',su.name,'due_at',a.due_at,'max_score',a.max_score
      ) order by a.due_at asc nulls last)
      from public.school_assignments a
      join public.school_subjects su on su.id=a.subject_id and su.business_id=a.business_id
      where a.business_id=v_student.business_id and a.class_id=v_student.class_id
        and a.published=true
    ),'[]'::jsonb),
    'library_loans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'book',bk.title,'issued_on',l.issued_on,'due_on',l.due_on,
        'returned_on',l.returned_on,'status',l.status
      ) order by l.issued_on desc)
      from public.school_library_loans l
      join public.school_library_books bk on bk.id=l.book_id and bk.business_id=l.business_id
      where l.business_id=v_student.business_id and l.student_id=v_student.id
    ),'[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invoice',i.invoice_number,'description',i.description,'term',i.academic_term,
        'amount',i.amount,'due_date',i.due_date,'status',i.status
      ) order by i.created_at desc)
      from public.school_fee_invoices i
      where i.business_id=v_student.business_id and i.student_id=v_student.id
        and i.status <> 'cancelled'
    ),'[]'::jsonb)
  ) into v_result
  from public.businesses b
  left join public.school_profiles sp on sp.business_id=b.id
  left join public.school_classes c on c.id=v_student.class_id and c.business_id=v_student.business_id
  where b.id=v_student.business_id;

  return v_result;
end;
$$;

revoke all on function public.school_student_portal_data() from public, anon;
grant execute on function public.school_student_portal_data() to authenticated;

commit;
