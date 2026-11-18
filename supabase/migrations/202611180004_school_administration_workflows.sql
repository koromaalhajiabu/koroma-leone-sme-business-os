-- White Lion School Management: administration workflow foundation
-- Additive only. Existing school records are preserved.
-- Run in Supabase SQL Editor after the earlier school migrations.

begin;

create table if not exists public.school_admissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  application_number text not null,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text check (gender is null or gender in ('female','male','other','prefer_not_to_say')),
  applying_for_level text not null check (applying_for_level in ('nursery','primary','junior_secondary','senior_secondary')),
  applying_for_class text,
  guardian_name text not null,
  guardian_phone text not null,
  guardian_email text,
  previous_school text,
  application_date date not null default current_date,
  status text not null default 'submitted' check (status in ('submitted','under_review','assessment','accepted','waitlisted','rejected','enrolled')),
  decision_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  enrolled_student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, application_number),
  unique (id,business_id),
  foreign key (enrolled_student_id,business_id) references public.school_students(id,business_id) on delete restrict
);

create table if not exists public.school_guardian_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_id uuid not null,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null default 'parent',
  is_primary boolean not null default false,
  can_view_attendance boolean not null default true,
  can_view_results boolean not null default true,
  can_view_fees boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id,student_id,guardian_user_id),
  unique (id,business_id),
  foreign key (student_id,business_id) references public.school_students(id,business_id) on delete cascade
);

create table if not exists public.school_report_cards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_id uuid not null,
  academic_year_id uuid,
  term_id uuid,
  report_title text not null,
  overall_score numeric(8,2),
  overall_grade text,
  class_position integer,
  teacher_comment text,
  principal_comment text,
  attendance_summary jsonb not null default '{}'::jsonb,
  subject_results jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  published_at timestamptz,
  prepared_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (student_id,business_id) references public.school_students(id,business_id) on delete cascade,
  foreign key (academic_year_id,business_id) references public.school_academic_years(id,business_id) on delete restrict,
  foreign key (term_id,business_id) references public.school_terms(id,business_id) on delete restrict
);

create table if not exists public.school_safeguarding_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  case_reference text not null,
  student_id uuid,
  reported_by uuid default auth.uid() references auth.users(id),
  assigned_to uuid references auth.users(id),
  category text not null check (category in ('wellbeing','bullying','safety','attendance_concern','disclosure','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','investigating','referred','resolved','closed')),
  incident_date date,
  summary text not null,
  restricted_notes text,
  action_taken text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,case_reference),
  unique (id,business_id),
  foreign key (student_id,business_id) references public.school_students(id,business_id) on delete restrict
);

create table if not exists public.school_parent_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_id uuid not null,
  sender_user_id uuid not null default auth.uid() references auth.users(id),
  recipient_user_id uuid not null references auth.users(id),
  subject text not null,
  message text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (student_id,business_id) references public.school_students(id,business_id) on delete cascade
);

create index if not exists school_admissions_business_status_idx on public.school_admissions(business_id,status,application_date desc);
create index if not exists school_guardian_links_user_idx on public.school_guardian_links(business_id,guardian_user_id,is_active);
create index if not exists school_report_cards_student_idx on public.school_report_cards(business_id,student_id,created_at desc);
create index if not exists school_safeguarding_cases_status_idx on public.school_safeguarding_cases(business_id,status,priority,created_at desc);
create index if not exists school_parent_messages_recipient_idx on public.school_parent_messages(business_id,recipient_user_id,sent_at desc);

alter table public.school_admissions enable row level security;
alter table public.school_guardian_links enable row level security;
alter table public.school_report_cards enable row level security;
alter table public.school_safeguarding_cases enable row level security;
alter table public.school_parent_messages enable row level security;

-- Admissions and safeguarding are restricted to school management roles.
drop policy if exists school_admissions_management on public.school_admissions;
create policy school_admissions_management on public.school_admissions
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
  with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

drop policy if exists school_guardian_links_management on public.school_guardian_links;
create policy school_guardian_links_management on public.school_guardian_links
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
  with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

drop policy if exists school_guardian_links_self_read on public.school_guardian_links;
create policy school_guardian_links_self_read on public.school_guardian_links
  for select to authenticated
  using (guardian_user_id = auth.uid() and is_active);

drop policy if exists school_report_cards_management on public.school_report_cards;
create policy school_report_cards_management on public.school_report_cards
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
  with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

drop policy if exists school_report_cards_guardian_read on public.school_report_cards;
create policy school_report_cards_guardian_read on public.school_report_cards
  for select to authenticated
  using (
    published = true and exists (
      select 1 from public.school_guardian_links gl
      where gl.business_id = school_report_cards.business_id
        and gl.student_id = school_report_cards.student_id
        and gl.guardian_user_id = auth.uid()
        and gl.is_active and gl.can_view_results
    )
  );

drop policy if exists school_safeguarding_management on public.school_safeguarding_cases;
create policy school_safeguarding_management on public.school_safeguarding_cases
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
  with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

drop policy if exists school_parent_messages_participant_read on public.school_parent_messages;
create policy school_parent_messages_participant_read on public.school_parent_messages
  for select to authenticated
  using (
    sender_user_id = auth.uid() or recipient_user_id = auth.uid()
  );

drop policy if exists school_parent_messages_management_insert on public.school_parent_messages;
create policy school_parent_messages_management_insert on public.school_parent_messages
  for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and (
      public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
      or exists (
        select 1 from public.school_guardian_links gl
        where gl.business_id = school_parent_messages.business_id
          and gl.student_id = school_parent_messages.student_id
          and gl.guardian_user_id = auth.uid()
          and gl.is_active
      )
    )
  );

grant select,insert,update,delete on public.school_admissions,public.school_guardian_links,public.school_report_cards,public.school_safeguarding_cases,public.school_parent_messages to authenticated;

-- Keep invoice status aligned with receipts and prevent overpayment.
create or replace function public.school_recalculate_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_total numeric(18,2);
  v_paid numeric(18,2);
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;
  select amount into v_total
  from public.school_fee_invoices
  where id = v_invoice_id;

  if v_total is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select coalesce(sum(amount),0) into v_paid
  from public.school_fee_payments
  where invoice_id = v_invoice_id;

  if v_paid > v_total then
    raise exception 'Payment exceeds the outstanding invoice balance';
  end if;

  update public.school_fee_invoices
  set status = case
    when v_paid = 0 then 'unpaid'
    when v_paid < v_total then 'part_paid'
    else 'paid'
  end
  where id = v_invoice_id;

  return coalesce(new,old);
end;
$$;

drop trigger if exists school_fee_payment_status_sync on public.school_fee_payments;
create trigger school_fee_payment_status_sync
after insert or update or delete on public.school_fee_payments
for each row execute function public.school_recalculate_invoice_status();

commit;
