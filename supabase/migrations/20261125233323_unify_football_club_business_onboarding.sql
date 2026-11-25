-- Unified SME and football-club application submission and approval.
begin;
alter table public.platform_business_applications
  add column if not exists application_kind text not null default 'business',
  add column if not exists special_application_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='platform_business_applications_application_kind_check' and conrelid='public.platform_business_applications'::regclass) then
    alter table public.platform_business_applications add constraint platform_business_applications_application_kind_check check (application_kind in ('business','football_club'));
  end if;
  if not exists (select 1 from pg_constraint where conname='platform_business_applications_special_application_id_fkey' and conrelid='public.platform_business_applications'::regclass) then
    alter table public.platform_business_applications add constraint platform_business_applications_special_application_id_fkey foreign key (special_application_id) references public.football_club_applications(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='platform_business_applications_special_application_id_key' and conrelid='public.platform_business_applications'::regclass) then
    alter table public.platform_business_applications add constraint platform_business_applications_special_application_id_key unique (special_application_id);
  end if;
end $$;
CREATE OR REPLACE FUNCTION app_private.get_platform_club_applications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id,'applicant_user_id',a.applicant_user_id,'applicant_email',u.email,
      'email_confirmed',u.email_confirmed_at is not null,
      'official_club_name',a.official_club_name,'short_name',a.short_name,'club_type',a.club_type,
      'country',a.country,'district',a.district,'city',a.city,'competition_name',a.competition_name,
      'home_ground',a.home_ground,'club_registration_body',a.club_registration_body,
      'club_registration_number',a.club_registration_number,'manager_full_name',a.manager_full_name,
      'manager_role',a.manager_role,'contact_email',a.contact_email,'contact_phone',a.contact_phone,
      'official_website_url',a.official_website_url,'proposed_website_slug',a.proposed_website_slug,
      'authority_statement',a.authority_statement,'evidence_reference',a.evidence_reference,
      'evidence_path',a.evidence_path,'additional_notes',a.additional_notes,
      'status',a.status,'developer_note',a.developer_note,'business_id',a.business_id,
      'website_id',a.website_id,'created_at',a.created_at,'reviewed_at',a.reviewed_at
    ) order by a.created_at desc
  ),'[]'::jsonb) into v_rows
  from public.football_club_applications a
  join auth.users u on u.id=a.applicant_user_id
  where a.status in ('submitted','in_review','needs_information')
    and not exists (
      select 1 from public.platform_business_applications p
      where p.special_application_id=a.id
    );
  return v_rows;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_my_platform_business_application()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select (to_jsonb(a) - 'user_id' - 'reviewed_by')
    || jsonb_build_object(
      'club_details',case when f.id is null then null
        else to_jsonb(f) - 'applicant_user_id' - 'reviewed_by' - 'evidence_path' end
    )
  into v_row
  from public.platform_business_applications a
  left join public.football_club_applications f on f.id=a.special_application_id
  where a.user_id=auth.uid();
  return coalesce(v_row,'{}'::jsonb);
end;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_pending_business_applications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id,'user_id',a.user_id,'email',u.email,'full_name',a.full_name,'phone',a.phone,
      'business_name',a.business_name,'industry_group',a.industry_group,'business_type',a.business_type,
      'currency_code',a.currency_code,'contact_email',a.contact_email,'contact_phone',a.contact_phone,
      'country',a.country,'address',a.address,'website',a.website,
      'tax_registration_number',a.tax_registration_number,'notes',a.notes,'status',a.status,
      'review_note',a.review_note,'created_at',a.created_at,
      'application_kind',a.application_kind,'special_application_id',a.special_application_id,
      'club_details',case when f.id is null then null else jsonb_build_object(
        'id',f.id,'official_club_name',f.official_club_name,'short_name',f.short_name,
        'club_type',f.club_type,'country',f.country,'district',f.district,'city',f.city,
        'competition_name',f.competition_name,'home_ground',f.home_ground,
        'club_registration_body',f.club_registration_body,'club_registration_number',f.club_registration_number,
        'manager_full_name',f.manager_full_name,'manager_role',f.manager_role,
        'contact_email',f.contact_email,'contact_phone',f.contact_phone,
        'official_website_url',f.official_website_url,'proposed_website_slug',f.proposed_website_slug,
        'authority_statement',f.authority_statement,'evidence_reference',f.evidence_reference,
        'evidence_path',f.evidence_path,'additional_notes',f.additional_notes
      ) end
    ) order by a.created_at asc
  ),'[]'::jsonb)
  into v_rows
  from public.platform_business_applications a
  join auth.users u on u.id=a.user_id
  left join public.football_club_applications f on f.id=a.special_application_id
  where a.status in ('pending','needs_information') and u.email_confirmed_at is not null;
  return v_rows;
end;
$function$


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
  v_club_result jsonb;
  v_club_slug text;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  if p_decision not in ('approve','reject','needs_information') then raise exception 'Invalid review decision'; end if;
  select * into v_app from public.platform_business_applications where id=p_application_id for update;
  if not found then raise exception 'Business application not found'; end if;
  if v_app.status='approved' or v_app.business_id is not null then raise exception 'This application has already been provisioned'; end if;
  select u.email_confirmed_at into v_email_confirmed from auth.users u where u.id=v_app.user_id;
  if v_email_confirmed is null then raise exception 'Customer email must be verified before approval'; end if;

  if exists(select 1 from public.business_members m where m.user_id=v_app.user_id and m.is_active) then
    raise exception 'This customer already has an active business workspace; no second workspace was created';
  end if;

  if v_app.application_kind='football_club' then
    if v_app.special_application_id is null then raise exception 'The football club application details are missing'; end if;
    select proposed_website_slug into v_club_slug
    from public.football_club_applications where id=v_app.special_application_id;
    if p_decision<>'approve' then
      v_club_result := app_private.review_football_club_application(
        v_app.special_application_id,
        case when p_decision='needs_information' then 'request_information' else 'reject' end,
        p_review_note,
        v_club_slug
      );
      update public.platform_business_applications
        set status=p_decision,review_note=left(coalesce(p_review_note,''),2000),
            reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
      where id=p_application_id;
      return jsonb_build_object('status',p_decision,'application_kind','football_club','business_id',null);
    end if;

    v_club_result := app_private.review_football_club_application(
      v_app.special_application_id,'approve',p_review_note,v_club_slug
    );
    v_business_id := nullif(v_club_result->>'business_id','')::uuid;
    if v_business_id is null then raise exception 'The football club workspace could not be provisioned'; end if;
    update public.platform_business_applications
      set status='approved',review_note=left(coalesce(p_review_note,''),2000),
          reviewed_by=auth.uid(),reviewed_at=now(),business_id=v_business_id,updated_at=now()
    where id=p_application_id;
    return v_club_result || jsonb_build_object(
      'status','approved','application_id',p_application_id,
      'application_kind','football_club','business_name',v_app.business_name,
      'owner_user_id',v_app.user_id
    );
  end if;

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
  values(v_business_id,auth.uid(),
    case when v_trial_granted then 'free_trial_started' else 'free_trial_not_available' end,
    jsonb_build_object('plan_code','professional','trial_days',case when v_trial_granted then 7 else 0 end,
      'trial_ends_at',case when v_trial_granted then v_trial_end else null end,
      'payment_required_at_signup',not v_trial_granted,'trial_policy','one_per_account',
      'provisioned_by','platform_business_application'));

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
    set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),
        review_note=left(coalesce(p_review_note,''),2000),updated_at=now()
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
$function$


CREATE OR REPLACE FUNCTION public.submit_platform_business_application_unified(p_full_name text, p_phone text, p_business_name text, p_industry_group text, p_business_type text, p_currency_code text DEFAULT 'SLE'::text, p_contact_email text DEFAULT ''::text, p_contact_phone text DEFAULT ''::text, p_country text DEFAULT 'Sierra Leone'::text, p_address text DEFAULT ''::text, p_website text DEFAULT ''::text, p_tax_registration_number text DEFAULT ''::text, p_notes text DEFAULT ''::text, p_application_kind text DEFAULT 'business'::text, p_special_application_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_verified boolean;
  v_status text;
  v_id uuid;
  v_kind text := lower(trim(coalesce(p_application_kind,'business')));
  v_special_id uuid;
  v_special_status text;
  v_special_payload jsonb := coalesce(p_special_application_data,'{}'::jsonb);
  v_name text := trim(coalesce(p_business_name,''));
  v_industry text := trim(coalesce(p_industry_group,''));
  v_type text := trim(coalesce(p_business_type,''));
  v_currency text := upper(trim(coalesce(p_currency_code,'SLE')));
  v_existing_kind text;
begin
  if v_user is null then raise exception 'Sign in before submitting a business application'; end if;
  if public.is_platform_developer() then raise exception 'The developer account does not submit customer business applications'; end if;
  if v_kind not in ('business','football_club') then raise exception 'Choose a valid application type'; end if;
  select u.email_confirmed_at is not null into v_verified from auth.users u where u.id=v_user;
  if not coalesce(v_verified,false) then raise exception 'Confirm your email address before submitting an application'; end if;
  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'Enter the owner or authorised representative name'; end if;
  if length(v_name) < 2 then raise exception 'Enter a valid business or club name'; end if;
  if length(v_industry) < 2 or length(v_type) < 2 then raise exception 'Select an industry and business type'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code'; end if;
  if exists(select 1 from public.business_members m where m.user_id=v_user and m.is_active) then
    raise exception 'This account already has an active business workspace';
  end if;

  select a.status,a.application_kind into v_status,v_existing_kind
  from public.platform_business_applications a where a.user_id=v_user for update;
  if v_status='approved' then raise exception 'A business application has already been approved for this account'; end if;
  if v_status in ('pending','needs_information') and v_existing_kind is not null and v_existing_kind<>v_kind
     and exists(select 1 from public.platform_business_applications a where a.user_id=v_user and a.special_application_id is not null) then
    raise exception 'The application type cannot be changed after a football club application has been submitted';
  end if;

  if v_kind='football_club' then
    if jsonb_typeof(v_special_payload)<>'object' then raise exception 'Club application details must be a JSON object'; end if;
    v_special_payload := v_special_payload || jsonb_build_object(
      'official_club_name',coalesce(nullif(trim(v_special_payload->>'official_club_name'),''),v_name),
      'manager_full_name',coalesce(nullif(trim(v_special_payload->>'manager_full_name'),''),trim(coalesce(p_full_name,''))),
      'contact_email',coalesce(nullif(trim(v_special_payload->>'contact_email'),''),nullif(trim(coalesce(p_contact_email,'')),''),(select lower(email) from auth.users where id=v_user)),
      'contact_phone',coalesce(nullif(trim(v_special_payload->>'contact_phone'),''),trim(coalesce(p_contact_phone,'')),trim(coalesce(p_phone,''))),
      'country',coalesce(nullif(trim(v_special_payload->>'country'),''),nullif(trim(coalesce(p_country,'')),'Sierra Leone'),'Sierra Leone'),
      'proposed_website_slug',coalesce(nullif(trim(v_special_payload->>'proposed_website_slug'),''),v_name)
    );
    if length(trim(coalesce(v_special_payload->>'official_club_name',''))) < 2 then raise exception 'Enter the official club name'; end if;
    if length(trim(coalesce(v_special_payload->>'manager_full_name',''))) < 2 then raise exception 'Enter the club manager name'; end if;
    if length(trim(coalesce(v_special_payload->>'manager_role',''))) < 2 then raise exception 'Enter the manager role at the club'; end if;
    if length(trim(coalesce(v_special_payload->>'contact_email',''))) < 5 then raise exception 'Enter the club contact email'; end if;
    if length(trim(coalesce(v_special_payload->>'contact_phone',''))) < 6 then raise exception 'Enter the club contact phone'; end if;
    if length(trim(coalesce(v_special_payload->>'authority_statement',''))) < 30 then raise exception 'Explain your authority to represent the club (at least 30 characters)'; end if;

    select a.id,a.status into v_special_id,v_special_status
    from public.football_club_applications a
    where a.applicant_user_id=v_user
      and a.status in ('submitted','in_review','needs_information')
    order by a.created_at desc limit 1 for update;

    if v_special_id is not null then
      if v_special_status='needs_information' then
        perform app_private.update_my_football_club_application(v_special_id,v_special_payload);
      end if;
    else
      v_special_id := app_private.submit_football_club_application(v_special_payload);
    end if;
    v_name := trim(coalesce(v_special_payload->>'official_club_name',v_name));
    v_industry := 'Sports and local league management';
    v_type := 'Football club';
    v_currency := 'SLE';
  end if;

  insert into public.platform_business_applications(
    user_id,full_name,phone,business_name,industry_group,business_type,currency_code,
    contact_email,contact_phone,country,address,website,tax_registration_number,notes,
    status,review_note,reviewed_by,reviewed_at,updated_at,application_kind,special_application_id
  ) values (
    v_user,trim(p_full_name),trim(coalesce(p_phone,'')),v_name,v_industry,v_type,v_currency,
    lower(trim(coalesce(p_contact_email,''))),trim(coalesce(p_contact_phone,'')),
    trim(coalesce(p_country,'Sierra Leone')),trim(coalesce(p_address,'')),
    trim(coalesce(p_website,'')),trim(coalesce(p_tax_registration_number,'')),trim(coalesce(p_notes,'')),
    'pending','',null,null,now(),v_kind,v_special_id
  )
  on conflict(user_id) do update set
    full_name=excluded.full_name,phone=excluded.phone,business_name=excluded.business_name,
    industry_group=excluded.industry_group,business_type=excluded.business_type,
    currency_code=excluded.currency_code,contact_email=excluded.contact_email,
    contact_phone=excluded.contact_phone,country=excluded.country,address=excluded.address,
    website=excluded.website,tax_registration_number=excluded.tax_registration_number,
    notes=excluded.notes,status='pending',review_note='',reviewed_by=null,reviewed_at=null,
    application_kind=excluded.application_kind,special_application_id=excluded.special_application_id,updated_at=now()
  where public.platform_business_applications.status in ('rejected','needs_information','pending')
  returning id,status into v_id,v_status;

  if v_id is null then raise exception 'This application cannot be changed in its current status'; end if;

  insert into public.profiles(id,full_name,phone,updated_at)
  values(v_user,trim(p_full_name),nullif(trim(coalesce(p_phone,'')),''),now())
  on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,updated_at=now();

  return jsonb_build_object(
    'application_id',v_id,
    'status',v_status,
    'application_kind',v_kind,
    'football_club_application_id',v_special_id,
    'message','Application submitted for developer review'
  );
end;
$function$

revoke all on function public.submit_platform_business_application_unified(text,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_platform_business_application_unified(text,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) to authenticated;
revoke all on function public.get_my_platform_business_application() from public,anon;
grant execute on function public.get_my_platform_business_application() to authenticated;
revoke all on function public.get_platform_pending_business_applications() from public,anon;
grant execute on function public.get_platform_pending_business_applications() to authenticated;
revoke all on function public.review_platform_business_application(uuid,text,text) from public,anon;
grant execute on function public.review_platform_business_application(uuid,text,text) to authenticated;
revoke all on function app_private.get_platform_club_applications() from public,anon,authenticated;
grant execute on function app_private.get_platform_club_applications() to postgres,service_role;
commit;
