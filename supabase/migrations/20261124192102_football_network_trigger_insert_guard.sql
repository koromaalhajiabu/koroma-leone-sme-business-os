-- Avoid referencing OLD fields in INSERT trigger paths.
create or replace function public.stamp_football_player_match_performance()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
declare v_was_approved boolean := false;
begin
  if tg_op='INSERT' then new.created_by:=auth.uid();
  else v_was_approved:=coalesce(old.is_approved,false);
  end if;
  new.updated_by:=auth.uid();
  if new.is_approved then
    if not public.can_manage_football_club_website_content_direct(new.business_id,'squad')
       or not public.can_manage_football_club_website_content_direct(new.business_id,'fixtures') then
      raise exception 'Only authorised club management can approve match performance records.';
    end if;
    if not v_was_approved then new.approved_by:=auth.uid();new.approved_at:=now();end if;
  else new.approved_by:=null;new.approved_at:=null;
  end if;
  new.updated_at:=now();return new;
end;
$function$;
revoke all on function public.stamp_football_player_match_performance() from public,anon,authenticated;

create or replace function public.guard_football_player_market_listing()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
declare v_profile public.football_player_discovery_profiles%rowtype;v_old_status text:=null;
begin
  if tg_op='INSERT' then new.created_by:=auth.uid();else v_old_status:=old.status;end if;
  new.updated_by:=auth.uid();
  select * into v_profile from public.football_player_discovery_profiles p
  where p.id=new.profile_id and p.business_id=new.business_id;
  if not found then raise exception 'Select a player profile belonging to this club.';end if;
  if v_profile.is_minor then raise exception 'Players under 18 cannot be listed for transfer, loan or trial through this marketplace.';end if;
  if new.status='published' then
    if not public.can_manage_football_club_website_content_direct(new.business_id,'transfers') then
      raise exception 'Only authorised club management can publish a player market listing.';
    end if;
    if v_profile.scouting_status<>'published' or not public.football_player_discovery_has_consent(v_profile.id,v_profile.is_minor) then
      raise exception 'A published player profile and current player consent are required before listing.';
    end if;
    if not exists (select 1 from public.football_club_websites w
      where w.id=v_profile.website_id and w.business_id=new.business_id
        and w.verification_status='verified' and w.is_published=true and w.maintenance_mode=false) then
      raise exception 'The club website must be verified and published before a player can be listed.';
    end if;
    if new.published_at is null or v_old_status is distinct from 'published' then new.published_at:=now();end if;
  end if;
  new.updated_at:=now();return new;
end;
$function$;
revoke all on function public.guard_football_player_market_listing() from public,anon,authenticated;
