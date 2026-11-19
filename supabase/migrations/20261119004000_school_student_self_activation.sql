-- Automatic student self-activation using one-time admission activation codes.
-- Additive only: existing student records and portal data functions are preserved.
begin;

alter table public.school_students
  add column if not exists portal_activation_code text;

-- Issue a unique code to every existing student who has not yet activated a portal account.
update public.school_students
set portal_activation_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where user_id is null
  and (portal_activation_code is null or btrim(portal_activation_code) = '');

-- Every newly enrolled student automatically receives an activation code.
alter table public.school_students
  alter column portal_activation_code
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

-- Activated accounts no longer retain a usable activation code.
update public.school_students
set portal_activation_code = null
where user_id is not null;

create unique index if not exists school_students_portal_activation_code_unique
  on public.school_students(portal_activation_code)
  where portal_activation_code is not null;

create index if not exists school_students_portal_activation_lookup
  on public.school_students(business_id, admission_number)
  where status = 'active';

commit;
