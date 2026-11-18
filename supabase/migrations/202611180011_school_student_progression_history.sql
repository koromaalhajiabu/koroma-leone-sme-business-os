-- White Lion School Management: student progression, promotion and transfer history
-- Additive migration. Preserves existing student records and current class assignments.
begin;

create table if not exists public.school_student_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_id uuid not null,
  movement_type text not null check (movement_type in ('promotion','repetition','transfer','graduation','withdrawal','reinstatement')),
  from_class_id uuid,
  to_class_id uuid,
  academic_year_id uuid,
  effective_date date not null default current_date,
  reason text,
  recorded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (student_id,business_id) references public.school_students(id,business_id) on delete restrict,
  foreign key (from_class_id,business_id) references public.school_classes(id,business_id) on delete restrict,
  foreign key (to_class_id,business_id) references public.school_classes(id,business_id) on delete restrict,
  foreign key (academic_year_id,business_id) references public.school_academic_years(id,business_id) on delete restrict,
  check (from_class_id is distinct from to_class_id or movement_type in ('repetition','reinstatement'))
);

create index if not exists school_student_movements_student_idx
  on public.school_student_movements (business_id,student_id,effective_date desc);

alter table public.school_student_movements enable row level security;
drop policy if exists school_student_movements_management_read on public.school_student_movements;
create policy school_student_movements_management_read
  on public.school_student_movements for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

grant select on public.school_student_movements to authenticated;
revoke insert, update, delete on public.school_student_movements from anon, authenticated;

create or replace function public.school_record_student_movement(
  p_student_id uuid,
  p_movement_type text,
  p_to_class_id uuid default null,
  p_academic_year_id uuid default null,
  p_effective_date date default current_date,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_from_class_id uuid;
  v_status text;
  v_movement_id uuid;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select business_id, class_id, status
    into v_business_id, v_from_class_id, v_status
  from public.school_students
  where id = p_student_id
  for update;

  if v_business_id is null then
    raise exception 'Student record not found';
  end if;

  if not public.has_business_role(
    v_business_id,
    array['owner','admin','manager']::public.business_role[]
  ) then
    raise exception 'Only authorised school management can record student progression';
  end if;

  if p_movement_type not in ('promotion','repetition','transfer','graduation','withdrawal','reinstatement') then
    raise exception 'Invalid student movement type';
  end if;

  if p_movement_type in ('promotion','repetition','reinstatement') and p_to_class_id is null then
    raise exception 'Select the destination class';
  end if;

  if p_to_class_id is not null and not exists (
    select 1 from public.school_classes
    where id = p_to_class_id and business_id = v_business_id and is_active = true
  ) then
    raise exception 'Destination class is not active in this school';
  end if;

  if p_academic_year_id is not null and not exists (
    select 1 from public.school_academic_years
    where id = p_academic_year_id and business_id = v_business_id
  ) then
    raise exception 'Academic year does not belong to this school';
  end if;

  if p_movement_type = 'graduation' then
    v_new_status := 'graduated';
  elsif p_movement_type = 'transfer' then
    v_new_status := 'transferred';
  elsif p_movement_type = 'withdrawal' then
    v_new_status := 'inactive';
  else
    v_new_status := 'active';
  end if;

  insert into public.school_student_movements (
    business_id, student_id, movement_type, from_class_id, to_class_id,
    academic_year_id, effective_date, reason, recorded_by
  ) values (
    v_business_id, p_student_id, p_movement_type, v_from_class_id,
    case when p_movement_type in ('graduation','transfer','withdrawal') then null else p_to_class_id end,
    p_academic_year_id, coalesce(p_effective_date,current_date), nullif(trim(p_reason),''), auth.uid()
  ) returning id into v_movement_id;

  update public.school_students
  set class_id = case
        when p_movement_type in ('graduation','transfer','withdrawal') then null
        else p_to_class_id
      end,
      status = v_new_status,
      updated_at = now()
  where id = p_student_id and business_id = v_business_id;

  return v_movement_id;
end;
$$;

revoke all on function public.school_record_student_movement(uuid,text,uuid,uuid,date,text) from public, anon;
grant execute on function public.school_record_student_movement(uuid,text,uuid,uuid,date,text) to authenticated;

commit;
