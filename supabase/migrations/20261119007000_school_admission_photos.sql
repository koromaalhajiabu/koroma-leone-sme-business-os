-- Store private applicant photographs for the admissions register.
begin;
alter table public.school_admissions
  add column if not exists photo_path text;
commit;
