-- Match customer onboarding module provisioning to the canonical platform industry categories.
begin;
CREATE OR REPLACE FUNCTION public.review_platform_business_application(p_application_id uuid, p_decision text, p_review_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app public.platform_business_applications%rowtype;
  v_email_confirmed timestamptz;
  v_business_id uuid;
  v_trial_start timestamptz := now();
  v_trial_end timestamptz := now() + interval '7 days';
  v_trial_claimed_user uuid;
  v_trial_granted boolean := false;
  v_currency text;
  v_modules text[];
  v_module text;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  if p_decision not in ('approve','reject','needs_information') then raise exception 'Invalid review decision'; end if;
  select * into v_app from public.platform_business_applications where id=p_application_id for update;
  if not found then raise exception 'Business application not found'; end if;
  if v_app.status='approved' or v_app.business_id is not null then raise exception 'This application has already been provisioned'; end if;
  select u.email_confirmed_at into v_email_confirmed from auth.users u where u.id=v_app.user_id;
  if v_email_confirmed is null then raise exception 'Customer email must be verified before approval'; end if;

  if p_decision <> 'approve' then
    update public.platform_business_applications
      set status=p_decision,review_note=left(coalesce(p_review_note,''),2000),
          reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
      where id=p_application_id;
    if p_decision='reject' then
      update public.platform_customer_approvals
        set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),
            review_note=left(coalesce(p_review_note,''),2000),updated_at=now()
        where user_id=v_app.user_id;
    end if;
    return jsonb_build_object('status',p_decision,'business_id',null);
  end if;

  if exists(select 1 from public.business_members m where m.user_id=v_app.user_id and m.is_active) then
    raise exception 'This customer already has an active business workspace; no second workspace was created';
  end if;
  if not exists(select 1 from public.subscription_plans where code='professional' and is_active=true) then
    raise exception 'The Professional subscription plan is unavailable';
  end if;

  insert into public.businesses(
    name,industry,currency_code,owner_user_id,contact_email,contact_phone,address,website,tax_registration_number
  ) values (
    v_app.business_name,v_app.business_type,v_app.currency_code,v_app.user_id,
    nullif(v_app.contact_email,''),nullif(v_app.contact_phone,''),nullif(v_app.address,''),
    nullif(v_app.website,''),nullif(v_app.tax_registration_number,'')
  ) returning id into v_business_id;

  insert into public.business_members(business_id,user_id,role)
  values(v_business_id,v_app.user_id,'owner');
  insert into public.branches(business_id,name,address)
  values(v_business_id,'Main Branch',nullif(v_app.address,''));

  insert into public.platform_trial_claims(user_id,first_business_id,claimed_at,trial_ends_at)
  values(v_app.user_id,v_business_id,v_trial_start,v_trial_end)
  on conflict(user_id) do nothing
  returning user_id into v_trial_claimed_user;
  v_trial_granted := v_trial_claimed_user is not null;
  v_currency := case when v_app.currency_code='USD' then 'USD' else 'SLE' end;

  insert into public.business_subscriptions(
    business_id,plan_code,status,currency_code,billing_cycle,current_period_start,
    current_period_end,trial_ends_at,grace_until,created_at,updated_at
  ) values (
    v_business_id,'professional',case when v_trial_granted then 'trial' else 'pending_payment' end,
    v_currency,'monthly',case when v_trial_granted then v_trial_start else null end,
    case when v_trial_granted then v_trial_end else null end,
    case when v_trial_granted then v_trial_end else null end,null,v_trial_start,v_trial_start
  );

  insert into public.subscription_events(business_id,actor_user_id,event_type,details)
  values(
    v_business_id,auth.uid(),
    case when v_trial_granted then 'free_trial_started' else 'free_trial_not_available' end,
    jsonb_build_object('plan_code','professional','trial_days',case when v_trial_granted then 7 else 0 end,
      'trial_ends_at',case when v_trial_granted then v_trial_end else null end,
      'payment_required_at_signup',not v_trial_granted,'trial_policy','one_per_account',
      'provisioned_by','platform_business_application')
  );

  v_modules := case lower(v_app.industry_group)
    when 'retail and trading' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting']
    when 'food, hospitality and entertainment' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','restaurant','appointments']
    when 'hospitals and healthcare facilities' then array['core','hospital','healthcare','pharmacy','appointments','employees','accounting','compliance']
    when 'healthcare and pharmaceutical' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','pharmacy','healthcare','compliance']
    when 'automotive and transport' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','transport','fleet','services']
    when 'construction and industrial' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','manufacturing','projects']
    when 'professional and personal services' then array['core','sales_pos','customers','suppliers','expenses','employees','accounting','services','appointments','projects']
    when 'education and training' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','school']
    when 'agriculture and fisheries' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','manufacturing']
    when 'property and rental' then array['core','customers','suppliers','expenses','accounting','property','projects','services']
    when 'financial and administrative services' then array['core','customers','expenses','employees','accounting','compliance','services']
    when 'sports and local league management' then array['core','sports_league','expenses','employees','accounting','customers','suppliers']
    else array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','services','projects']
  end;

  foreach v_module in array v_modules loop
    insert into public.business_industry_modules(business_id,module_key,is_enabled,updated_by)
    values(v_business_id,v_module,true,auth.uid())
    on conflict(business_id,module_key) do update
      set is_enabled=true,updated_by=auth.uid(),updated_at=now();
  end loop;

  insert into public.audit_logs(business_id,action,entity_table,entity_id)
  values(v_business_id,'business_workspace_provisioned','businesses',v_business_id::text);

  update public.platform_customer_approvals
    set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(coalesce(p_review_note,''),2000),updated_at=now()
    where user_id=v_app.user_id;
  if not found then
    insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note)
    values(v_app.user_id,'approved',auth.uid(),now(),left(coalesce(p_review_note,''),2000));
  end if;

  update public.platform_business_applications
    set status='approved',review_note=left(coalesce(p_review_note,''),2000),
        reviewed_by=auth.uid(),reviewed_at=now(),business_id=v_business_id,updated_at=now()
    where id=p_application_id;

  return jsonb_build_object('status','approved','business_id',v_business_id,
    'business_name',v_app.business_name,'owner_user_id',v_app.user_id,
    'subscription_status',case when v_trial_granted then 'trial' else 'pending_payment' end,
    'trial_ends_at',case when v_trial_granted then v_trial_end else null end);
end;
$function$;
commit;
