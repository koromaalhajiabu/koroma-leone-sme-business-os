-- Sierra Leone school categories and education levels.
-- Additive schema change: existing school and business records are preserved.
begin;
alter table public.school_classes
  add column if not exists education_level text not null default 'primary';
alter table public.school_classes
  drop constraint if exists school_classes_education_level_check;
alter table public.school_classes
  add constraint school_classes_education_level_check
  check (education_level in ('nursery','primary','junior_secondary','senior_secondary'));

alter table public.school_curriculum_settings
  add column if not exists school_type text not null default 'private';
alter table public.school_curriculum_settings
  drop constraint if exists school_curriculum_settings_school_type_check;
alter table public.school_curriculum_settings
  add constraint school_curriculum_settings_school_type_check
  check (school_type in ('government','private','international'));
commit;
