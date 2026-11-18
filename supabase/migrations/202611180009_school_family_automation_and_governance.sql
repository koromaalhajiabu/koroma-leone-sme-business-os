-- White Lion School Management: family invitations, automated alerts and audit trail
-- Additive migration. Keeps existing school records and tenant boundaries intact.

begin;

-- Remove the one-off repair trigger created during portal provisioning checks;
-- keep the canonical trigger from migration 008 to avoid duplicate provisioning.
drop trigger if exists trg_provision_school_parent_portal on public.business_industry_modules;

create table if not exists public.school_parent_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_id uuid not null,
  guardian_email text,
  guardian_phone text,
  relationship text not null default 'parent',
  invite_code uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (student_id,business_id)
    references public.school_students(id,business_id) on delete cascade,
  check (guardian_email is not null or guardian_phone is not null)
);

create index if not exists school_parent_invitations_business_student_idx
  on public.school_parent_invitations(business_id,student_id,created_at desc);

alter table public.school_parent_invitations enable row level security;

drop policy if exists school_parent_invitations_management on public.school_parent_invitations;
create policy school_parent_invitations_management
  on public.school_parent_invitations
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]))
  with check (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

grant select, insert, update on public.school_parent_invitations to authenticated;

-- A parent redeems a school-issued invitation after signing in.
-- Email invitations must be redeemed by an account with the matching email.
create or replace function public.school_redeem_parent_invitation(p_invite_code uuid)
returns table (business_id uuid, student_id uuid, guardian_link_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.school_parent_invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_email text;
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception 'Please sign in before accepting this invitation.';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = v_user_id;

  select * into v_invitation
  from public.school_parent_invitations
  where invite_code = p_invite_code
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This invitation is invalid, expired or already used.';
  end if;

  if v_invitation.guardian_email is not null
     and lower(v_invitation.guardian_email) <> coalesce(v_email,'') then
    raise exception 'Sign in with the email address that received this invitation.';
  end if;

  insert into public.school_guardian_links (
    business_id, student_id, guardian_user_id, relationship, is_primary,
    can_view_attendance, can_view_results, can_view_fees, is_active
  )
  values (
    v_invitation.business_id, v_invitation.student_id, v_user_id,
    v_invitation.relationship, false, true, true, true, true
  )
  on conflict (business_id,student_id,guardian_user_id)
  do update set
    relationship = excluded.relationship,
    is_active = true
  returning id into v_link_id;

  update public.school_parent_invitations
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invitation.id;

  return query select v_invitation.business_id, v_invitation.student_id, v_link_id;
end;
$$;

revoke all on function public.school_redeem_parent_invitation(uuid) from public;
grant execute on function public.school_redeem_parent_invitation(uuid) to authenticated;

-- Let each guardian read only notifications addressed to their own account.
drop policy if exists school_notifications_guardian_read on public.school_notifications;
create policy school_notifications_guardian_read
  on public.school_notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists school_notifications_guardian_update on public.school_notifications;
create policy school_notifications_guardian_update
  on public.school_notifications
  for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

grant select, update on public.school_notifications to authenticated;

-- Notify linked guardians when attendance is marked absent or late.
create or replace function public.school_notify_guardians_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_name text;
begin
  if new.status not in ('absent','late') then
    return new;
  end if;

  select concat_ws(' ',first_name,last_name) into v_student_name
  from public.school_students
  where id = new.student_id and business_id = new.business_id;

  insert into public.school_notifications (
    business_id, recipient_user_id, title, message, channel, sent_at
  )
  select
    gl.business_id,
    gl.guardian_user_id,
    case when new.status = 'absent' then 'Student absence recorded' else 'Student marked late' end,
    coalesce(v_student_name,'Your child') || ' was marked ' || new.status ||
      ' on ' || to_char(new.attendance_date,'DD Mon YYYY') || '.',
    'in_app',
    now()
  from public.school_guardian_links gl
  where gl.business_id = new.business_id
    and gl.student_id = new.student_id
    and gl.is_active
    and gl.can_view_attendance;

  return new;
end;
$$;

drop trigger if exists school_attendance_guardian_notification on public.school_attendance;
create trigger school_attendance_guardian_notification
after insert or update of status on public.school_attendance
for each row
when (new.status in ('absent','late'))
execute function public.school_notify_guardians_attendance();

-- Notify linked guardians when a report card is published.
create or replace function public.school_notify_guardians_report_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_name text;
begin
  if new.published is not true or (tg_op = 'UPDATE' and old.published is true) then
    return new;
  end if;

  select concat_ws(' ',first_name,last_name) into v_student_name
  from public.school_students
  where id = new.student_id and business_id = new.business_id;

  insert into public.school_notifications (
    business_id, recipient_user_id, title, message, channel, sent_at
  )
  select
    gl.business_id,
    gl.guardian_user_id,
    'New report card available',
    'A new report card for ' || coalesce(v_student_name,'your child') || ' is now available in the parent portal.',
    'in_app',
    now()
  from public.school_guardian_links gl
  where gl.business_id = new.business_id
    and gl.student_id = new.student_id
    and gl.is_active
    and gl.can_view_results;

  return new;
end;
$$;

drop trigger if exists school_report_card_guardian_notification on public.school_report_cards;
create trigger school_report_card_guardian_notification
after insert or update of published on public.school_report_cards
for each row
when (new.published = true)
execute function public.school_notify_guardians_report_card();


-- Notify linked guardians when a fee invoice is issued.
create or replace function public.school_notify_guardians_fee_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_name text;
begin
  select concat_ws(' ',first_name,last_name) into v_student_name
  from public.school_students
  where id = new.student_id and business_id = new.business_id;

  insert into public.school_notifications (
    business_id, recipient_user_id, title, message, channel, sent_at
  )
  select
    gl.business_id, gl.guardian_user_id, 'New school fee invoice',
    'A fee invoice (' || new.invoice_number || ') for ' ||
      coalesce(v_student_name,'your child') || ' has been issued. Amount: SLE ' ||
      to_char(new.amount,'FM999,999,990.00') || '.',
    'in_app', now()
  from public.school_guardian_links gl
  where gl.business_id = new.business_id
    and gl.student_id = new.student_id
    and gl.is_active and gl.can_view_fees;

  return new;
end;
$$;
drop trigger if exists school_fee_invoice_guardian_notification on public.school_fee_invoices;
create trigger school_fee_invoice_guardian_notification
after insert on public.school_fee_invoices
for each row execute function public.school_notify_guardians_fee_invoice();

-- Notify linked guardians when a fee payment is recorded.
create or replace function public.school_notify_guardians_fee_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_name text;
  v_invoice_number text;
begin
  select inv.student_id, inv.invoice_number,
         concat_ws(' ',st.first_name,st.last_name)
  into v_student_id, v_invoice_number, v_student_name
  from public.school_fee_invoices inv
  join public.school_students st
    on st.id = inv.student_id and st.business_id = inv.business_id
  where inv.id = new.invoice_id and inv.business_id = new.business_id;

  if v_student_id is null then return new; end if;

  insert into public.school_notifications (
    business_id, recipient_user_id, title, message, channel, sent_at
  )
  select
    gl.business_id, gl.guardian_user_id, 'School fee payment received',
    'A payment of SLE ' || to_char(new.amount,'FM999,999,990.00') ||
      ' has been recorded for ' || coalesce(v_student_name,'your child') ||
      ' (invoice ' || coalesce(v_invoice_number,'') || '). Receipt: ' || new.receipt_number || '.',
    'in_app', now()
  from public.school_guardian_links gl
  where gl.business_id = new.business_id
    and gl.student_id = v_student_id
    and gl.is_active and gl.can_view_fees;

  return new;
end;
$$;
drop trigger if exists school_fee_payment_guardian_notification on public.school_fee_payments;
create trigger school_fee_payment_guardian_notification
after insert on public.school_fee_payments
for each row execute function public.school_notify_guardians_fee_payment();

-- Notify linked guardians when a new examination result is entered.
create or replace function public.school_notify_guardians_exam_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_title text;
  v_student_name text;
begin
  select ex.title, concat_ws(' ',st.first_name,st.last_name)
  into v_exam_title, v_student_name
  from public.school_exams ex
  join public.school_students st
    on st.id = new.student_id and st.business_id = new.business_id
  where ex.id = new.exam_id and ex.business_id = new.business_id;

  insert into public.school_notifications (
    business_id, recipient_user_id, title, message, channel, sent_at
  )
  select
    gl.business_id, gl.guardian_user_id, 'Examination result updated',
    'A result for ' || coalesce(v_student_name,'your child') ||
      ' in ' || coalesce(v_exam_title,'an examination') ||
      ' has been recorded. Sign in to the parent portal to view it.',
    'in_app', now()
  from public.school_guardian_links gl
  where gl.business_id = new.business_id
    and gl.student_id = new.student_id
    and gl.is_active and gl.can_view_results;

  return new;
end;
$$;
drop trigger if exists school_exam_result_guardian_notification on public.school_exam_results;
create trigger school_exam_result_guardian_notification
after insert or update of score, remarks on public.school_exam_results
for each row execute function public.school_notify_guardians_exam_result();

-- School managers can inspect the school-specific audit trail.
alter table public.school_audit_events enable row level security;
drop policy if exists school_audit_events_management_read on public.school_audit_events;
create policy school_audit_events_management_read
  on public.school_audit_events
  for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[]));

-- Record material changes to sensitive school records.
create or replace function public.school_write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_entity_id uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_business_id := new.business_id;
    v_entity_id := new.id;
    v_action := 'insert';
    v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_business_id := new.business_id;
    v_entity_id := new.id;
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  else
    v_business_id := old.business_id;
    v_entity_id := old.id;
    v_action := 'delete';
    v_before := to_jsonb(old);
  end if;

  insert into public.school_audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    v_business_id, auth.uid(), v_action, tg_table_name, v_entity_id, v_before, v_after
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'school_students','school_guardian_links','school_attendance',
    'school_fee_invoices','school_fee_payments','school_exam_results',
    'school_report_cards','school_staff','school_staff_attendance',
    'school_assignments','school_assignment_submissions'
  ] loop
    execute format('drop trigger if exists school_audit_change on public.%I',v_table);
    execute format(
      'create trigger school_audit_change after insert or update or delete on public.%I for each row execute function public.school_write_audit_event()',
      v_table
    );
  end loop;
end $$;

commit;
