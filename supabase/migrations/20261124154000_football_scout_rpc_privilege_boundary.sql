-- Keep privileged scout operations in the non-exposed internal schema.
create or replace function app_private.review_football_scout_account(
  p_account_id uuid,p_decision text,p_comment text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_account public.football_scout_accounts%rowtype;
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Only the Koroma Leone Tech platform developer can review scout accounts.';
  end if;
  if p_decision not in ('verified','rejected','suspended') then raise exception 'Choose verify, reject or suspend.'; end if;
  select * into v_account from public.football_scout_accounts where id=p_account_id for update;
  if not found then raise exception 'Scout account not found.'; end if;
  update public.football_scout_accounts
  set verification_status=p_decision,
      verification_comment=nullif(trim(coalesce(p_comment,'')),''),
      verified_by=case when p_decision='verified' then auth.uid() else verified_by end,
      verified_at=case when p_decision='verified' then now() else verified_at end,
      updated_at=now()
  where id=p_account_id;
  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  values (
    v_account.user_id,null,'approvals',
    case p_decision when 'verified' then 'Scout account verified' when 'suspended' then 'Scout account suspended' else 'Scout account not approved' end,
    case p_decision when 'verified' then 'Your Koroma Leone Tech scouting portal account has been verified. You can now send player enquiries.'
      when 'suspended' then 'Your scouting portal account has been suspended. Contact Koroma Leone Tech for assistance.'
      else 'Your scouting portal verification was not approved.' end
      || case when nullif(trim(coalesce(p_comment,'')),'') is not null then ' Review note: '||trim(p_comment) else '' end,
    'football-scouting','scout-review-'||p_account_id::text||'-'||p_decision||'-'||extract(epoch from now())::bigint::text
  );
  return true;
end;
$function$;
revoke all on function app_private.review_football_scout_account(uuid,text,text) from public,anon;
grant execute on function app_private.review_football_scout_account(uuid,text,text) to authenticated;

drop function if exists public.review_football_scout_account(uuid,text,text);
create function public.review_football_scout_account(p_account_id uuid,p_decision text,p_comment text default null)
returns boolean language sql security invoker set search_path = ''
as $function$
  select app_private.review_football_scout_account(p_account_id,p_decision,p_comment);
$function$;
revoke all on function public.review_football_scout_account(uuid,text,text) from public,anon;
grant execute on function public.review_football_scout_account(uuid,text,text) to authenticated;

create or replace function app_private.submit_football_scout_enquiry(
  p_profile_id uuid,p_enquiry_type text,p_message text
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_profile public.football_player_discovery_profiles%rowtype;
  v_scout public.football_scout_accounts%rowtype;
  v_email text;
  v_enquiry_id uuid;
  v_daily_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in with your verified scout account to contact a club.'; end if;
  if char_length(trim(coalesce(p_message,'')))<20 or char_length(trim(p_message))>3000 then
    raise exception 'Your enquiry must contain between 20 and 3000 characters.';
  end if;
  if p_enquiry_type not in ('Player scouting','Trial invitation','Additional footage','Club partnership','Other') then
    raise exception 'Choose a valid enquiry type.';
  end if;
  select * into v_scout from public.football_scout_accounts
  where user_id=auth.uid() and verification_status='verified';
  if not found then raise exception 'Your scout account must be verified by Koroma Leone Tech before you can contact clubs.'; end if;
  select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirm your scout account email before sending enquiries.'; end if;
  select * into v_profile from public.football_player_discovery_profiles
  where id=p_profile_id and scouting_status='published'
    and public.is_published_football_club_website(business_id)
    and public.football_player_discovery_has_consent(id,is_minor);
  if not found then raise exception 'This player profile is not currently available for scouting enquiries.'; end if;
  select count(*) into v_daily_count from public.football_scout_enquiries
  where scout_user_id=auth.uid() and created_at>=now()-interval '24 hours';
  if v_daily_count>=15 then raise exception 'The daily scouting enquiry limit has been reached. Try again later.'; end if;
  insert into public.football_scout_enquiries(
    business_id,website_id,profile_id,scout_user_id,scout_name,scout_organisation,scout_email,enquiry_type,message
  ) values (
    v_profile.business_id,v_profile.website_id,v_profile.id,auth.uid(),
    v_scout.full_name,v_scout.organisation,v_email,p_enquiry_type,trim(p_message)
  ) returning id into v_enquiry_id;
  insert into public.business_notifications(recipient_user_id,business_id,category,title,body,action_page,dedupe_key)
  select bm.user_id,v_profile.business_id,'approvals','New international scouting enquiry',
    'A verified scout from '||v_scout.organisation||' sent an enquiry about a player profile.',
    'club-website-studio','scout-enquiry-'||v_enquiry_id::text||'-'||bm.user_id::text
  from public.business_members bm where bm.business_id=v_profile.business_id
    and bm.is_active=true and bm.role::text in ('owner','admin','manager');
  return v_enquiry_id;
end;
$function$;
revoke all on function app_private.submit_football_scout_enquiry(uuid,text,text) from public,anon;
grant execute on function app_private.submit_football_scout_enquiry(uuid,text,text) to authenticated;

drop function if exists public.submit_football_scout_enquiry(uuid,text,text);
create function public.submit_football_scout_enquiry(p_profile_id uuid,p_enquiry_type text,p_message text)
returns uuid language sql security invoker set search_path = ''
as $function$
  select app_private.submit_football_scout_enquiry(p_profile_id,p_enquiry_type,p_message);
$function$;
revoke all on function public.submit_football_scout_enquiry(uuid,text,text) from public,anon;
grant execute on function public.submit_football_scout_enquiry(uuid,text,text) to authenticated;
