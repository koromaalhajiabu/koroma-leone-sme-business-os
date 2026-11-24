-- Add an optional financial offer to the two-club player transfer proposal.
begin;
alter table public.football_transfer_requests
  add column if not exists offer_fee_amount numeric(14,2),
  add column if not exists offer_currency_code text not null default 'SLE';
alter table public.football_transfer_requests
  drop constraint if exists football_transfer_requests_offer_fee_check;
alter table public.football_transfer_requests
  add constraint football_transfer_requests_offer_fee_check
  check (offer_fee_amount is null or offer_fee_amount>=0);
alter table public.football_transfer_requests
  drop constraint if exists football_transfer_requests_offer_currency_check;
alter table public.football_transfer_requests
  add constraint football_transfer_requests_offer_currency_check
  check (offer_currency_code ~ '^[A-Z]{3}$');

drop function if exists public.request_football_transfer(uuid,uuid,text,text);
create or replace function public.request_football_transfer(
  p_profile_id uuid,p_destination_business_id uuid,
  p_transfer_type text default 'Permanent',p_proposed_terms text default null,
  p_offer_fee_amount numeric default null,p_offer_currency_code text default 'SLE'
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_profile record;v_destination record;v_request_id uuid;v_currency text;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a transfer request.';end if;
  if p_transfer_type not in ('Permanent','Loan','Trial') then raise exception 'Choose a valid transfer type.';end if;
  if length(coalesce(p_proposed_terms,''))>2000 then raise exception 'Transfer terms must be 2,000 characters or fewer.';end if;
  if p_offer_fee_amount is not null and p_offer_fee_amount<0 then raise exception 'Offer amount cannot be negative.';end if;
  v_currency:=upper(trim(coalesce(p_offer_currency_code,'SLE')));
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter offer currency.';end if;
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
  if not found then raise exception 'The player is not currently listed for this opportunity or has no active consent.';end if;
  if not public.can_manage_football_club_website_content_direct(v_profile.business_id,'transfers') then
    raise exception 'You are not authorised to initiate transfers for this club.';
  end if;
  if p_destination_business_id=v_profile.business_id then raise exception 'Choose a different destination club.';end if;
  select id,business_id,club_name into v_destination from public.football_club_websites
    where business_id=p_destination_business_id and verification_status='verified'
      and is_published=true and maintenance_mode=false;
  if not found then raise exception 'The destination must be a verified, published club website.';end if;
  insert into public.football_transfer_requests(
    player_profile_id,player_squad_member_id,source_business_id,destination_business_id,
    source_website_id,destination_website_id,player_name_snapshot,source_club_name_snapshot,
    destination_club_name_snapshot,transfer_type,proposed_terms,offer_fee_amount,
    offer_currency_code,initiated_by,status
  ) values (
    v_profile.id,v_profile.squad_member_id,v_profile.business_id,v_destination.business_id,
    v_profile.website_id,v_destination.id,v_profile.public_name,v_profile.club_name,
    v_destination.club_name,p_transfer_type,nullif(trim(coalesce(p_proposed_terms,'')), ''),
    p_offer_fee_amount,v_currency,auth.uid(),'pending_destination'
  ) returning id into v_request_id;
  return v_request_id;
end;
$function$;
revoke all on function public.request_football_transfer(uuid,uuid,text,text,numeric,text) from public,anon;
grant execute on function public.request_football_transfer(uuid,uuid,text,text,numeric,text) to authenticated;
commit;
