-- Keep public projections limited to information required by the public player pages.
revoke select (business_id) on table public.football_player_career_history from anon;
revoke select (business_id,fixture_id,squad_member_id,approved_at,id)
  on table public.football_player_match_performances from anon;

drop policy if exists football_player_market_listings_select on public.football_player_market_listings;
create policy football_player_market_listings_select
on public.football_player_market_listings for select to anon,authenticated
using (
  (
    status='published'
    and (available_from is null or available_from<=current_date)
    and (expires_at is null or expires_at>=current_date)
    and exists (
      select 1 from public.football_player_discovery_profiles p
      join public.football_club_websites w on w.id=p.website_id and w.business_id=p.business_id
      where p.id=profile_id and p.business_id=football_player_market_listings.business_id
        and p.scouting_status='published' and p.is_minor=false
        and w.verification_status='verified' and w.is_published=true and w.maintenance_mode=false
        and public.football_player_discovery_has_consent(p.id,p.is_minor)
    )
  )
  or public.can_manage_football_club_website_content(business_id,'transfers')
);

create or replace function app_private.submit_football_scout_enquiry(
  p_profile_id uuid,p_enquiry_type text,p_message text
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_profile public.football_player_discovery_profiles%rowtype;
  v_scout public.football_scout_accounts%rowtype;
  v_email text; v_enquiry_id uuid; v_daily_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in with your verified scout account to contact a club.'; end if;
  if char_length(trim(coalesce(p_message,'')))<20 or char_length(trim(p_message))>3000 then
    raise exception 'Your enquiry must contain between 20 and 3000 characters.';
  end if;
  if p_enquiry_type not in ('Player scouting','Trial invitation','Additional footage','Club partnership','Other',
    'Transfer interest','Loan interest','Player evaluation') then
    raise exception 'Choose a valid enquiry type.';
  end if;
  select * into v_scout from public.football_scout_accounts
    where user_id=auth.uid() and verification_status='verified';
  if not found then raise exception 'Your scout account must be verified by Koroma Leone Tech before contacting clubs.'; end if;
  select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirm your scout account email before sending enquiries.'; end if;
  select * into v_profile from public.football_player_discovery_profiles
    where id=p_profile_id and scouting_status='published'
      and public.is_published_football_club_website(business_id)
      and public.football_player_discovery_has_consent(id,is_minor);
  if not found then raise exception 'This player profile is not currently available for scouting enquiries.'; end if;
  if p_enquiry_type in ('Transfer interest','Loan interest') and v_profile.is_minor then
    raise exception 'Transfer and loan enquiries for under-18 players are not available through this platform.';
  end if;
  if p_enquiry_type in ('Transfer interest','Loan interest') and not exists (
    select 1 from public.football_player_market_listings l
    where l.profile_id=v_profile.id and l.business_id=v_profile.business_id
      and l.status='published'
      and (l.available_from is null or l.available_from<=current_date)
      and (l.expires_at is null or l.expires_at>=current_date)
      and (p_enquiry_type<>'Loan interest' or l.listing_type in ('Loan','Permanent transfer'))
      and (p_enquiry_type<>'Transfer interest' or l.listing_type in ('Permanent transfer','Free agent'))
  ) then raise exception 'This player is not currently listed for that type of opportunity.'; end if;
  select count(*) into v_daily_count from public.football_scout_enquiries
    where scout_user_id=auth.uid() and created_at>=now()-interval '24 hours';
  if v_daily_count>=15 then raise exception 'The daily scouting enquiry limit has been reached. Try again later.'; end if;
  insert into public.football_scout_enquiries(
    business_id,website_id,profile_id,scout_user_id,scout_name,scout_organisation,scout_email,enquiry_type,message
  ) values (
    v_profile.business_id,v_profile.website_id,v_profile.id,auth.uid(),v_scout.full_name,
    v_scout.organisation,v_email,p_enquiry_type,trim(p_message)
  ) returning id into v_enquiry_id;
  insert into public.business_notifications(
    recipient_user_id,business_id,category,title,body,action_page,dedupe_key
  )
  select bm.user_id,v_profile.business_id,'approvals','New international player enquiry',
    'A verified scout from '||v_scout.organisation||' sent a '||lower(p_enquiry_type)||' for a player profile.',
    'club-website-studio','scout-enquiry-'||v_enquiry_id::text||'-'||bm.user_id::text
  from public.business_members bm
  where bm.business_id=v_profile.business_id and bm.is_active=true
    and bm.role::text in ('owner','admin','manager');
  return v_enquiry_id;
end;
$function$;
revoke all on function app_private.submit_football_scout_enquiry(uuid,text,text) from public,anon;
grant execute on function app_private.submit_football_scout_enquiry(uuid,text,text) to authenticated;

create or replace function public.request_football_transfer(
  p_profile_id uuid,p_destination_business_id uuid,p_transfer_type text default 'Permanent',
  p_proposed_terms text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_profile record; v_destination record; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a transfer request.'; end if;
  if p_transfer_type not in ('Permanent','Loan','Trial') then raise exception 'Choose a valid transfer type.'; end if;
  if length(coalesce(p_proposed_terms,''))>2000 then raise exception 'Transfer terms must be 2,000 characters or fewer.'; end if;
  select p.id,p.business_id,p.website_id,p.squad_member_id,p.public_name,p.is_minor,w.club_name
    into v_profile
  from public.football_player_discovery_profiles p
  join public.football_club_websites w on w.id=p.website_id and w.business_id=p.business_id
  join public.football_player_market_listings l on l.profile_id=p.id and l.business_id=p.business_id
  where p.id=p_profile_id and p.scouting_status='published' and p.is_minor=false
    and l.status='published'
    and (l.available_from is null or l.available_from<=current_date)
    and (l.expires_at is null or l.expires_at>=current_date)
    and ((p_transfer_type='Loan' and l.listing_type in ('Loan','Permanent transfer'))
      or (p_transfer_type='Trial' and l.listing_type='Trial opportunity')
      or (p_transfer_type='Permanent' and l.listing_type in ('Permanent transfer','Free agent')))
    and w.verification_status='verified' and w.is_published=true and w.maintenance_mode=false
    and public.football_player_discovery_has_consent(p.id,p.is_minor);
  if not found then raise exception 'The player is not currently listed for this opportunity or has no active consent.'; end if;
  if not public.can_manage_football_club_website_content_direct(v_profile.business_id,'transfers') then
    raise exception 'You are not authorised to initiate transfers for this club.';
  end if;
  if p_destination_business_id=v_profile.business_id then raise exception 'Choose a different destination club.'; end if;
  select id,business_id,club_name into v_destination from public.football_club_websites
    where business_id=p_destination_business_id and verification_status='verified'
      and is_published=true and maintenance_mode=false;
  if not found then raise exception 'The destination must be a verified, published club website.'; end if;
  insert into public.football_transfer_requests(
    player_profile_id,player_squad_member_id,source_business_id,destination_business_id,
    source_website_id,destination_website_id,player_name_snapshot,source_club_name_snapshot,
    destination_club_name_snapshot,transfer_type,proposed_terms,initiated_by,status
  ) values (
    v_profile.id,v_profile.squad_member_id,v_profile.business_id,v_destination.business_id,
    v_profile.website_id,v_destination.id,v_profile.public_name,v_profile.club_name,
    v_destination.club_name,p_transfer_type,nullif(trim(coalesce(p_proposed_terms,'')),''),auth.uid(),'pending_destination'
  ) returning id into v_request_id;
  return v_request_id;
end;
$function$;
revoke all on function public.request_football_transfer(uuid,uuid,text,text) from public,anon;
grant execute on function public.request_football_transfer(uuid,uuid,text,text) to authenticated;
