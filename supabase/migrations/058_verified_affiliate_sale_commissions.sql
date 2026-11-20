-- White Lion SME OS — verified affiliate commission accrual for cloud-synced business sales.
-- This covers business-level affiliate programmes only. Platform subscription commissions
-- require a separate verified billing event and are intentionally not inferred from POS sales.
begin;

create or replace function public.record_affiliate_sale(
  p_business_id uuid,
  p_client_transaction_id text,
  p_referral_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.offline_sales%rowtype;
  v_referral public.affiliate_referrals%rowtype;
  v_affiliate public.affiliate_profiles%rowtype;
  v_program public.affiliate_programs%rowtype;
  v_commission numeric(14,2);
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_business_id is null or coalesce(trim(p_client_transaction_id),'')='' or p_referral_id is null then
    raise exception 'Business, sale reference and referral attribution are required';
  end if;

  -- Only the authenticated user who synced this sale may attach its referral attribution.
  select * into v_sale
  from public.offline_sales s
  where s.business_id=p_business_id
    and s.client_transaction_id=p_client_transaction_id
    and s.synced_by=auth.uid();
  if not found then raise exception 'Verified sale not found for this user and business'; end if;

  if not exists (
    select 1 from public.business_members bm
    where bm.business_id=p_business_id and bm.user_id=auth.uid()
      and bm.is_active=true
      and lower(bm.role::text) in ('owner','admin','manager','cashier')
  ) then raise exception 'Active sales permission required'; end if;

  select * into v_referral
  from public.affiliate_referrals r
  where r.id=p_referral_id and r.business_id=p_business_id
    and r.referral_status in ('clicked','converted');
  if not found then return jsonb_build_object('created',false,'reason','referral_not_found_or_wrong_business'); end if;

  select * into v_affiliate
  from public.affiliate_profiles ap
  where ap.id=v_referral.affiliate_id and ap.status='active';
  if not found then return jsonb_build_object('created',false,'reason','affiliate_not_active'); end if;

  -- Prevent an affiliate from earning commission on their own business sales.
  if v_affiliate.user_id=auth.uid() then
    return jsonb_build_object('created',false,'reason','self_referral_not_eligible');
  end if;

  select * into v_program
  from public.affiliate_programs p
  where p.id=v_referral.program_id
    and p.business_id=p_business_id
    and p.status='active';
  if not found then return jsonb_build_object('created',false,'reason','programme_not_active_or_wrong_business'); end if;

  if v_referral.first_clicked_at < now() - make_interval(days => v_program.cookie_days) then
    return jsonb_build_object('created',false,'reason','referral_window_expired');
  end if;

  if v_sale.total <= 0 then
    return jsonb_build_object('created',false,'reason','zero_value_sale');
  end if;

  if v_program.commission_type='percentage' then
    v_commission := round(v_sale.total * v_program.commission_value / 100,2);
  else
    v_commission := round(v_program.commission_value,2);
  end if;
  if v_commission <= 0 then
    return jsonb_build_object('created',false,'reason','zero_commission');
  end if;

  insert into public.affiliate_commissions(
    program_id,affiliate_id,referral_id,business_id,source_reference,
    gross_amount,commission_amount,currency,status
  ) values (
    v_program.id,v_affiliate.id,v_referral.id,p_business_id,
    'offline_sale:'||v_sale.id::text,v_sale.total,v_commission,v_program.currency,'pending'
  )
  on conflict (program_id,source_reference) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted=1 then
    update public.affiliate_referrals
    set referral_status='converted',converted_at=coalesce(converted_at,now())
    where id=v_referral.id;
  end if;

  return jsonb_build_object(
    'created',v_inserted=1,
    'duplicate',v_inserted=0,
    'commission_amount',v_commission,
    'currency',v_program.currency,
    'commission_status','pending'
  );
end;
$$;

revoke all on function public.record_affiliate_sale(uuid,text,uuid) from public, anon;
grant execute on function public.record_affiliate_sale(uuid,text,uuid) to authenticated;

comment on function public.record_affiliate_sale(uuid,text,uuid) is
'Creates one pending business affiliate commission from an authenticated user''s verified cloud-synced sale. Validates tenant, active membership, affiliate, programme, cookie window and self-referral; duplicate sale attribution is idempotent.';

commit;
