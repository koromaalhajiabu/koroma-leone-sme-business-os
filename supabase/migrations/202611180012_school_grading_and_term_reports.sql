-- White Lion School Management: grading bands and term report generation
-- Additive migration. Existing school records and published reports are preserved.

begin;

-- Link each examination to an academic term.
alter table public.school_exams
  add column if not exists term_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_exams_term_business_fk'
      and conrelid = 'public.school_exams'::regclass
  ) then
    alter table public.school_exams
      add constraint school_exams_term_business_fk
      foreign key (term_id, business_id)
      references public.school_terms (id, business_id);
  end if;
end;
$migration$;

create index if not exists school_exams_term_class_idx
  on public.school_exams (business_id, term_id, class_id);

-- Each school manages its own grading scale.
create table if not exists public.school_grade_bands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  grade_code text not null,
  grade_label text not null,
  min_percentage numeric(5,2) not null
    check (min_percentage >= 0 and min_percentage <= 100),
  max_percentage numeric(5,2) not null
    check (max_percentage >= 0 and max_percentage <= 100),
  remark text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, grade_code),
  check (max_percentage >= min_percentage)
);

alter table public.school_grade_bands enable row level security;

drop policy if exists school_grade_bands_member_read
  on public.school_grade_bands;

create policy school_grade_bands_member_read
  on public.school_grade_bands
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists school_grade_bands_management_write
  on public.school_grade_bands;

create policy school_grade_bands_management_write
  on public.school_grade_bands
  for all to authenticated
  using (
    public.has_business_role(
      business_id,
      array['owner','admin','manager']::public.business_role[]
    )
  )
  with check (
    public.has_business_role(
      business_id,
      array['owner','admin','manager']::public.business_role[]
    )
  );

grant select, insert, update, delete
  on public.school_grade_bands to authenticated;

-- Generate draft reports for all active students in a class.
-- Existing published reports are never changed by this function.
create or replace function public.school_generate_term_report_cards(
  p_class_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_report_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_business_id uuid;
  v_term public.school_terms%rowtype;
  v_student record;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_score numeric(8,2);
  v_grade text;
  v_position integer;
  v_subjects jsonb;
  v_attendance jsonb;
  v_report_id uuid;
  v_existing_published boolean;
  v_grade_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select c.business_id
    into v_business_id
  from public.school_classes c
  where c.id = p_class_id
    and c.is_active = true;

  if v_business_id is null then
    raise exception 'Active class not found';
  end if;

  if not public.has_business_role(
    v_business_id,
    array['owner','admin','manager']::public.business_role[]
  ) then
    raise exception 'Only school management can generate term reports';
  end if;

  if not exists (
    select 1
    from public.school_academic_years ay
    where ay.id = p_academic_year_id
      and ay.business_id = v_business_id
  ) then
    raise exception 'Academic year not found for this school';
  end if;

  select t.*
    into v_term
  from public.school_terms t
  where t.id = p_term_id
    and t.business_id = v_business_id
    and t.academic_year_id = p_academic_year_id;

  if not found then
    raise exception 'Selected term does not belong to the selected academic year';
  end if;

  if not exists (
    select 1
    from public.school_exams e
    where e.business_id = v_business_id
      and e.class_id = p_class_id
      and e.term_id = p_term_id
  ) then
    raise exception 'No examinations are linked to this class and term. Link examinations to the selected term before generating reports.';
  end if;

  -- Install a starter grading scale only if the school has no scale yet.
  select count(*)
    into v_grade_count
  from public.school_grade_bands gb
  where gb.business_id = v_business_id;

  if v_grade_count = 0 then
    insert into public.school_grade_bands (
      business_id, grade_code, grade_label,
      min_percentage, max_percentage, remark, sort_order
    )
    values
      (v_business_id, 'A', 'Excellent', 80, 100, 'Excellent achievement', 1),
      (v_business_id, 'B', 'Very good', 70, 79.99, 'Very good achievement', 2),
      (v_business_id, 'C', 'Good', 60, 69.99, 'Good achievement', 3),
      (v_business_id, 'D', 'Pass', 50, 59.99, 'Meets the pass standard', 4),
      (v_business_id, 'F', 'Needs improvement', 0, 49.99, 'Below the pass standard', 5);
  end if;

  for v_student in
    select st.id, st.first_name, st.last_name
    from public.school_students st
    where st.business_id = v_business_id
      and st.class_id = p_class_id
      and st.status = 'active'
    order by st.last_name, st.first_name
  loop

    -- Overall percentage: total marks obtained divided by total possible marks.
    select
      case
        when coalesce(sum(e.max_score), 0) = 0 then null
        else round(
          (coalesce(sum(r.score), 0) / sum(e.max_score)) * 100,
          2
        )
      end
      into v_score
    from public.school_exams e
    left join public.school_exam_results r
      on r.exam_id = e.id
      and r.business_id = e.business_id
      and r.student_id = v_student.id
    where e.business_id = v_business_id
      and e.class_id = p_class_id
      and e.term_id = p_term_id;

    -- Subject-level results and grades.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'subject_id', subject_rows.subject_id,
          'subject', subject_rows.subject_name,
          'score', subject_rows.percentage,
          'grade', coalesce(subject_rows.grade_code, '—'),
          'remark', coalesce(subject_rows.grade_remark, '')
        )
        order by subject_rows.subject_name
      ),
      '[]'::jsonb
    )
    into v_subjects
    from (
      select
        q.subject_id,
        q.subject_name,
        q.percentage,
        grade_band.grade_code,
        grade_band.remark as grade_remark
      from (
        select
          e.subject_id,
          coalesce(s.name, 'Unassigned subject') as subject_name,
          round(
            (
              coalesce(sum(r.score), 0)
              / nullif(sum(e.max_score), 0)
            ) * 100,
            2
          ) as percentage
        from public.school_exams e
        left join public.school_exam_results r
          on r.exam_id = e.id
          and r.business_id = e.business_id
          and r.student_id = v_student.id
        left join public.school_subjects s
          on s.id = e.subject_id
          and s.business_id = e.business_id
        where e.business_id = v_business_id
          and e.class_id = p_class_id
          and e.term_id = p_term_id
        group by e.subject_id, s.name
      ) q
      left join lateral (
        select gb.grade_code, gb.remark
        from public.school_grade_bands gb
        where gb.business_id = v_business_id
          and q.percentage between gb.min_percentage and gb.max_percentage
        order by gb.sort_order
        limit 1
      ) grade_band on true
    ) as subject_rows;

    -- Attendance summary for the selected term.
    select jsonb_build_object(
      'present', count(*) filter (where a.status = 'present'),
      'absent', count(*) filter (where a.status = 'absent'),
      'late', count(*) filter (where a.status = 'late'),
      'excused', count(*) filter (where a.status = 'excused'),
      'recorded_days', count(*),
      'attendance_rate',
        case
          when count(*) = 0 then null
          else round(
            100.0 * count(*) filter (where a.status in ('present','late'))
            / count(*),
            2
          )
        end
    )
    into v_attendance
    from public.school_attendance a
    where a.business_id = v_business_id
      and a.student_id = v_student.id
      and a.attendance_date between v_term.starts_on and v_term.ends_on;

    -- Overall grade for this student.
    select gb.grade_code
      into v_grade
    from public.school_grade_bands gb
    where gb.business_id = v_business_id
      and v_score between gb.min_percentage and gb.max_percentage
    order by gb.sort_order
    limit 1;

    -- Competition ranking: one plus the number of students with a higher score.
    select 1 + count(*)
      into v_position
    from public.school_students other_student
    where other_student.business_id = v_business_id
      and other_student.class_id = p_class_id
      and other_student.status = 'active'
      and other_student.id <> v_student.id
      and (
        select
          case
            when coalesce(sum(other_exam.max_score), 0) = 0 then null
            else
              coalesce(sum(other_result.score), 0)
              / sum(other_exam.max_score)
          end
        from public.school_exams other_exam
        left join public.school_exam_results other_result
          on other_result.exam_id = other_exam.id
          and other_result.business_id = other_exam.business_id
          and other_result.student_id = other_student.id
        where other_exam.business_id = v_business_id
          and other_exam.class_id = p_class_id
          and other_exam.term_id = p_term_id
      ) > (v_score / 100.0);

    -- Find an existing report for this student and term.
    select rc.id, rc.published
      into v_report_id, v_existing_published
    from public.school_report_cards rc
    where rc.business_id = v_business_id
      and rc.student_id = v_student.id
      and rc.academic_year_id = p_academic_year_id
      and rc.term_id = p_term_id
    order by rc.created_at desc
    limit 1;

    if v_report_id is not null and coalesce(v_existing_published, false) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_report_id is null then
      insert into public.school_report_cards (
        business_id, student_id, academic_year_id, term_id,
        report_title, overall_score, overall_grade, class_position,
        attendance_summary, subject_results, published, prepared_by
      )
      values (
        v_business_id, v_student.id, p_academic_year_id, p_term_id,
        coalesce(nullif(trim(p_report_title), ''), v_term.name || ' Report'),
        v_score, v_grade, v_position,
        coalesce(v_attendance, '{}'::jsonb),
        coalesce(v_subjects, '[]'::jsonb),
        false, auth.uid()
      );

      v_created := v_created + 1;
    else
      update public.school_report_cards
      set
        report_title = coalesce(
          nullif(trim(p_report_title), ''),
          v_term.name || ' Report'
        ),
        overall_score = v_score,
        overall_grade = v_grade,
        class_position = v_position,
        attendance_summary = coalesce(v_attendance, '{}'::jsonb),
        subject_results = coalesce(v_subjects, '[]'::jsonb),
        prepared_by = auth.uid()
      where id = v_report_id
        and business_id = v_business_id
        and published = false;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped_published', v_skipped,
    'message', 'Draft term reports generated. Review each report before publishing.'
  );
end;
$function$;

revoke all on function public.school_generate_term_report_cards(uuid, uuid, uuid, text)
  from public, anon;

grant execute on function public.school_generate_term_report_cards(uuid, uuid, uuid, text)
  to authenticated;

commit;
