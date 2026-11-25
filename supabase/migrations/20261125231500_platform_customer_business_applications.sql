-- Customer business applications with developer-approved, customer-owned workspace provisioning.
-- Existing workspaces and subscriptions are preserved. New approvals create a workspace for the applicant,
-- not for the developer reviewing the application.

begin;

create table if not exists public.platform_business_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  representative_role text not null default 'Owner / Proprietor',
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  business_type text not null,
  contact_email text not null,
  contact_phone text not null default '',
  country text not null default 'Sierra Leone',
  district text not null default '',
  city text not null default '',
  street_address text not null default '',
  website text not null default '',
  currency_code text not null default 'SLE' check (currency_code ~ '^[A-Z]{3}$'),
  business_description text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted','in_review','needs_information','approved','rejected')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  business_id uuid references public.businesses(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_business_applications is
  'Private customer business applications. Customers submit and read only their own application through guarded RPCs; the platform developer reviews and provisions workspaces.';
alter table public.platform_business_applications enable row level security;
revoke all on public.platform_business_applications from public, anon, authenticated;
create index if not exists idx_platform_business_applications_status_submitted
  on public.platform_business_applications(status, submitted_at desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.platform_recommended_business_modules(p_business_type text)
returns text[]
language sql
immutable
set search_path = ''
as $function$
  select case
    when lower(btrim(coalesce(p_business_type,''))) in (
      'supermarket','mini-market','grocery shop','provision store','wholesale shop','retail store',
      'boutique / clothing shop','shoe shop','electronics shop','mobile phone shop',
      'computer and accessories shop','furniture shop','building materials shop','hardware store',
      'paint shop','electrical supply shop','plumbing supply shop','automotive spare-parts shop',
      'agricultural supply shop','stationery and bookshop'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'restaurant','fast-food outlet','cafeteria','bakery','pastry shop','bar or lounge','hotel',
      'guesthouse','lodge','catering business','ice cream or beverage shop','event and entertainment business'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','restaurant','appointments']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'hospital / general hospital','specialist hospital','clinic / health centre','medical centre',
      'diagnostic / laboratory centre','maternity clinic','dental clinic'
    ) then array['core','hospital','healthcare','pharmacy','appointments','employees','accounting','compliance']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'pharmacy','medical supply store','medical equipment supplier','optical shop',
      'dental supply business','healthcare product retailer'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','pharmacy','healthcare','compliance']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'fuel station','car dealership','vehicle spare-parts dealer','auto repair workshop','tyre shop',
      'car wash business','vehicle rental company','transport and logistics company','delivery business'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','transport','fleet','services']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'construction company','building contractor','hardware wholesaler','cement distributor',
      'sand and gravel supplier','steel and iron merchant','furniture manufacturer','manufacturing company',
      'industrial equipment supplier','welding and fabrication workshop'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','manufacturing','projects']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'hair salon','barbershop','beauty salon','spa','laundry and dry-cleaning business','cleaning company',
      'security service company','repair and maintenance company','computer repair shop','printing business',
      'photography studio','consultancy firm','marketing and advertising agency'
    ) then array['core','sales_pos','customers','suppliers','expenses','employees','accounting','services','appointments','projects']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'school management system','training centre','vocational institution','computer training centre',
      'driving school','educational supply shop','bookshop and learning-material distributor'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','school']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'farm business','poultry farm','livestock business','fish farm','fishing supply business',
      'agricultural produce wholesaler','food processing business'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','manufacturing']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'real estate agency','property management company','equipment rental business','vehicle hire business',
      'event equipment rental company','property maintenance company'
    ) then array['core','customers','suppliers','expenses','accounting','property','projects','services']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'accounting and bookkeeping firm','insurance agency','microfinance business','cooperative society',
      'business administration service provider'
    ) then array['core','customers','expenses','employees','accounting','compliance','services']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'sports club / football club','sports academy','local / community league organiser',
      'league / competition organiser','sports association / federation','sports event organiser'
    ) then array['core','sports_league','expenses','employees','accounting','customers','suppliers']::text[]
    when lower(btrim(coalesce(p_business_type,''))) in (
      'general business','multi-industry business','other / not listed'
    ) then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','services','projects']::text[]
    else null
  end;
$function$;
revoke all on function private.platform_recommended_business_modules(text) from public, anon, authenticated;

create or replace function public.submit_platform_business_application(
  p_full_name text,
  p_representative_role text,
  p_business_name text,
  p_business_type text,
  p_contact_email text,
  p_contact_phone text,
  p_country text,
  p_district text,
  p_city text,
  p_street_address text,
  p_website text,
  p_currency_code text,
  p_business_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_status text;
  v_application_id uuid;
  v_currency text := upper(btrim(coalesce(p_currency_code,'SLE')));
  v_contact_email text := lower(btrim(coalesce(p_contact_email,'')));
begin
  if v_user_id is null then raise exception 'Sign in to submit a business application.'; end if;
  if public.is_platform_developer() then raise exception 'The developer workspace does not use customer business applications.'; end if;

  select u.email,u.email_confirmed_at into v_email,v_confirmed_at
  from auth.users u where u.id=v_user_id;
  if not found then raise exception 'Account not found.'; end if;
  if v_confirmed_at is null then raise exception 'Confirm your email address before submitting a business application.'; end if;

  if char_length(btrim(coalesce(p_full_name,''))) not between 2 and 120 then
    raise exception 'Enter the full name of the owner or authorised representative.';
  end if;
  if char_length(btrim(coalesce(p_business_name,''))) not between 2 and 120 then
    raise exception 'Enter a business name between 2 and 120 characters.';
  end if;
  if private.platform_recommended_business_modules(p_business_type) is null then
    raise exception 'Choose a business type from the supplied list.';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code.'; end if;
  if v_contact_email='' then v_contact_email:=lower(coalesce(v_email,'')); end if;
  if position('@' in v_contact_email)<2 then raise exception 'Enter a valid business contact email.'; end if;
  if char_length(coalesce(p_contact_phone,''))>40 then raise exception 'Business contact phone is too long.'; end if;

  if exists(select 1 from public.businesses b where b.owner_user_id=v_user_id) then
    raise exception 'This account already owns a business workspace. Contact the platform developer for help.';
  end if;

  select a.status into v_status
  from public.platform_business_applications a
  where a.user_id=v_user_id
  for update;

  if v_status='approved' then raise exception 'This business application has already been approved.'; end if;
  if v_status='in_review' then raise exception 'Your application is currently under review. Please wait for the review result.'; end if;

  insert into public.platform_business_applications(
    user_id,full_name,representative_role,business_name,business_type,
    contact_email,contact_phone,country,district,city,street_address,website,
    currency_code,business_description,status,review_note,reviewed_by,reviewed_at,submitted_at,updated_at
  ) values (
    v_user_id,btrim(p_full_name),coalesce(nullif(btrim(p_representative_role),''),'Owner / Proprietor'),
    btrim(p_business_name),btrim(p_business_type),v_contact_email,
    left(btrim(coalesce(p_contact_phone,'')),40),
    coalesce(nullif(btrim(p_country),''),'Sierra Leone'),
    left(btrim(coalesce(p_district,'')),100),left(btrim(coalesce(p_city,'')),100),
    left(btrim(coalesce(p_street_address,'')),500),left(btrim(coalesce(p_website,'')),300),
    v_currency,left(btrim(coalesce(p_business_description,'')),1200),
    'submitted','',null,null,now(),now()
  )
  on conflict(user_id) do update set
    full_name=excluded.full_name,
    representative_role=excluded.representative_role,
    business_name=excluded.business_name,
    business_type=excluded.business_type,
    contact_email=excluded.contact_email,
    contact_phone=excluded.contact_phone,
    country=excluded.country,
    district=excluded.district,
    city=excluded.city,
    street_address=excluded.street_address,
    website=excluded.website,
    currency_code=excluded.currency_code,
    business_description=excluded.business_description,
    status='submitted',
    review_note='',
    reviewed_by=null,
    reviewed_at=null,
    submitted_at=now(),
    updated_at=now()
  returning id into v_application_id;

  insert into public.platform_customer_approvals(user_id,status,created_at,updated_at)
  values(v_user_id,'pending',now(),now())
  on conflict(user_id) do update set
    status=case when public.platform_customer_approvals.status='rejected' then 'pending' else public.platform_customer_approvals.status end,
    reviewed_by=case when public.platform_customer_approvals.status='rejected' then null else public.platform_customer_approvals.reviewed_by end,
    reviewed_at=case when public.platform_customer_approvals.status='rejected' then null else public.platform_customer_approvals.reviewed_at end,
    review_note=case when public.platform_customer_approvals.status='rejected' then '' else public.platform_customer_approvals.review_note end,
    updated_at=now();

  return jsonb_build_object('success',true,'application_id',v_application_id,'status','submitted');
end;
$function$;

create or replace function public.get_my_platform_business_application()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Sign in required.'; end if;
  select to_jsonb(a) into v_result
  from public.platform_business_applications a
  where a.user_id=v_user_id;
  return v_result;
end;
$function$;

create or replace function public.get_platform_pending_customers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,
    'email',u.email,
    'full_name',coalesce(nullif(a.full_name,''),u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',''),
    'email_confirmed',u.email_confirmed_at is not null,
    'created_at',u.created_at,
    'status',coalesce(ca.status,'pending'),
    'business_application',case when a.id is null then null else jsonb_build_object(
      'id',a.id,
      'business_name',a.business_name,
      'business_type',a.business_type,
      'representative_role',a.representative_role,
      'contact_email',a.contact_email,
      'contact_phone',a.contact_phone,
      'country',a.country,
      'district',a.district,
      'city',a.city,
      'street_address',a.street_address,
      'website',a.website,
      'currency_code',a.currency_code,
      'business_description',a.business_description,
      'status',a.status,
      'review_note',a.review_note,
      'submitted_at',a.submitted_at
    ) end
  ) order by coalesce(a.submitted_at,u.created_at) desc),'[]'::jsonb)
  into v_rows
  from auth.users u
  left join public.platform_customer_approvals ca on ca.user_id=u.id
  left join public.platform_business_applications a on a.user_id=u.id
  where lower(coalesce(u.email,'')) <> 'koromaalhajiabu0@gmail.com'
    and coalesce(ca.status,'pending')='pending';
  return v_rows;
end;
$function$;

create or replace function public.review_platform_business_application(
  p_application_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app public.platform_business_applications%rowtype;
  v_user_email text;
  v_confirmed_at timestamptz;
  v_business_id uuid;
  v_modules text[];
  v_address text;
  v_trial_start timestamptz := now();
  v_trial_end timestamptz := now() + interval '7 days';
  v_trial_claimed_user uuid;
  v_trial_granted boolean := false;
  v_subscription_currency text;
  v_decision text := lower(btrim(coalesce(p_decision,'')));
  v_note text := left(btrim(coalesce(p_review_note,'')),1000);
begin
  if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  if v_decision not in ('approved','rejected','needs_information') then
    raise exception 'Choose approved, rejected or needs_information.';
  end if;

  select * into v_app
  from public.platform_business_applications
  where id=p_application_id
  for update;
  if not found then raise exception 'Business application not found.'; end if;
  if v_app.status not in ('submitted','needs_information') then
    raise exception 'This application is not awaiting a developer decision.';
  end if;

  select u.email,u.email_confirmed_at into v_user_email,v_confirmed_at
  from auth.users u where u.id=v_app.user_id;
  if not found then raise exception 'Applicant account no longer exists.'; end if;
  if v_confirmed_at is null then raise exception 'Applicant must confirm their email address first.'; end if;

  if v_decision='needs_information' then
    update public.platform_business_applications
    set status='needs_information',review_note=v_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=v_app.id;
    return jsonb_build_object('success',true,'status','needs_information','application_id',v_app.id);
  end if;

  if v_decision='rejected' then
    update public.platform_business_applications
    set status='rejected',review_note=v_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=v_app.id;
    insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note,updated_at)
    values(v_app.user_id,'rejected',auth.uid(),now(),coalesce(v_note,'Application rejected'),now())
    on conflict(user_id) do update set status='rejected',reviewed_by=excluded.reviewed_by,
      reviewed_at=excluded.reviewed_at,review_note=excluded.review_note,updated_at=now();
    return jsonb_build_object('success',true,'status','rejected','application_id',v_app.id);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_app.user_id::text,0));
  if exists(select 1 from public.businesses b where b.owner_user_id=v_app.user_id) then
    raise exception 'This applicant already owns a business workspace. No duplicate workspace was created.';
  end if;
  if not exists(select 1 from public.subscription_plans p where p.code='professional' and p.is_active=true) then
    raise exception 'The Professional subscription plan is unavailable; workspace creation was cancelled.';
  end if;

  v_modules:=private.platform_recommended_business_modules(v_app.business_type);
  if v_modules is null then raise exception 'The submitted business type is not supported for automatic module setup.'; end if;

  v_address:=nullif(concat_ws(', ',
    nullif(btrim(v_app.street_address),''),
    nullif(btrim(v_app.city),''),
    nullif(btrim(v_app.district),''),
    nullif(btrim(v_app.country),'')
  ),'');

  -- The owner_user_id is the applicant's authenticated account, not auth.uid() (the reviewing developer).
  insert into public.businesses(
    name,industry,currency_code,owner_user_id,contact_email,contact_phone,address,website
  ) values (
    v_app.business_name,v_app.business_type,v_app.currency_code,v_app.user_id,
    v_app.contact_email,nullif(v_app.contact_phone,''),v_address,nullif(v_app.website,'')
  ) returning id into v_business_id;

  insert into public.business_members(business_id,user_id,role,is_active,invited_by)
  values(v_business_id,v_app.user_id,'owner',true,auth.uid());

  insert into public.branches(business_id,name,address)
  values(v_business_id,'Main Branch',v_address);

  update public.business_industry_modules
  set is_enabled=(module_key=any(v_modules)),updated_by=auth.uid(),updated_at=now()
  where business_id=v_business_id;
  insert into public.business_industry_modules(business_id,module_key,is_enabled,updated_by)
  select v_business_id,unnest(v_modules),true,auth.uid()
  on conflict(business_id,module_key) do update
    set is_enabled=true,updated_by=auth.uid(),updated_at=now();

  insert into public.profiles(id,full_name,phone)
  values(v_app.user_id,v_app.full_name,nullif(v_app.contact_phone,''))
  on conflict(id) do update set
    full_name=excluded.full_name,
    phone=coalesce(excluded.phone,public.profiles.phone),
    updated_at=now();

  -- Match create_business(): one Professional trial per customer account, never per workspace.
  insert into public.platform_trial_claims(user_id,first_business_id,claimed_at,trial_ends_at)
  values(v_app.user_id,v_business_id,v_trial_start,v_trial_end)
  on conflict(user_id) do nothing
  returning user_id into v_trial_claimed_user;
  v_trial_granted:=v_trial_claimed_user is not null;
  v_subscription_currency:=case when v_app.currency_code='USD' then 'USD' else 'SLE' end;

  if v_trial_granted then
    insert into public.business_subscriptions(
      business_id,plan_code,status,currency_code,billing_cycle,
      current_period_start,current_period_end,trial_ends_at,grace_until,created_at,updated_at
    ) values(
      v_business_id,'professional','trial',v_subscription_currency,'monthly',
      v_trial_start,v_trial_end,v_trial_end,null,v_trial_start,v_trial_start
    );
    insert into public.subscription_events(business_id,actor_user_id,event_type,details)
    values(v_business_id,auth.uid(),'free_trial_started',jsonb_build_object(
      'plan_code','professional','trial_days',7,'trial_started_at',v_trial_start,
      'trial_ends_at',v_trial_end,'payment_required_at_signup',false,'trial_policy','one_per_account',
      'workspace_owner_user_id',v_app.user_id
    ));
  else
    insert into public.business_subscriptions(
      business_id,plan_code,status,currency_code,billing_cycle,
      current_period_start,current_period_end,trial_ends_at,grace_until,created_at,updated_at
    ) values(
      v_business_id,'professional','pending_payment',v_subscription_currency,'monthly',
      null,null,null,null,v_trial_start,v_trial_start
    );
    insert into public.subscription_events(business_id,actor_user_id,event_type,details)
    values(v_business_id,auth.uid(),'free_trial_not_available',jsonb_build_object(
      'plan_code','professional','reason','This account has already used its one-time free trial.',
      'payment_required_at_signup',true,'trial_policy','one_per_account',
      'workspace_owner_user_id',v_app.user_id
    ));
  end if;

  update public.platform_customer_approvals
  set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note='',updated_at=now()
  where user_id=v_app.user_id;
  if not found then
    insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note,updated_at)
    values(v_app.user_id,'approved',auth.uid(),now(),'Workspace provisioned from approved business application.',now());
  end if;

  update public.platform_business_applications
  set status='approved',review_note=coalesce(v_note,''),reviewed_by=auth.uid(),
      reviewed_at=now(),business_id=v_business_id,updated_at=now()
  where id=v_app.id;

  insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
  values(v_business_id,auth.uid(),'customer_business_application_approved',
    'platform_business_applications',v_app.id::text,
    jsonb_build_object(
      'applicant_user_id',v_app.user_id,'applicant_email',v_user_email,
      'business_name',v_app.business_name,'business_type',v_app.business_type,
      'recommended_modules',v_modules,'subscription_status',case when v_trial_granted then 'trial' else 'pending_payment' end
    ));

  return jsonb_build_object(
    'success',true,'status','approved','application_id',v_app.id,'business_id',v_business_id,
    'business_owner_user_id',v_app.user_id,'subscription_status',case when v_trial_granted then 'trial' else 'pending_payment' end,
    'trial_ends_at',case when v_trial_granted then v_trial_end else null end,
    'modules',to_jsonb(v_modules)
  );
end;
$function$;

revoke all on function public.submit_platform_business_application(text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.get_my_platform_business_application() from public, anon;
revoke all on function public.get_platform_pending_customers() from public, anon;
revoke all on function public.review_platform_business_application(uuid,text,text) from public, anon;
grant execute on function public.submit_platform_business_application(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_my_platform_business_application() to authenticated;
grant execute on function public.get_platform_pending_customers() to authenticated;
grant execute on function public.review_platform_business_application(uuid,text,text) to authenticated;

commit;
