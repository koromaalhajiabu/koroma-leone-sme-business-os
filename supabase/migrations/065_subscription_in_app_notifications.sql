-- Subscription in-app notifications: owner-scoped, idempotent and scheduled.
begin;

create table if not exists public.business_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  category text not null default 'subscription',
  title text not null,
  body text not null,
  action_page text not null default 'billing',
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists business_notifications_recipient_created_idx
  on public.business_notifications(recipient_user_id, created_at desc);
create index if not exists business_notifications_unread_idx
  on public.business_notifications(recipient_user_id, read_at)
  where read_at is null;

alter table public.business_notifications enable row level security;
revoke all on public.business_notifications from anon, public;
grant select, update on public.business_notifications to authenticated;

drop policy if exists business_notifications_read_own on public.business_notifications;
create policy business_notifications_read_own
  on public.business_notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

drop policy if exists business_notifications_update_own on public.business_notifications;
create policy business_notifications_update_own
  on public.business_notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

create or replace function public.generate_subscription_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_due integer := 0;
  v_overdue integer := 0;
  v_events integer := 0;
begin
  -- Renewal reminders: one notice per owner, business and threshold.
  with targets as (
    select b.id as business_id, b.owner_user_id,
           b.name as business_name, s.current_period_end::date as period_end,
           (s.current_period_end::date - current_date) as days_left
    from public.business_subscriptions s
    join public.businesses b on b.id = s.business_id
    where s.subscription_exempt is not true
      and s.status in ('active','trial','grace_period')
      and s.current_period_end is not null
      and b.owner_user_id is not null
      and (s.current_period_end::date - current_date) in (7,3,1)
  ), inserted as (
    insert into public.business_notifications
      (recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    select owner_user_id,business_id,'subscription',
      'Subscription renewal approaching',
      business_name || ': your subscription period ends in ' || days_left || ' day(s). Review your plan and renewal invoice.',
      'billing',
      'renewal:' || business_id::text || ':' || period_end::text || ':' || days_left::text
    from targets
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_due from inserted;

  -- Overdue unpaid invoices: one reminder for each invoice.
  with targets as (
    select i.id,i.business_id,b.owner_user_id,b.name,i.invoice_number,
           i.due_at::date as due_date,i.amount_due,i.currency_code
    from public.subscription_invoices i
    join public.businesses b on b.id=i.business_id
    where i.status='pending' and i.due_at is not null
      and i.due_at < now() and b.owner_user_id is not null
      and not exists (
        select 1 from public.business_subscriptions s
        where s.business_id=i.business_id and s.subscription_exempt is true
      )
  ), inserted as (
    insert into public.business_notifications
      (recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    select owner_user_id,business_id,'payment',
      'Subscription invoice overdue',
      business_name || ': invoice ' || invoice_number || ' is overdue. Submit payment details after paying, or contact support if you need help.',
      'billing',
      'invoice-overdue:' || id::text
    from targets
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_overdue from inserted;

  -- Convert important subscription lifecycle events into owner notifications.
  with targets as (
    select e.id,e.business_id,b.owner_user_id,b.name,e.event_type,e.details,e.created_at
    from public.subscription_events e
    join public.businesses b on b.id=e.business_id
    where e.event_type in ('payment_verified','subscription_grace_started','subscription_expired')
      and e.created_at >= now() - interval '30 days'
      and b.owner_user_id is not null
      and not exists (
        select 1 from public.business_subscriptions s
        where s.business_id=e.business_id and s.subscription_exempt is true
      )
  ), inserted as (
    insert into public.business_notifications
      (recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    select owner_user_id,business_id,
      case when event_type='payment_verified' then 'payment' else 'subscription' end,
      case event_type
        when 'payment_verified' then 'Payment verified'
        when 'subscription_grace_started' then 'Subscription grace period started'
        else 'Subscription expired'
      end,
      case event_type
        when 'payment_verified' then business_name || ': your subscription payment has been verified and your plan activated.'
        when 'subscription_grace_started' then business_name || ': your subscription has entered its seven-day grace period. Renew to avoid interruption.'
        else business_name || ': your subscription has expired. Open Plans & Billing to restore access after payment verification.'
      end,
      'billing',
      'subscription-event:' || id::text
    from targets
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_events from inserted;

  return jsonb_build_object(
    'renewal_reminders_created',v_due,
    'overdue_invoice_reminders_created',v_overdue,
    'lifecycle_notifications_created',v_events,
    'processed_at',now()
  );
end;
$function$;

revoke all on function public.generate_subscription_notifications() from public, anon, authenticated;
grant execute on function public.generate_subscription_notifications() to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='koroma-subscription-notifications';
    perform cron.schedule(
      'koroma-subscription-notifications',
      '15 0 * * *',
      'select public.generate_subscription_notifications()'
    );
  end if;
end;
$cron$;

commit;