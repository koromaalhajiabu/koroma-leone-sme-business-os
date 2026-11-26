-- Travel & Migration Desk: customer-visible case tracking and scheduled deadline reminders.
alter table public.travel_agency_case_history
  add column if not exists customer_visible boolean not null default false,
  add column if not exists customer_message text;

alter table public.travel_agency_deadlines
  add column if not exists customer_message text,
  add column if not exists reminder_sent_at timestamptz;

alter table public.travel_agency_applicants
  drop constraint if exists travel_agency_applicants_status_check,
  add constraint travel_agency_applicants_status_check
    check (status = any (array[
      'inquiry','document_collection','application_submitted','interview_scheduled',
      'visa_approved','travel_booked','departed','on_hold','rejected','withdrawn','completed'
    ]));

create index if not exists travel_case_history_customer_timeline_idx
  on public.travel_agency_case_history (business_id, applicant_id, created_at desc)
  where customer_visible = true;

create index if not exists travel_deadlines_reminder_due_idx
  on public.travel_agency_deadlines (reminder_at)
  where status = 'open' and reminder_sent_at is null and reminder_at is not null;

grant select on public.travel_agency_case_history to authenticated;

drop policy if exists travel_case_history_applicant_visible_read on public.travel_agency_case_history;
create policy travel_case_history_applicant_visible_read
  on public.travel_agency_case_history
  for select to authenticated
  using (
    customer_visible = true
    and exists (
      select 1
      from public.travel_agency_applicants a
      where a.id = travel_agency_case_history.applicant_id
        and a.business_id = travel_agency_case_history.business_id
        and a.portal_user_id = (select auth.uid())
    )
  );

create or replace function public.generate_travel_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  sent_count integer := 0;
  reminder_body text;
begin
  for item in
    select d.id, d.business_id, d.applicant_id, d.title, d.due_at,
           d.customer_message, a.portal_user_id
    from public.travel_agency_deadlines d
    join public.travel_agency_applicants a
      on a.id = d.applicant_id and a.business_id = d.business_id
    where d.status = 'open'
      and d.reminder_at is not null
      and d.reminder_at <= now()
      and d.reminder_sent_at is null
      and a.portal_user_id is not null
    order by d.reminder_at
    for update of d skip locked
  loop
    reminder_body := coalesce(
      nullif(btrim(item.customer_message), ''),
      'A case action is due: ' || item.title
    ) || ' · Due ' ||
      to_char(item.due_at at time zone 'Africa/Freetown', 'DD Mon YYYY HH24:MI');

    insert into public.travel_agency_notifications
      (business_id, applicant_id, recipient_user_id, title, body, notification_type)
    values
      (item.business_id, item.applicant_id, item.portal_user_id,
       'Travel case reminder', reminder_body, 'deadline_reminder');

    update public.travel_agency_deadlines
      set reminder_sent_at = now(), updated_at = now()
      where id = item.id;

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke all on function public.generate_travel_deadline_reminders() from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'travel-case-deadline-reminders'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'travel-case-deadline-reminders',
    '*/5 * * * *',
    'select public.generate_travel_deadline_reminders();'
  );
end;
$$;
