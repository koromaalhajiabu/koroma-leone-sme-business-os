-- Notify the newly provisioned owner in-app and disable the obsolete approval-only RPC.
begin;
revoke all on function public.set_platform_customer_approval(uuid,boolean,text) from public, anon, authenticated, service_role;

create or replace function public.notify_customer_business_workspace_ready()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='approved' and old.status is distinct from 'approved' and new.business_id is not null then
    insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    values(new.user_id,new.business_id,'platform','Your business workspace is ready',
      'Your business application has been approved. Sign in to Koroma Leone Tech SME Business OS to open your workspace.',
      'dashboard','business-workspace-ready:'||new.id::text)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_customer_business_workspace_ready on public.platform_business_applications;
create trigger trg_notify_customer_business_workspace_ready
after update of status on public.platform_business_applications
for each row execute function public.notify_customer_business_workspace_ready();
commit;