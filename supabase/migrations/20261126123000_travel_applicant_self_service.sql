-- Travel & Migration Desk: secure applicant self-service portal.
create table if not exists public.travel_agency_portal_invites (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 applicant_id uuid not null references public.travel_agency_applicants(id) on delete cascade,
 email text not null, token_hash text not null unique, expires_at timestamptz not null,
 used_at timestamptz, created_by uuid not null, created_at timestamptz not null default now()
);
create index if not exists travel_portal_invites_applicant_idx on public.travel_agency_portal_invites(applicant_id);
create table if not exists public.travel_agency_messages (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 applicant_id uuid not null references public.travel_agency_applicants(id) on delete cascade,
 sender_user_id uuid not null, sender_type text not null check(sender_type in ('staff','applicant')),
 message text not null check(length(trim(message)) between 1 and 5000),
 created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists travel_agency_messages_case_idx on public.travel_agency_messages(business_id,applicant_id,created_at);
create table if not exists public.travel_agency_appointments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 applicant_id uuid not null references public.travel_agency_applicants(id) on delete cascade,
 title text not null, appointment_at timestamptz not null, location text, meeting_url text, notes text,
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled','rescheduled')),
 created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists travel_agency_appointments_case_idx on public.travel_agency_appointments(business_id,applicant_id,appointment_at);
create table if not exists public.travel_agency_notifications (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 applicant_id uuid references public.travel_agency_applicants(id) on delete cascade,
 recipient_user_id uuid not null, title text not null, body text not null,
 notification_type text not null default 'case_update', read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists travel_agency_notifications_user_idx on public.travel_agency_notifications(recipient_user_id,created_at desc);

alter table public.travel_agency_portal_invites enable row level security;
alter table public.travel_agency_messages enable row level security;
alter table public.travel_agency_appointments enable row level security;
alter table public.travel_agency_notifications enable row level security;
grant select,insert,update,delete on public.travel_agency_portal_invites to authenticated;
grant select,insert,update,delete on public.travel_agency_messages to authenticated;
grant select,insert,update,delete on public.travel_agency_appointments to authenticated;
grant select,insert,update on public.travel_agency_notifications to authenticated;

drop policy if exists travel_portal_invites_manager_all on public.travel_agency_portal_invites;
create policy travel_portal_invites_manager_all on public.travel_agency_portal_invites for all to authenticated
 using(public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]))
 with check(public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]));

drop policy if exists travel_messages_staff_read on public.travel_agency_messages;
create policy travel_messages_staff_read on public.travel_agency_messages for select to authenticated using(public.is_business_member(business_id));
drop policy if exists travel_messages_applicant_read on public.travel_agency_messages;
create policy travel_messages_applicant_read on public.travel_agency_messages for select to authenticated
 using(exists(select 1 from public.travel_agency_applicants a where a.id=travel_agency_messages.applicant_id and a.business_id=travel_agency_messages.business_id and a.portal_user_id=(select auth.uid())));
drop policy if exists travel_messages_staff_insert on public.travel_agency_messages;
create policy travel_messages_staff_insert on public.travel_agency_messages for insert to authenticated
 with check(sender_type='staff' and sender_user_id=(select auth.uid()) and public.is_business_member(business_id));
drop policy if exists travel_messages_applicant_insert on public.travel_agency_messages;
create policy travel_messages_applicant_insert on public.travel_agency_messages for insert to authenticated
 with check(sender_type='applicant' and sender_user_id=(select auth.uid()) and exists(select 1 from public.travel_agency_applicants a where a.id=travel_agency_messages.applicant_id and a.business_id=travel_agency_messages.business_id and a.portal_user_id=(select auth.uid())));
drop policy if exists travel_messages_staff_update on public.travel_agency_messages;
create policy travel_messages_staff_update on public.travel_agency_messages for update to authenticated
 using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));

drop policy if exists travel_appointments_staff_read on public.travel_agency_appointments;
create policy travel_appointments_staff_read on public.travel_agency_appointments for select to authenticated using(public.is_business_member(business_id));
drop policy if exists travel_appointments_applicant_read on public.travel_agency_appointments;
create policy travel_appointments_applicant_read on public.travel_agency_appointments for select to authenticated
 using(exists(select 1 from public.travel_agency_applicants a where a.id=travel_agency_appointments.applicant_id and a.business_id=travel_agency_appointments.business_id and a.portal_user_id=(select auth.uid())));
drop policy if exists travel_appointments_manager_write on public.travel_agency_appointments;
create policy travel_appointments_manager_write on public.travel_agency_appointments for all to authenticated
 using(public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]))
 with check(public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]));

drop policy if exists travel_notifications_recipient_read on public.travel_agency_notifications;
create policy travel_notifications_recipient_read on public.travel_agency_notifications for select to authenticated using(recipient_user_id=(select auth.uid()));
drop policy if exists travel_notifications_recipient_update on public.travel_agency_notifications;
create policy travel_notifications_recipient_update on public.travel_agency_notifications for update to authenticated
 using(recipient_user_id=(select auth.uid())) with check(recipient_user_id=(select auth.uid()));
drop policy if exists travel_notifications_manager_insert on public.travel_agency_notifications;
create policy travel_notifications_manager_insert on public.travel_agency_notifications for insert to authenticated
 with check(public.has_business_role(business_id,array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]));
revoke update on public.travel_agency_notifications from authenticated;
grant update(read_at) on public.travel_agency_notifications to authenticated;

drop policy if exists travel_documents_applicant_upload on public.travel_agency_documents;
create policy travel_documents_applicant_upload on public.travel_agency_documents for insert to authenticated
 with check(uploaded_by=(select auth.uid()) and applicant_visible=false and document_status='submitted'
 and exists(select 1 from public.travel_agency_applicants a where a.id=travel_agency_documents.applicant_id and a.business_id=travel_agency_documents.business_id and a.portal_user_id=(select auth.uid())));
drop policy if exists travel_documents_applicant_read on public.travel_agency_documents;
create policy travel_documents_applicant_read on public.travel_agency_documents for select to authenticated
 using((applicant_visible=true or uploaded_by=(select auth.uid()))
 and exists(select 1 from public.travel_agency_applicants a where a.id=travel_agency_documents.applicant_id and a.business_id=travel_agency_documents.business_id and a.portal_user_id=(select auth.uid())));

drop policy if exists travel_storage_applicant_upload on storage.objects;
create policy travel_storage_applicant_upload on storage.objects for insert to authenticated
 with check(bucket_id='travel-agency-private' and exists(
  select 1 from public.travel_agency_applicants a
  where a.business_id::text=split_part(storage.objects.name,'/',1)
  and a.id::text=split_part(storage.objects.name,'/',2) and a.portal_user_id=(select auth.uid())
 ));
drop policy if exists travel_storage_applicant_read on storage.objects;
create policy travel_storage_applicant_read on storage.objects for select to authenticated
 using(bucket_id='travel-agency-private' and exists(
  select 1 from public.travel_agency_documents d
  join public.travel_agency_applicants a on a.id=d.applicant_id and a.business_id=d.business_id
  where d.storage_path=storage.objects.name and a.portal_user_id=(select auth.uid())
  and (d.applicant_visible=true or d.uploaded_by=(select auth.uid()))
 ));

create or replace function public.queue_travel_applicant_email()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_notification_id uuid; v_destination text;
begin
 insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
 values(new.recipient_user_id,new.business_id,'travel_case',new.title,new.body,'travel-agency','travel:'||new.id::text)
 on conflict(dedupe_key) do nothing;
 select id into v_notification_id from public.business_notifications where dedupe_key='travel:'||new.id::text limit 1;
 select email_address into v_destination from public.notification_channel_preferences
 where user_id=new.recipient_user_id and email_enabled=true and email_consent_at is not null and email_address is not null limit 1;
 if v_destination is not null and v_notification_id is not null then
  insert into public.notification_delivery_queue(notification_id,recipient_user_id,channel,destination,message_title,message_body,status,delivery_status)
  values(v_notification_id,new.recipient_user_id,'email',v_destination,new.title,new.body,'queued','queued') on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.queue_travel_applicant_email() from public,anon,authenticated;
drop trigger if exists travel_applicant_notification_dispatch on public.travel_agency_notifications;
create trigger travel_applicant_notification_dispatch after insert on public.travel_agency_notifications
for each row execute function public.queue_travel_applicant_email();

create or replace function public.notify_travel_case_assignee_on_message()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_assignee uuid;
begin
 if new.sender_type<>'applicant' then return new; end if;
 select assigned_agent into v_assignee from public.travel_agency_applicants where id=new.applicant_id and business_id=new.business_id;
 if v_assignee is not null then
  insert into public.travel_agency_notifications(business_id,applicant_id,recipient_user_id,title,body,notification_type)
  values(new.business_id,new.applicant_id,v_assignee,'New applicant message',left(new.message,240),'message');
 end if;
 return new;
end; $$;
revoke all on function public.notify_travel_case_assignee_on_message() from public,anon,authenticated;
drop trigger if exists travel_case_message_notify_assignee on public.travel_agency_messages;
create trigger travel_case_message_notify_assignee after insert on public.travel_agency_messages
for each row execute function public.notify_travel_case_assignee_on_message();
