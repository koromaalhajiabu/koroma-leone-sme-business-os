-- Harden direct writes to approval and activity records. Mutations must flow
-- through the SECURITY DEFINER RPCs, which enforce user and club-role checks.
revoke insert, update, delete on public.football_club_website_change_requests from authenticated;
grant select on public.football_club_website_change_requests to authenticated;

revoke insert, update, delete on public.football_club_website_activity from authenticated;
grant select on public.football_club_website_activity to authenticated;

-- Trigger functions are invoked by their attached triggers, not from PostgREST.
revoke all on function public.log_football_club_website_activity() from public, anon, authenticated;

create or replace function public.review_football_club_website_change(
  p_request_id uuid,
  p_decision text,
  p_manager_comment text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req public.football_club_website_change_requests%rowtype;
  v_keys text[];
  v_column_list text;
  v_select_list text;
  v_set_list text;
  v_sql text;
  v_rows integer;
  v_website_id uuid;
  v_allowed_tables constant text[] := array[
    'football_club_websites',
    'football_club_website_pages',
    'football_club_website_news',
    'football_club_website_squad',
    'football_club_website_staff',
    'football_club_website_fixtures',
    'football_club_website_standings',
    'football_club_website_transfers',
    'football_club_website_gallery',
    'football_club_website_sponsors',
    'football_club_website_events',
    'football_club_website_honours'
  ];
begin
  if auth.uid() is null then
    raise exception 'You must sign in to review website changes.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Choose approve or reject.';
  end if;

  select * into v_req
  from public.football_club_website_change_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Change request not found.'; end if;
  if not public.has_business_role(v_req.business_id, array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Only the club owner, administrator or manager can review website changes.';
  end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;
  if not (v_req.target_table = any(v_allowed_tables)) then
    raise exception 'This requested content type cannot be reviewed.';
  end if;
  if v_req.operation not in ('insert','update','delete') then
    raise exception 'Unsupported change operation.';
  end if;
  if v_req.target_table = 'football_club_websites' and v_req.operation <> 'update' then
    raise exception 'A club website profile can only be updated through an approval.';
  end if;
  if v_req.operation in ('update','delete') and v_req.target_id is null then
    raise exception 'The target record ID is missing.';
  end if;
  if v_req.operation = 'insert' and v_req.target_id is not null then
    raise exception 'An insert request cannot target an existing record ID.';
  end if;

  if p_decision = 'approved' then
    if v_req.operation = 'insert' then
      select array_agg(keys.key order by keys.key)
      into v_keys
      from jsonb_object_keys(v_req.proposed_content) as keys(key)
      where keys.key not in ('id','business_id','created_at','updated_at')
        and exists (
          select 1 from information_schema.columns c
          where c.table_schema='public'
            and c.table_name=v_req.target_table
            and c.column_name=keys.key
        );
      if coalesce(array_length(v_keys,1),0)=0 then
        raise exception 'The submitted content contains no recognised fields.';
      end if;
      select string_agg(format('%I',selected.key),', ' order by selected.key),
             string_agg(format('r.%I',selected.key),', ' order by selected.key)
      into v_column_list,v_select_list
      from unnest(v_keys) as selected(key);
      v_sql := format(
        'insert into public.%I (business_id, %s) select $1, %s from jsonb_populate_record(null::public.%I, $2) as r',
        v_req.target_table,v_column_list,v_select_list,v_req.target_table
      );
      execute v_sql using v_req.business_id,v_req.proposed_content;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'The content item was not inserted.'; end if;

    elsif v_req.operation = 'update' then
      select array_agg(keys.key order by keys.key)
      into v_keys
      from jsonb_object_keys(v_req.proposed_content) as keys(key)
      where keys.key not in ('id','business_id','created_at','updated_at')
        and exists (
          select 1 from information_schema.columns c
          where c.table_schema='public'
            and c.table_name=v_req.target_table
            and c.column_name=keys.key
        );
      if coalesce(array_length(v_keys,1),0)=0 then
        raise exception 'The submitted content contains no editable fields.';
      end if;
      select string_agg(format('%I = r.%I',selected.key,selected.key),', ' order by selected.key)
      into v_set_list
      from unnest(v_keys) as selected(key);
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=v_req.target_table and column_name='updated_at'
      ) then
        v_set_list := v_set_list || ', updated_at = now()';
      end if;
      v_sql := format(
        'update public.%I as t set %s from jsonb_populate_record(null::public.%I, $1) as r where t.id = $2 and t.business_id = $3',
        v_req.target_table,v_set_list,v_req.target_table
      );
      execute v_sql using v_req.proposed_content,v_req.target_id,v_req.business_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'The target record was not updated.'; end if;

    elsif v_req.operation = 'delete' then
      execute format('delete from public.%I where id = $1 and business_id = $2',v_req.target_table)
        using v_req.target_id,v_req.business_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'The target record was not deleted.'; end if;
    end if;
  end if;

  update public.football_club_website_change_requests
  set status=p_decision,
      manager_comment=nullif(trim(coalesce(p_manager_comment,'')),''),
      reviewed_by=auth.uid(),
      reviewed_at=now()
  where id=p_request_id;

  select id into v_website_id
  from public.football_club_websites
  where business_id=v_req.business_id;

  insert into public.football_club_website_activity(
    business_id,website_id,actor_user_id,actor_type,action,target_table,target_id,summary,metadata
  ) values (
    v_req.business_id,v_website_id,auth.uid(),'club_user',
    case when p_decision='approved' then 'change_approved' else 'change_rejected' end,
    v_req.target_table,v_req.target_id,
    case when p_decision='approved' then 'Approved a website content change.' else 'Rejected a website content change.' end,
    jsonb_build_object('request_id',p_request_id,'comment',p_manager_comment)
  );

  insert into public.business_notifications(
    recipient_user_id,business_id,category,title,body,action_page,dedupe_key
  ) values (
    v_req.submitted_by,v_req.business_id,'approvals',
    case when p_decision='approved' then 'Website update approved' else 'Website update rejected' end,
    case when p_decision='approved' then 'The club approved your submitted website update.'
         else 'The club rejected your submitted website update.' end
      || case when nullif(trim(coalesce(p_manager_comment,'')),'') is not null
        then ' Manager note: ' || trim(p_manager_comment) else '' end,
    'club-website-studio',
    'fcw-review-' || p_request_id::text || '-' || p_decision
  );

  return true;
end;
$function$;

revoke all on function public.review_football_club_website_change(uuid,text,text) from public,anon;
grant execute on function public.review_football_club_website_change(uuid,text,text) to authenticated;

revoke all on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) from public,anon;
grant execute on function public.submit_football_club_website_change(uuid,text,uuid,text,jsonb) to authenticated;
