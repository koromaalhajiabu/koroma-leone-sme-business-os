-- External subscription notification channels: opt-in preferences, private queue and delivery attempts.
begin;
create table if not exists public.notification_channel_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email_address text, phone_e164 text,
 email_enabled boolean not null default false,
 sms_enabled boolean not null default false,
 whatsapp_enabled boolean not null default false,
 email_consent_at timestamptz, sms_consent_at timestamptz, whatsapp_consent_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint notification_email_format check (email_address is null or email_address ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'),
 constraint notification_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
 constraint notification_email_consent check (not email_enabled or (email_address is not null and email_consent_at is not null)),
 constraint notification_sms_consent check (not sms_enabled or (phone_e164 is not null and sms_consent_at is not null)),
 constraint notification_whatsapp_consent check (not whatsapp_enabled or (phone_e164 is not null and whatsapp_consent_at is not null))
);
alter table public.notification_channel_preferences enable row level security;
revoke all on public.notification_channel_preferences from anon,public;
grant select,insert,update,delete on public.notification_channel_preferences to authenticated;
create policy notification_preferences_own on public.notification_channel_preferences for all to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create table if not exists public.notification_delivery_queue (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.business_notifications(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 channel text not null check(channel in ('email','sms','whatsapp')),
 destination text not null, message_title text not null, message_body text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','blocked')),
 attempt_count integer not null default 0 check(attempt_count>=0),
 next_attempt_at timestamptz not null default now(), provider_message_id text, last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 sent_at timestamptz, unique(notification_id,channel)
);
create index if not exists notification_delivery_due_idx on public.notification_delivery_queue(status,next_attempt_at,created_at) where status in ('queued','sending');
create table if not exists public.notification_delivery_attempts (
 id uuid primary key default gen_random_uuid(),
 queue_id uuid not null references public.notification_delivery_queue(id) on delete cascade,
 channel text not null, provider text not null,
 outcome text not null check(outcome in ('accepted','retry','failed','blocked')),
 provider_message_id text, response_code integer, response_excerpt text, created_at timestamptz not null default now()
);
create index if not exists notification_delivery_attempts_queue_idx on public.notification_delivery_attempts(queue_id,created_at desc);
alter table public.notification_delivery_queue enable row level security;
alter table public.notification_delivery_attempts enable row level security;
revoke all on public.notification_delivery_queue,public.notification_delivery_attempts from anon,authenticated,public;
grant all on public.notification_delivery_queue,public.notification_delivery_attempts to service_role;
create or replace function public.queue_external_business_notification()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare p record;
begin
 select * into p from public.notification_channel_preferences where user_id=new.recipient_user_id;
 if not found then return new; end if;
 if p.email_enabled and p.email_address is not null and p.email_consent_at is not null then
  insert into public.notification_delivery_queue(notification_id,recipient_user_id,channel,destination,message_title,message_body)
  values(new.id,new.recipient_user_id,'email',p.email_address,new.title,new.body) on conflict(notification_id,channel) do nothing;
 end if;
 if p.sms_enabled and p.phone_e164 is not null and p.sms_consent_at is not null then
  insert into public.notification_delivery_queue(notification_id,recipient_user_id,channel,destination,message_title,message_body)
  values(new.id,new.recipient_user_id,'sms',p.phone_e164,new.title,new.body) on conflict(notification_id,channel) do nothing;
 end if;
 if p.whatsapp_enabled and p.phone_e164 is not null and p.whatsapp_consent_at is not null then
  insert into public.notification_delivery_queue(notification_id,recipient_user_id,channel,destination,message_title,message_body)
  values(new.id,new.recipient_user_id,'whatsapp',p.phone_e164,new.title,new.body) on conflict(notification_id,channel) do nothing;
 end if;
 return new;
end;
$function$;
drop trigger if exists trg_queue_external_business_notification on public.business_notifications;
create trigger trg_queue_external_business_notification after insert on public.business_notifications for each row execute function public.queue_external_business_notification();
revoke all on function public.queue_external_business_notification() from public,anon,authenticated;
create or replace function public.claim_notification_delivery_batch(p_limit integer default 20)
returns table(id uuid,channel text,destination text,message_title text,message_body text,attempt_count integer)
language plpgsql security definer set search_path=''
as $function$
begin
 return query
 with picked as (
  select q.id from public.notification_delivery_queue q
  where q.status='queued' and q.next_attempt_at<=now() and q.attempt_count<5
  order by q.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
 ), claimed as (
  update public.notification_delivery_queue q set status='sending',attempt_count=q.attempt_count+1,updated_at=now()
  from picked where q.id=picked.id
  returning q.id,q.channel,q.destination,q.message_title,q.message_body,q.attempt_count
 )
 select * from claimed;
end;
$function$;
revoke all on function public.claim_notification_delivery_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_delivery_batch(integer) to service_role;
commit;