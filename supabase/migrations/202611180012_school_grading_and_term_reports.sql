-- White Lion School Management: configurable grading and term report generation
-- Additive only. Existing student, exam and report-card records are preserved.
begin;

alter table public.school_exams
  add column if not exists term_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'school_exams_term_business_fk'
      and conrelid = 'public.school_exams'::regclass
  ) then
    alter table public.school_exams
      add constraint school_exams_term_business_fk
      foreign key (term_id,business_id)
      references public.school_terms(id,business_id)
      on delete set null (term_id);
  end if;
end $$;

create index if not exists school_exams_term_class_idx
  on public.school_exams(business_id,term_id,class_id);

create table if not exists public.school_grade_bands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  grade_code text not null,
  grade_label text not null,
  min_percentage numeric(5,2) not null check (min_percentage between 0 and 100),
  max_percentage numeric(5,2) not null check (max_percentage between 0 and 100),
  remark text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id,business_id),
  unique (business_id,grade_code),
  check (max_percentage >= min_percentage)
);

alter table public.school_grade_bands enable row level security;
drop policy if exists school_grade_bands_member_read on public.school_grade_bands;
create policy school_grade_bands_member_read
  on public.school_grade_bands for select to authenticated
  using (public.is_business_member(business_id));
drop policy if exists school_grade_bands_management_write on public.school_grade_bands;
create policy school_grade_bands_management_write
  on public.school_grade_bands for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
  with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));
grant select,insert,update,delete on public.school_grade_bands to authenticated;

create or replace function public.school_check_grade_band_overlap()
returns trigger
language plpgsql
set search_path = public
as $wls$
begin
  if exists (
    select 1 from public.school_grade_bands gb
    where gb.business_id=new.business_id
      and gb.id is distinct from new.id
      and numrange(gb.min_percentage,gb.max_percentage,'[]')
          && numrange(new.min_percentage,new.max_percentage,'[]')
  ) then
    raise exception 'Grade percentage ranges cannot overlap within the same school';
  end if;
  return new;
end;
$wls$;

drop trigger if exists school_grade_band_no_overlap on public.school_grade_bands;
create trigger school_grade_band_no_overlap
before insert or update of business_id,min_percentage,max_percentage
on public.school_grade_bands
for each row execute function public.school_check_grade_band_overlap();

create or replace function public.school_generate_term_report_cards(
  p_class_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_report_title text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $wls$
declare
  v_business_id uuid;
  v_term public.school_terms%rowtype;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_student record;
  v_subjects jsonb;
  v_attendance jsonb;
  v_grade text;
  v_score numeric(8,2);
  v_position integer;
  v_report_id uuid;
  v_existing_published boolean;
  v_default_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select business_id into v_business_id
  from public.school_classes
  where id = p_class_id and is_active = true;

  if v_business_id is null then raise exception 'Active class not found'; end if;
  if not public.has_business_role(v_business_id,array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only school management can generate term reports';
  end if;

  select * into v_term
  from public.school_terms
  where id = p_term_id and business_id = v_business_id
    and academic_year_id = p_academic_year_id;
  if not found then raise exception 'Selected term does not belong to the selected academic year'; end if;

  if not exists (
    select 1 from public.school_exams
    where business_id=v_business_id and class_id=p_class_id and term_id=p_term_id
  ) then
    raise exception 'No examinations are linked to this class and term. Add or edit examinations and select the correct academic term first.';
  end if;

  if not exists (
    select 1 from public.school_academic_years
    where id = p_academic_year_id and business_id = v_business_id
  ) then raise exception 'Academic year not found'; end if;

  -- Provide a clearly editable starter scale only when this school has not configured one.
  select count(*) into v_default_count
  from public.school_grade_bands where business_id = v_business_id;
  if v_default_count = 0 then
    insert into public.school_grade_bands
      (business_id,grade_code,grade_label,min_percentage,max_percentage,remark,sort_order)
    values
      (v_business_id,'A','Excellent',80,100,'Excellent achievement',1),
      (v_business_id,'B','Very good',70,79.99,'Very good achievement',2),
      (v_business_id,'C','Good',60,69.99,'Good achievement',3),
      (v_business_id,'D','Pass',50,59.99,'Meets the pass standard',4),
      (v_business_id,'F','Needs improvement',0,49.99,'Below the configured pass standard',5);
  end if;

  for v_student in
    select st.id, st.first_name, st.last_name
    from public.school_students st
    where st.business_id = v_business_id
      and st.class_id = p_class_id
      and st.status = 'active'
    order by st.last_name, st.first_name
  loop
    select
      case when sum(ex.max_score) > 0
        then round((sum(coalesce(er.score,0)) / sum(ex.max_score)) * 100,2)
        else null end
    into v_score
    from public.school_exams ex
    left join public.school_exam_results er
      on er.exam_id=ex.id and er.business_id=ex.business_id
      and er.student_id=v_student.id
    where ex.business_id=v_business_id
      and ex.class_id=p_class_id
      and ex.term_id=p_term_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'subject_id',q.subject_id,
      'subject',q.subject_name,
      'score',q.percentage,
      'grade',coalesce(g.grade_code,'—'),
      'remark',coalesce(g.remark,'')
    ) order by q.subject_name),'[]'::jsonb)
    into v_subjects
    from (
      select ex.subject_id,
        coalesce(su.name,'Unassigned subject') as subject_name,
        round((sum(coalesce(er.score,0))/nullif(sum(ex.max_score),0))*100,2) as percentage
      from public.school_exams ex
      left join public.school_exam_results er
        on er.exam_id=ex.id and er.business_id=ex.business_id
        and er.student_id=v_student.id
      left join public.school_subjects su
        on su.id=ex.subject_id and su.business_id=ex.business_id
      where ex.business_id=v_business_id
        and ex.class_id=p_class_id
        and ex.term_id=p_term_id
      group by ex.subject_id,su.name
    ) q
    left join lateral (
      select gb.grade_code,gb.remark
      from public.school_grade_bands gb
      where gb.business_id=v_business_id
        and q.percentage between gb.min_percentage and gb.max_percentage
      order by gb.sort_order
      limit 1
    ) g on true;

    select coalesce(jsonb_build_object(
      'present',count(*) filter (where a.status='present'),
      'absent',count(*) filter (where a.status='absent'),
      'late',count(*) filter (where a.status='late'),
      'excused',count(*) filter (where a.status='excused'),
      'recorded_days',count(*),
      'attendance_rate',case when count(*)=0 then null
        else round(100.0*count(*) filter (where a.status in ('present','late'))/count(*),2) end
    ),'{}'::jsonb)
    into v_attendance
    from public.school_attendance a
    where a.business_id=v_business_id
      and a.student_id=v_student.id
      and a.attendance_date between v_term.starts_on and v_term.ends_on;

    select gb.grade_code into v_grade
    from public.school_grade_bands gb
    where gb.business_id=v_business_id and v_score between gb.min_percentage and gb.max_percentage
    order by gb.sort_order limit 1;

    select ranked.student_rank into v_position
    from (
      select st2.id,
        case when sum(ex2.max_score)>0 then sum(coalesce(er2.score,0))/sum(ex2.max_score)*100 else null end as score
      from public.school_students st2
      left join public.school_exams ex2
        on ex2.business_id=st2.business_id
        and ex2.class_id=p_class_id and ex2.term_id=p_term_id
      left join public.school_exam_results er2
        on er2.exam_id=ex2.id and er2.business_id=ex2.business_id
        and er2.student_id=st2.id
      ) z
    ) ranked
    where ranked.id=v_student.id;

    select id,published into v_report_id, v_existing_published
    from public.school_report_cards
    where business_id=v_business_id and student_id=v_student.id
      and academic_year_id=p_academic_year_id and term_id=p_term_id
    order by created_at desc limit 1;

    if v_report_id is not null and v_existing_published then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_report_id is null then
      insert into public.school_report_cards(
        business_id,student_id,academic_year_id,term_id,report_title,
        overall_score,overall_grade,class_position,attendance_summary,
        subject_results,published,prepared_by
      ) values (
        v_business_id,v_student.id,p_academic_year_id,p_term_id,
        coalesce(nullif(trim(p_report_title),''),v_term.name||' Report'),
        v_score,v_grade,v_position,v_attendance,v_subjects,false,auth.uid()
      );
      v_created := v_created + 1;
    else
      update public.school_report_cards
      set report_title=coalesce(nullif(trim(p_report_title),''),v_term.name||' Report'),
          overall_score=v_score,overall_grade=v_grade,class_position=v_position,
          attendance_summary=v_attendance,subject_results=v_subjects,
          prepared_by=auth.uid()
      where id=v_report_id and business_id=v_business_id and published=false;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'created',v_created,
    'updated',v_updated,
    'skipped_published',v_skipped,
    'message','Draft term reports generated. Review each report before publishing.'
  );
end;
$$;

revoke all on function public.school_generate_term_report_cards(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.school_generate_term_report_cards(uuid,uuid,uuid,text) to authenticated;

commit;
