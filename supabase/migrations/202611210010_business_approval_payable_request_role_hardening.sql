-- Reject nullable or inactive membership roles when creating payable-payment requests.
create or replace function public.create_business_payable_payment_approval(
 p_business_id uuid,p_client_request_id uuid,p_obligation_id uuid,p_amount numeric,
 p_payment_method text,p_payment_date date
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_role public.business_role;v_settings public.business_approval_settings%rowtype;
 v_obligation public.financial_obligations%rowtype;v_reference text;v_request_id uuid;v_currency text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_business_member(p_business_id) then raise exception 'Active business membership is required'; end if;
 if p_client_request_id is null or p_obligation_id is null then raise exception 'Payment request details are incomplete'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be positive'; end if;
 if lower(coalesce(p_payment_method,'cash')) not in ('cash','mobile money','bank transfer','card') then raise exception 'Unsupported payment method'; end if;
 select role into v_role from public.business_members
 where business_id=p_business_id and user_id=auth.uid() and is_active;
 if v_role is null or v_role not in ('owner','admin','manager','accountant') then
  raise exception 'Your role cannot submit payable payment approvals';
 end if;
 select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 if not found then
  insert into public.business_approval_settings(business_id) values(p_business_id) on conflict(business_id) do nothing;
  select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 end if;
 if not v_settings.require_expense_approvals then raise exception 'Expense approvals are not enabled for this workspace'; end if;
 select * into v_obligation from public.financial_obligations
 where id=p_obligation_id and business_id=p_business_id for update;
 if not found then raise exception 'Payable record not found in this business'; end if;
 if v_obligation.obligation_type<>'payable' then raise exception 'Only supplier payables can use this payment workflow'; end if;
 if v_obligation.status='void' then raise exception 'Voided payables cannot be paid'; end if;
 if p_amount>v_obligation.amount-v_obligation.amount_paid then raise exception 'Payment exceeds the outstanding payable balance'; end if;
 select currency_code into v_currency from public.businesses where id=p_business_id;
 v_reference:='PAYREQ-'||p_client_request_id::text;
 insert into public.business_approval_requests(
  business_id,client_request_id,request_type,title,description,amount,currency_code,requested_by,request_payload
 ) values(
  p_business_id,p_client_request_id,'expense','Payable payment · '||v_obligation.party_name,
  v_obligation.description||' · Payment against supplier payable',p_amount,coalesce(v_currency,'SLE'),auth.uid(),
  jsonb_build_object('operation','payable_payment','obligation_id',p_obligation_id,'amount',p_amount,
   'payment_method',lower(coalesce(p_payment_method,'cash')),'payment_date',coalesce(p_payment_date,current_date),
   'client_record_id',v_reference)
 ) on conflict(business_id,client_request_id) do nothing returning id into v_request_id;
 if v_request_id is null then
  select id into v_request_id from public.business_approval_requests
  where business_id=p_business_id and client_request_id=p_client_request_id and requested_by=auth.uid();
  if v_request_id is null then raise exception 'Request reference already used'; end if;
 end if;
 return jsonb_build_object('request_id',v_request_id,'status','pending','reference',v_reference);
end;$function$;
revoke all on function public.create_business_payable_payment_approval(uuid,uuid,uuid,numeric,text,date) from public;
revoke all on function public.create_business_payable_payment_approval(uuid,uuid,uuid,numeric,text,date) from anon;
grant execute on function public.create_business_payable_payment_approval(uuid,uuid,uuid,numeric,text,date) to authenticated;
