-- Model-specific device unlock pricing for the public White Lion storefront.
-- Uses only exact model matches in the existing active customer catalogue; never guesses a price.
begin;

create or replace function public.get_public_device_unlock_quote(
  p_slug text,
  p_device_brand text,
  p_device_model text,
  p_network_name text default null,
  p_country text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_business uuid;
  v_store public.phone_unlocking_storefronts%rowtype;
  v_model text := lower(trim(coalesce(p_device_model,'')));
  v_brand text := lower(trim(coalesce(p_device_brand,'')));
  v_network text := lower(trim(coalesce(p_network_name,'')));
  v_matches jsonb;
  v_count integer;
begin
  if length(v_brand)<2 or length(v_model)<2 then
    return jsonb_build_object('ok',false,'match_count',0,'message','Enter the device brand and exact model to find its price.');
  end if;

  select business_id into v_business
  from public.platform_device_services_config where singleton=true;
  if v_business is null then
    return jsonb_build_object('ok',false,'match_count',0,'message','Device Services catalogue is unavailable.');
  end if;

  select * into v_store from public.phone_unlocking_storefronts
  where business_id=v_business
    and slug=lower(trim(coalesce(p_slug,'')))
    and is_published and accepts_orders;
  if not found then
    return jsonb_build_object('ok',false,'match_count',0,'message','This service store is unavailable.');
  end if;

  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'id',q.id,
           'service_name',q.service_name,
           'description',q.description,
           'price',q.default_price,
           'currency_code',coalesce(b.currency_code,'SLE')
         ) order by q.carrier_match desc, q.service_name),'[]'::jsonb)
    into v_count,v_matches
  from (
    select s.id,s.service_name,s.description,s.default_price,
      (v_network<>'' and lower(concat_ws(' ',s.service_name,s.description,s.provider_group)) like '%'||v_network||'%') as carrier_match
    from public.phone_unlocking_services s
    where s.business_id=v_business
      and s.is_active=true
      and s.default_price>0
      and lower(concat_ws(' ',s.service_name,s.description,s.provider_group)) like '%'||v_model||'%'
      and lower(concat_ws(' ',s.service_name,s.description,s.provider_group)) ~ '(unlock|network|carrier|sim.?lock)'
      and lower(concat_ws(' ',s.service_name,s.description,s.provider_group)) !~ '(bypass|activation.?lock|icloud.*lock|frp|mdm|google.?lock)'
  ) q
  cross join public.businesses b
  where b.id=v_business;

  if v_count=0 then
    return jsonb_build_object(
      'ok',false,'match_count',0,
      'message','No exact model-specific unlock service is currently listed for '||trim(p_device_brand||' '||p_device_model)||'. No price has been guessed. Contact White Lion for a manual quote.'
    );
  end if;

  return jsonb_build_object(
    'ok',true,'match_count',v_count,'matches',v_matches,
    'message',case when v_count=1 then 'Matching model-specific service and price found.' else 'More than one matching service was found. Select the correct carrier/service.' end
  );
end;
$fn$;

revoke all on function public.get_public_device_unlock_quote(text,text,text,text,text) from public;
grant execute on function public.get_public_device_unlock_quote(text,text,text,text,text) to anon,authenticated;

commit;
