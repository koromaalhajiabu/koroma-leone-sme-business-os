begin;

alter table public.football_club_website_activity
  drop constraint if exists football_club_website_activity_actor_type_check;
alter table public.football_club_website_activity
  add constraint football_club_website_activity_actor_type_check
  check (actor_type = any (array['platform_developer','club_user','scout','system']::text[]));

create or replace function public.log_football_club_website_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row jsonb;
  v_old jsonb;
  v_business_id uuid;
  v_target_id uuid;
  v_website_id uuid;
  v_action text;
  v_actor_type text;
  v_changed text[] := array[]::text[];
begin
  if tg_op='DELETE' then
    v_row:=to_jsonb(old); v_old:=v_row; v_action:='delete';
  elsif tg_op='INSERT' then
    v_row:=to_jsonb(new); v_action:='create';
  else
    v_row:=to_jsonb(new); v_old:=to_jsonb(old); v_action:='update';
    select coalesce(array_agg(n.key order by n.key),array[]::text[])
      into v_changed
    from jsonb_each(v_row) as n
    left join jsonb_each(v_old) as o using(key)
    where n.value is distinct from o.value
      and n.key not in (
        'updated_at','message','scout_email','scout_name','scout_organisation',
        'evidence_reference','verification_comment','proposed_terms',
        'offer_fee_amount','offer_currency_code','destination_decision_note',
        'source_decision_note','completion_note','coach_notes','strengths',
        'development_areas','report_summary'
      );
  end if;

  v_business_id:=(v_row->>'business_id')::uuid;
  v_target_id:=(v_row->>'id')::uuid;
  v_actor_type:=case
    when auth.uid() is null then 'system'
    when public.is_platform_developer() then 'platform_developer'
    when v_row->>'scout_user_id'=auth.uid()::text then 'scout'
    else 'club_user'
  end;

  select id into v_website_id
  from public.football_club_websites
  where business_id=v_business_id;

  if v_website_id is not null then
    insert into public.football_club_website_activity(
      business_id,website_id,actor_user_id,actor_type,action,target_table,
      target_id,summary,changed_fields
    ) values (
      v_business_id,v_website_id,auth.uid(),v_actor_type,v_action,tg_table_name,
      v_target_id,
      case tg_table_name
        when 'football_player_discovery_consents' then initcap(v_action)||'d a player consent record.'
        when 'football_player_market_listings' then initcap(v_action)||'d a player transfer listing.'
        when 'football_scout_enquiries' then initcap(v_action)||'d a verified scout enquiry.'
        when 'football_player_career_history' then initcap(v_action)||'d a player career record.'
        when 'football_player_match_performances' then initcap(v_action)||'d a player match-performance record.'
        when 'football_scout_assessments' then initcap(v_action)||'d a scout assessment.'
        else initcap(v_action)||'d a record in '||tg_table_name||'.'
      end,
      v_changed
    );
  end if;

  if v_actor_type='platform_developer' then
    insert into public.business_notifications(
      recipient_user_id,business_id,category,title,body,action_page,dedupe_key
    )
    select bm.user_id,v_business_id,'approvals','Club website updated',
      'Koroma Leone Tech updated content on your club website.','club-website-studio',
      'fcw-activity-'||gen_random_uuid()::text
    from public.business_members bm
    where bm.business_id=v_business_id and bm.is_active=true
      and bm.role::text in ('owner','admin','manager') and bm.user_id<>auth.uid();
  end if;

  if tg_table_name='football_club_website_delegations' then
    insert into public.business_notifications(
      recipient_user_id,business_id,category,title,body,action_page,dedupe_key
    )
    select u.id,v_business_id,'approvals','Club website delegation changed',
      'A club workspace has updated its Koroma Leone Tech website management authorisation.',
      'club-website-studio','fcw-delegation-'||gen_random_uuid()::text
    from auth.users u
    join public.platform_developer_emails d on lower(d.email)=lower(u.email);
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

revoke all on function public.log_football_club_website_activity() from public,anon,authenticated;

do $audit_triggers$
declare
  v_table text;
  v_tables constant text[] := array[
    'football_player_discovery_consents',
    'football_player_market_listings',
    'football_scout_enquiries',
    'football_player_career_history',
    'football_player_match_performances',
    'football_scout_assessments'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop trigger if exists player_network_activity_audit on public.%I',v_table);
    execute format(
      'create trigger player_network_activity_audit after insert or update or delete on public.%I for each row execute function public.log_football_club_website_activity()',
      v_table
    );
  end loop;
end;
$audit_triggers$;

create or replace function public.log_football_transfer_request_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row jsonb;
  v_old jsonb;
  v_source_business_id uuid;
  v_destination_business_id uuid;
  v_website record;
  v_action text;
  v_actor_type text;
  v_changed text[] := array[]::text[];
begin
  if tg_op='DELETE' then
    v_row:=to_jsonb(old); v_old:=v_row; v_action:='delete';
  elsif tg_op='INSERT' then
    v_row:=to_jsonb(new); v_action:='create';
  else
    v_row:=to_jsonb(new); v_old:=to_jsonb(old); v_action:='update';
    select coalesce(array_agg(n.key order by n.key),array[]::text[])
      into v_changed
    from jsonb_each(v_row) as n
    left join jsonb_each(v_old) as o using(key)
    where n.value is distinct from o.value
      and n.key not in (
        'updated_at','proposed_terms','offer_fee_amount','offer_currency_code',
        'destination_decision_note','source_decision_note','completion_note'
      );
  end if;

  v_source_business_id:=(v_row->>'source_business_id')::uuid;
  v_destination_business_id:=(v_row->>'destination_business_id')::uuid;
  v_actor_type:=case
    when auth.uid() is null then 'system'
    when public.is_platform_developer() then 'platform_developer'
    else 'club_user'
  end;

  for v_website in
    select w.id as website_id,w.business_id
    from public.football_club_websites w
    where w.business_id in (v_source_business_id,v_destination_business_id)
  loop
    insert into public.football_club_website_activity(
      business_id,website_id,actor_user_id,actor_type,action,target_table,
      target_id,summary,changed_fields,metadata
    ) values (
      v_website.business_id,v_website.website_id,auth.uid(),v_actor_type,
      v_action,'football_transfer_requests',(v_row->>'id')::uuid,
      case v_action
        when 'create' then 'A club-to-club player transfer request was created.'
        when 'update' then 'A club-to-club player transfer request was updated.'
        else 'A club-to-club player transfer request was removed.'
      end,
      v_changed,
      jsonb_build_object(
        'transfer_type',v_row->>'transfer_type',
        'status',v_row->>'status',
        'transfer_request_id',v_row->>'id'
      )
    );
  end loop;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

revoke all on function public.log_football_transfer_request_activity() from public,anon,authenticated;

drop trigger if exists transfer_request_activity_audit on public.football_transfer_requests;
create trigger transfer_request_activity_audit
after insert or update or delete on public.football_transfer_requests
for each row execute function public.log_football_transfer_request_activity();

drop policy if exists football_club_activity_select on public.football_club_website_activity;
create policy football_club_activity_select
on public.football_club_website_activity
for select to authenticated
using (
  public.has_business_role(business_id,array['owner','admin','manager']::public.business_role[])
  or (
    public.is_platform_developer()
    and public.can_manage_football_club_website_content(
      business_id,
      case target_table
        when 'football_club_websites' then 'profile'
        when 'football_club_website_delegations' then 'profile'
        when 'football_club_website_pages' then 'pages'
        when 'football_club_website_news' then 'news'
        when 'football_club_website_squad' then 'squad'
        when 'football_player_discovery_profiles' then 'squad'
        when 'football_player_discovery_consents' then 'squad'
        when 'football_player_career_history' then 'squad'
        when 'football_player_match_performances' then 'squad'
        when 'football_scout_assessments' then 'squad'
        when 'football_club_website_staff' then 'staff'
        when 'football_club_website_fixtures' then 'fixtures'
        when 'football_club_website_standings' then 'standings'
        when 'football_club_website_transfers' then 'transfers'
        when 'football_player_market_listings' then 'transfers'
        when 'football_transfer_requests' then 'transfers'
        when 'football_scout_enquiries' then 'enquiries'
        when 'football_club_website_gallery' then 'gallery'
        when 'football_club_website_sponsors' then 'sponsors'
        when 'football_club_website_events' then 'events'
        when 'football_club_website_honours' then 'honours'
        else null
      end
    )
  )
);

commit;
