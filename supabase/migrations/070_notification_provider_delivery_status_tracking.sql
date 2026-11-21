begin;
alter table public.notification_delivery_queue add column if not exists delivery_status text not null default 'queued', add column if not exists provider_status_at timestamptz;
alter table public.notification_delivery_queue drop constraint if exists notification_delivery_queue_delivery_status_check;
alter table public.notification_delivery_queue add constraint notification_delivery_queue_delivery_status_check check(delivery_status in ('queued','accepted','delivered','delayed','undelivered','bounced','complained','failed'));
create index if not exists notification_delivery_provider_id_idx on public.notification_delivery_queue(provider_message_id) where provider_message_id is not null;
commit;