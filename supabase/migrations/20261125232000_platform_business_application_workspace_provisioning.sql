-- Koroma Leone Tech customer business application and secure workspace provisioning.
begin;

create table if not exists public.platform_business_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null, phone text not null default '', business_name text not null,
  industry_group text not null, business_type text not null,
  currency_code text not null default 'SLE' check (currency_code ~ '^[A-Z]{3}$'),
  contact_email text not null default '', contact_phone text not null default '',
  country text not null default 'Sierra Leone', address text not null default '',
  website text not null default '', tax_registration_number text not null default '',
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending','needs_information','approved','rejected')),
  review_note text not null default '', reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.platform_business_applications enable row level security;
revoke all on public.platform_business_applications from anon, authenticated;

create or replace function public.submit_platform_business_application(
 p_full_name text,p_phone text,p_business_name text,p_industry_group text,p_business_type text,
 p_currency_code text default 'SLE',p_contact_email text default '',p_contact_phone text default '',
 p_country text default 'Sierra Leone',p_address text default '',p_website text default '',
 p_tax_registration_number text default '',p_notes text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_verified boolean; v_status text; v_id uuid;
begin
 if v_user is null then raise exception 'Sign in before submitting a business application'; end if;
 if public.is_platform_developer() then raise exception 'The developer account does not submit customer business applications'; end if;
 select u.email_confirmed_at is not null into v_verified from auth.users u where u.id=v_user;
 if not coalesce(v_verified,false) then raise exception 'Confirm your email address before submitting a business application'; end if;
 if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Enter the business owner or authorised representative name'; end if;
 if length(trim(coalesce(p_business_name,'')))<2 then raise exception 'Enter a valid business name'; end if;
 if length(trim(coalesce(p_industry_group,'')))<2 or length(trim(coalesce(p_business_type,'')))<2 then raise exception 'Select an industry and business type'; end if;
 if upper(trim(coalesce(p_currency_code,''))) !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code'; end if;
 if exists(select 1 from public.business_members m where m.user_id=v_user and m.is_active) then raise exception 'This account already has an active business workspace'; end if;
 select a.status into v_status from public.platform_business_applications a where a.user_id=v_user for update;
 if v_status='approved' then raise exception 'A business application has already been approved for this account'; end if;
 insert into public.platform_business_applications(user_id,full_name,phone,business_name,industry_group,business_type,currency_code,contact_email,contact_phone,country,address,website,tax_registration_number,notes,status,review_note,reviewed_by,reviewed_at,updated_at)
 values(v_user,trim(p_full_name),trim(coalesce(p_phone,'')),trim(p_business_name),trim(p_industry_group),trim(p_business_type),upper(trim(p_currency_code)),lower(trim(coalesce(p_contact_email,''))),trim(coalesce(p_contact_phone,'')),trim(coalesce(p_country,'Sierra Leone')),trim(coalesce(p_address,'')),trim(coalesce(p_website,'')),trim(coalesce(p_tax_registration_number,'')),trim(coalesce(p_notes,'')),'pending','',null,null,now())
 on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,business_name=excluded.business_name,industry_group=excluded.industry_group,business_type=excluded.business_type,currency_code=excluded.currency_code,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,country=excluded.country,address=excluded.address,website=excluded.website,tax_registration_number=excluded.tax_registration_number,notes=excluded.notes,status='pending',review_note='',reviewed_by=null,reviewed_at=null,updated_at=now()
 where public.platform_business_applications.status in ('rejected','needs_information','pending')
 returning id,status into v_id,v_status;
 if v_id is null then raise exception 'This application cannot be changed in its current status'; end if;
 insert into public.profiles(id,full_name,phone,updated_at) values(v_user,trim(p_full_name),nullif(trim(coalesce(p_phone,'')),''),now())
 on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,updated_at=now();
 return jsonb_build_object('application_id',v_id,'status',v_status,'message','Business application submitted for developer review');
end; $$;

create or replace function public.get_my_platform_business_application()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select to_jsonb(a)-'user_id'-'reviewed_by' into v_row from public.platform_business_applications a where a.user_id=auth.uid();
 return coalesce(v_row,'{}'::jsonb);
end; $$;

create or replace function public.get_platform_pending_business_applications()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;
begin
 if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'user_id',a.user_id,'email',u.email,'full_name',a.full_name,'phone',a.phone,
  'business_name',a.business_name,'industry_group',a.industry_group,'business_type',a.business_type,
  'currency_code',a.currency_code,'contact_email',a.contact_email,'contact_phone',a.contact_phone,
  'country',a.country,'address',a.address,'website',a.website,'tax_registration_number',a.tax_registration_number,
  'notes',a.notes,'status',a.status,'review_note',a.review_note,'created_at',a.created_at
 ) order by a.created_at asc),'[]'::jsonb) into v_rows
 from public.platform_business_applications a join auth.users u on u.id=a.user_id
 where a.status in ('pending','needs_information') and u.email_confirmed_at is not null;
 return v_rows;
end; $$;

create or replace function public.review_platform_business_application(p_application_id uuid,p_decision text,p_review_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_app public.platform_business_applications%rowtype; v_email_confirmed timestamptz;
 v_business_id uuid; v_trial_start timestamptz:=now(); v_trial_end timestamptz:=now()+interval '7 days';
 v_trial_claimed_user uuid; v_trial_granted boolean:=false; v_currency text; v_modules text[]; v_module text;
begin
 if not public.is_platform_developer() then raise exception 'Developer access required'; end if;
 if p_decision not in ('approve','reject','needs_information') then raise exception 'Invalid review decision'; end if;
 select * into v_app from public.platform_business_applications where id=p_application_id for update;
 if not found then raise exception 'Business application not found'; end if;
 if v_app.status='approved' or v_app.business_id is not null then raise exception 'This application has already been provisioned'; end if;
 select u.email_confirmed_at into v_email_confirmed from auth.users u where u.id=v_app.user_id;
 if v_email_confirmed is null then raise exception 'Customer email must be verified before approval'; end if;
 if p_decision<>'approve' then
  update public.platform_business_applications set status=p_decision,review_note=left(coalesce(p_review_note,''),2000),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_application_id;
  if p_decision='reject' then
   update public.platform_customer_approvals set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(coalesce(p_review_note,''),2000),updated_at=now() where user_id=v_app.user_id;
  end if;
  return jsonb_build_object('status',p_decision,'business_id',null);
 end if;
 if exists(select 1 from public.business_members m where m.user_id=v_app.user_id and m.is_active) then raise exception 'This customer already has an active business workspace; no second workspace was created'; end if;
 if not exists(select 1 from public.subscription_plans where code='professional' and is_active=true) then raise exception 'The Professional subscription plan is unavailable'; end if;
 insert into public.businesses(name,industry,currency_code,owner_user_id,contact_email,contact_phone,address,website,tax_registration_number)
 values(v_app.business_name,v_app.business_type,v_app.currency_code,v_app.user_id,nullif(v_app.contact_email,''),nullif(v_app.contact_phone,''),nullif(v_app.address,''),nullif(v_app.website,''),nullif(v_app.tax_registration_number,'')) returning id into v_business_id;
 insert into public.business_members(business_id,user_id,role) values(v_business_id,v_app.user_id,'owner');
 insert into public.branches(business_id,name,address) values(v_business_id,'Main Branch',nullif(v_app.address,''));
 insert into public.platform_trial_claims(user_id,first_business_id,claimed_at,trial_ends_at) values(v_app.user_id,v_business_id,v_trial_start,v_trial_end)
 on conflict(user_id) do nothing returning user_id into v_trial_claimed_user;
 v_trial_granted:=v_trial_claimed_user is not null;
 v_currency:=case when v_app.currency_code='USD' then 'USD' else 'SLE' end;
 insert into public.business_subscriptions(business_id,plan_code,status,currency_code,billing_cycle,current_period_start,current_period_end,trial_ends_at,grace_until,created_at,updated_at)
 values(v_business_id,'professional',case when v_trial_granted then 'trial' else 'pending_payment' end,v_currency,'monthly',case when v_trial_granted then v_trial_start else null end,case when v_trial_granted then v_trial_end else null end,case when v_trial_granted then v_trial_end else null end,null,v_trial_start,v_trial_start);
 insert into public.subscription_events(business_id,actor_user_id,event_type,details)
 values(v_business_id,auth.uid(),case when v_trial_granted then 'free_trial_started' else 'free_trial_not_available' end,
 jsonb_build_object('plan_code','professional','trial_days',case when v_trial_granted then 7 else 0 end,'trial_ends_at',case when v_trial_granted then v_trial_end else null end,'payment_required_at_signup',not v_trial_granted,'trial_policy','one_per_account','provisioned_by','platform_business_application'));
 v_modules:=case lower(v_app.industry_group)
  when 'retail and commerce' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting']
  when 'wholesale and distribution' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting']
  when 'food and hospitality' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','restaurant']
  when 'healthcare and pharmaceutical' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','pharmacy','healthcare','hospital']
  when 'automotive and transport' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','transport','fleet','services']
  when 'construction and industrial' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','manufacturing','projects']
  when 'professional and personal services' then array['core','sales_pos','customers','suppliers','expenses','employees','accounting','services','appointments','projects']
  when 'education and training' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','school']
  when 'agriculture and fisheries' then array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','manufacturing']
  when 'property and rental' then array['core','customers','suppliers','expenses','employees','accounting','property','projects','services']
  when 'financial and administrative services' then array['core','customers','expenses','employees','accounting','compliance','services']
  when 'sports and local league management' then array['core','sports_league','expenses','employees','accounting','customers','suppliers']
  else array['core','sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','services','projects']
 end;
 foreach v_module in array v_modules loop
  insert into public.business_industry_modules(business_id,module_key,is_enabled,updated_by) values(v_business_id,v_module,true,auth.uid())
  on conflict(business_id,module_key) do update set is_enabled=true,updated_by=auth.uid(),updated_at=now();
 end loop;
 insert into public.audit_logs(business_id,action,entity_table,entity_id) values(v_business_id,'business_workspace_provisioned','businesses',v_business_id::text);
 update public.platform_customer_approvals set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(coalesce(p_review_note,''),2000),updated_at=now() where user_id=v_app.user_id;
 if not found then insert into public.platform_customer_approvals(user_id,status,reviewed_by,reviewed_at,review_note) values(v_app.user_id,'approved',auth.uid(),now(),left(coalesce(p_review_note,''),2000)); end if;
 update public.platform_business_applications set status='approved',review_note=left(coalesce(p_review_note,''),2000),reviewed_by=auth.uid(),reviewed_at=now(),business_id=v_business_id,updated_at=now() where id=p_application_id;
 return jsonb_build_object('status','approved','business_id',v_business_id,'business_name',v_app.business_name,'owner_user_id',v_app.user_id,'subscription_status',case when v_trial_granted then 'trial' else 'pending_payment' end,'trial_ends_at',case when v_trial_granted then v_trial_end else null end);
end; $$;

create or replace function public.get_my_platform_access_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_confirmed boolean; v_status text; v_note text; v_app_status text; v_business_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if public.is_platform_developer() then return jsonb_build_object('email_confirmed',true,'approval_status','approved','application_status','approved','can_access',true,'is_developer',true,'workspace_pending',false); end if;
 select u.email_confirmed_at is not null into v_confirmed from auth.users u where u.id=auth.uid();
 select a.status,a.review_note into v_status,v_note from public.platform_customer_approvals a where a.user_id=auth.uid();
 select a.status,a.business_id into v_app_status,v_business_id from public.platform_business_applications a where a.user_id=auth.uid();
 return jsonb_build_object('email_confirmed',coalesce(v_confirmed,false),'approval_status',coalesce(v_status,'pending'),'application_status',coalesce(v_app_status,'not_submitted'),
 'review_note',coalesce((select a.review_note from public.platform_business_applications a where a.user_id=auth.uid()),v_note,''),
 'business_id',v_business_id,'workspace_pending',coalesce(v_app_status,'')='approved' and not exists(select 1 from public.business_members m where m.user_id=auth.uid() and m.is_active),
 'can_access',coalesce(v_confirmed,false) and coalesce(v_status,'pending')='approved' and exists(select 1 from public.business_members m where m.user_id=auth.uid() and m.is_active),'is_developer',false);
end; $$;

revoke all on function public.submit_platform_business_application(text,text,text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_my_platform_business_application() from public,anon,authenticated,service_role;
revoke all on function public.get_platform_pending_business_applications() from public,anon,authenticated,service_role;
revoke all on function public.review_platform_business_application(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_my_platform_access_status() from public,anon,authenticated,service_role;
grant execute on function public.submit_platform_business_application(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_my_platform_business_application() to authenticated;
grant execute on function public.get_platform_pending_business_applications() to authenticated;
grant execute on function public.review_platform_business_application(uuid,text,text) to authenticated;
grant execute on function public.get_my_platform_access_status() to authenticated;
commit;
