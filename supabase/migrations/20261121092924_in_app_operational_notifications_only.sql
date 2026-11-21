-- In-app operational notifications for Koroma Leone Tech SME Business OS.

-- External email, SMS, and WhatsApp dispatch is intentionally disabled.

BEGIN;

UPDATE public.notification_channel_preferences SET email_enabled=false,sms_enabled=false,whatsapp_enabled=false,email_consent_at=null,sms_consent_at=null,whatsapp_consent_at=null,updated_at=now();

DO $disable_dispatch$ DECLARE v_job record; BEGIN IF to_regclass('cron.job') IS NOT NULL THEN FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='koroma-notification-dispatch' LOOP PERFORM cron.alter_job(v_job.jobid,NULL,NULL,NULL,NULL,false); END LOOP; END IF; END; $disable_dispatch$;

CREATE OR REPLACE FUNCTION public.kl_notify_branch_inventory_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
  v_reorder numeric;
  v_crossed_low boolean := false;
  v_replenished boolean := false;
begin
  select p.name, p.reorder_level
    into v_name, v_reorder
  from public.products p
  where p.id = new.product_id
    and p.business_id = new.business_id
    and p.is_active is true;

  if not found or coalesce(v_reorder,0) <= 0 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_crossed_low := new.quantity_on_hand <= v_reorder;
  else
    v_crossed_low := old.quantity_on_hand > v_reorder and new.quantity_on_hand <= v_reorder;
    v_replenished := old.quantity_on_hand <= v_reorder and new.quantity_on_hand > v_reorder;
  end if;

  if v_crossed_low then
    perform public.kl_notify_business_roles(
      new.business_id,
      'inventory',
      'Low stock: ' || coalesce(v_name,'Product'),
      coalesce(v_name,'A product') || ' has ' || new.quantity_on_hand::text ||
        ' units on hand, at or below its reorder level of ' || v_reorder::text || '.',
      'inventory',
      'low-stock:' || new.branch_id::text || ':' || new.product_id::text || ':' ||
        to_char(clock_timestamp() at time zone 'UTC','YYYYMMDDHH24MISSUS'),
      array['admin','manager','storekeeper']::text[],
      auth.uid()
    );
  elsif v_replenished then
    perform public.kl_notify_business_roles(
      new.business_id,
      'inventory',
      'Stock replenished: ' || coalesce(v_name,'Product'),
      coalesce(v_name,'A product') || ' is now above its reorder level with ' ||
        new.quantity_on_hand::text || ' units on hand.',
      'inventory',
      'stock-replenished:' || new.branch_id::text || ':' || new.product_id::text || ':' ||
        to_char(clock_timestamp() at time zone 'UTC','YYYYMMDDHH24MISSUS'),
      array['admin','manager','storekeeper']::text[],
      auth.uid()
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kl_notify_branch_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.kl_notify_business_roles(
        new.business_id,
        'inventory',
        'Branch stock transfer requested',
        'A stock transfer request (' || right(new.id::text,8) || ') is awaiting review.',
        'inventory',
        'branch-transfer-request:' || new.id::text,
        array['admin','manager','storekeeper']::text[],
        new.requested_by
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.requested_by is not null then
    insert into public.business_notifications
      (recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    values
      (new.requested_by,new.business_id,'inventory','Branch transfer updated',
       'Your branch stock transfer (' || right(new.id::text,8) || ') is now ' ||
         replace(new.status,'_',' ') ||
         coalesce(case when nullif(new.decision_note,'') is not null then '. Note: ' || left(new.decision_note,700) else '' end,'') || '.',
       'inventory',
       'branch-transfer-status:' || new.id::text || ':' || new.status)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kl_notify_business_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.kl_notify_business_roles(
        new.business_id,
        'approvals',
        'Approval required: ' || new.title,
        coalesce(nullif(new.description,''), 'A business operation is waiting for approval.'),
        'actions',
        'approval-request:' || new.id::text,
        array['admin','manager']::text[],
        new.requested_by
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.requested_by is not null then
    insert into public.business_notifications
      (recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
    values
      (new.requested_by,new.business_id,'approvals',
       case when new.status = 'approved' then 'Approval granted'
            when new.status = 'rejected' then 'Approval declined'
            else 'Approval request updated' end,
       'Your request "' || new.title || '" is now ' || replace(new.status,'_',' ') ||
         coalesce(case when nullif(new.review_note,'') is not null then '. Reviewer note: ' || left(new.review_note,700) else '' end,'') || '.',
       'actions',
       'approval-decision:' || new.id::text || ':' || new.status)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kl_notify_business_roles(p_business_id uuid, p_category text, p_title text, p_body text, p_action_page text, p_dedupe_key text, p_roles text[], p_exclude_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_inserted integer := 0;
begin
  if p_business_id is null or nullif(p_dedupe_key, '') is null then
    return 0;
  end if;

  with recipients as (
    select b.owner_user_id as user_id
    from public.businesses b
    where b.id = p_business_id
      and b.owner_user_id is not null

    union

    select bm.user_id
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.is_active is true
      and bm.role::text = any(coalesce(p_roles, array[]::text[]))
  ),
  inserted as (
    insert into public.business_notifications
      (recipient_user_id, business_id, category, title, body, action_page, dedupe_key)
    select r.user_id, p_business_id, coalesce(nullif(p_category,''),'system'),
           left(coalesce(nullif(p_title,''),'Business update'), 180),
           left(coalesce(p_body,''), 2000),
           coalesce(nullif(p_action_page,''),'dashboard'),
           p_dedupe_key || ':' || r.user_id::text
    from recipients r
    where r.user_id is not null
      and r.user_id is distinct from p_exclude_user_id
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return v_inserted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kl_notify_delivery_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb := to_jsonb(new);
  v_status text;
  v_tracking text;
  v_title text;
begin
  v_status := coalesce(nullif(v->>'delivery_status',''), 'created');
  v_tracking := coalesce(nullif(v->>'tracking_code',''), right(new.id::text,8));

  if tg_op = 'UPDATE' and coalesce(to_jsonb(old)->>'delivery_status','') = coalesce(v->>'delivery_status','') then
    return new;
  end if;

  v_title := case when tg_op='INSERT' then 'New delivery job created' else 'Delivery status updated' end;
  perform public.kl_notify_business_roles(
    new.business_id,
    'delivery',
    v_title,
    'Delivery ' || v_tracking || ' is ' || replace(v_status,'_',' ') || '.',
    'sales',
    'delivery:' || new.id::text || ':' || v_status,
    array['admin','manager','cashier','storekeeper']::text[],
    auth.uid()
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kl_notify_online_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb := to_jsonb(new);
  v_order text;
  v_customer text;
begin
  v_order := coalesce(nullif(v->>'order_number',''), right(new.id::text,8));
  v_customer := coalesce(nullif(v->>'customer_name',''), 'Online customer');

  perform public.kl_notify_business_roles(
    new.business_id,
    'orders',
    'New online order received',
    'Order ' || v_order || ' from ' || v_customer || ' is awaiting review.',
    'sales',
    'online-order:' || tg_table_name || ':' || new.id::text,
    array['admin','manager','cashier','storekeeper']::text[],
    auth.uid()
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kl_notify_online_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb := to_jsonb(new);
  o jsonb := to_jsonb(old);
  v_order text;
  v_status text;
  v_payment text;
begin
  if coalesce(v->>'order_status','') = coalesce(o->>'order_status','')
     and coalesce(v->>'payment_status','') = coalesce(o->>'payment_status','') then
    return new;
  end if;

  v_order := coalesce(nullif(v->>'order_number',''), right(new.id::text,8));
  v_status := coalesce(nullif(v->>'order_status',''), 'updated');
  v_payment := coalesce(nullif(v->>'payment_status',''), 'not recorded');

  perform public.kl_notify_business_roles(
    new.business_id,
    'orders',
    'Online order updated',
    'Order ' || v_order || ' now has order status ' || replace(v_status,'_',' ') ||
      ' and payment status ' || replace(v_payment,'_',' ') || '.',
    'sales',
    'online-order-status:' || tg_table_name || ':' || new.id::text || ':' || v_status || ':' || v_payment,
    array['admin','manager','cashier','storekeeper']::text[],
    auth.uid()
  );
  return new;
end;
$function$
;

DROP TRIGGER IF EXISTS kl_branch_inventory_level_notify ON public.branch_inventory;
CREATE TRIGGER kl_branch_inventory_level_notify AFTER INSERT OR UPDATE OF quantity_on_hand ON public.branch_inventory FOR EACH ROW EXECUTE FUNCTION kl_notify_branch_inventory_level();

DROP TRIGGER IF EXISTS kl_branch_transfer_notify ON public.branch_stock_transfers;
CREATE TRIGGER kl_branch_transfer_notify AFTER INSERT OR UPDATE OF status ON public.branch_stock_transfers FOR EACH ROW EXECUTE FUNCTION kl_notify_branch_transfer();

DROP TRIGGER IF EXISTS kl_business_approval_notify ON public.business_approval_requests;
CREATE TRIGGER kl_business_approval_notify AFTER INSERT OR UPDATE OF status ON public.business_approval_requests FOR EACH ROW EXECUTE FUNCTION kl_notify_business_approval();

DROP TRIGGER IF EXISTS kl_delivery_job_notify ON public.delivery_jobs;
CREATE TRIGGER kl_delivery_job_notify AFTER INSERT OR UPDATE OF delivery_status ON public.delivery_jobs FOR EACH ROW EXECUTE FUNCTION kl_notify_delivery_job();

DROP TRIGGER IF EXISTS kl_online_orders_notify_insert ON public.online_orders;
CREATE TRIGGER kl_online_orders_notify_insert AFTER INSERT ON public.online_orders FOR EACH ROW EXECUTE FUNCTION kl_notify_online_order_insert();

DROP TRIGGER IF EXISTS kl_online_orders_notify_status ON public.online_orders;
CREATE TRIGGER kl_online_orders_notify_status AFTER UPDATE OF order_status, payment_status ON public.online_orders FOR EACH ROW EXECUTE FUNCTION kl_notify_online_order_status();

DROP TRIGGER IF EXISTS kl_online_store_orders_notify_insert ON public.online_store_orders;
CREATE TRIGGER kl_online_store_orders_notify_insert AFTER INSERT ON public.online_store_orders FOR EACH ROW EXECUTE FUNCTION kl_notify_online_order_insert();

DROP TRIGGER IF EXISTS kl_online_store_orders_notify_status ON public.online_store_orders;
CREATE TRIGGER kl_online_store_orders_notify_status AFTER UPDATE OF order_status, payment_status ON public.online_store_orders FOR EACH ROW EXECUTE FUNCTION kl_notify_online_order_status();

REVOKE ALL ON FUNCTION public.kl_notify_business_roles(uuid,text,text,text,text,text,text[],uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kl_notify_online_order_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kl_notify_online_order_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kl_notify_business_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kl_notify_branch_transfer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kl_notify_branch_inventory_level() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kl_notify_delivery_job() FROM PUBLIC, anon, authenticated;

COMMIT;