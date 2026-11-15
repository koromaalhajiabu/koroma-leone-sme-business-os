-- Public, read-only payment instructions for the published Device Services storefront.
begin;
create or replace function public.get_public_device_payment_instructions(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_business_id uuid; v_settings public.device_service_payment_settings%rowtype;
begin
  select business_id into v_business_id
  from public.phone_unlocking_storefronts
  where slug=lower(trim(coalesce(p_slug,''))) and is_published=true
  limit 1;
  if v_business_id is null then
    return jsonb_build_object('ok',false,'message','Store not found or not published');
  end if;
  select * into v_settings
  from public.device_service_payment_settings
  where business_id=v_business_id;
  if not found then
    return jsonb_build_object('ok',true,'configured',false);
  end if;
  return jsonb_build_object(
    'ok',true,'configured',true,
    'bank_name',v_settings.bank_name,
    'bank_account_name',v_settings.bank_account_name,
    'bank_account_number',v_settings.bank_account_number,
    'mobile_money_network',v_settings.mobile_money_network,
    'mobile_money_account_name',v_settings.mobile_money_account_name,
    'mobile_money_number',v_settings.mobile_money_number,
    'payment_instructions',v_settings.payment_instructions
  );
end;
$$;
revoke all on function public.get_public_device_payment_instructions(text) from public;
grant execute on function public.get_public_device_payment_instructions(text) to anon,authenticated;
commit;
