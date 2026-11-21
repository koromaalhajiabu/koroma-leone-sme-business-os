-- Route supplier payable settlements through the approval inbox and allow approved
-- refund/payable cashbook records through the general expense gate.
create or replace function public.create_business_payable_payment_approval(
 p_business_id uuid,p_client_request_id uuid,p_obligation_id uuid,p_amount numeric,
 p_payment_method text,p_payment_date date
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_role public.business_role;v_settings public.business_approval_settings%rowtype;
 v_obligation public.financial_obligations%rowtype;v_reference text;v_request_id uuid;v_currency text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_business_member(p_business_id) then raise exception 'Active business membership is required'; end if;
 if p_client_request_id is null or p_obligation_id is null then raise exception 'Payment request details are incomplete'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be positive'; end if;
 if lower(coalesce(p_payment_method,'cash')) not in ('cash','mobile money','bank transfer','card') then raise exception 'Unsupported payment method'; end if;
 select role into v_role from public.business_members where business_id=p_business_id and user_id=auth.uid() and is_active;
 if v_role not in ('owner','admin','manager','accountant') then raise exception 'Your role cannot submit payable payment approvals'; end if;
 select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 if not found then
  insert into public.business_approval_settings(business_id) values(p_business_id) on conflict(business_id) do nothing;
  select * into v_settings from public.business_approval_settings where business_id=p_business_id;
 end if;
 if not v_settings.require_expense_approvals then raise exception 'Expense approvals are not enabled for this workspace'; end if;
 select * into v_obligation from public.financial_obligations where id=p_obligation_id and business_id=p_business_id for update;
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

create or replace function public.execute_business_payable_payment_approval(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v public.business_approval_requests%rowtype;v_result jsonb;v_payment_id uuid;
 v_obligation_id uuid;v_amount numeric;v_method text;v_date date;v_reference text;
begin
 select * into v from public.business_approval_requests where id=p_request_id for update;
 if not found or v.status<>'approved' or v.request_type<>'expense'
  or v.request_payload->>'operation'<>'payable_payment' then raise exception 'Approved payable payment request not found'; end if;
 if v.executed_at is not null then return coalesce(v.execution_result,jsonb_build_object('executed',true,'already_executed',true)); end if;
 if not public.is_business_member(v.business_id) then raise exception 'Active business membership is required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=v.business_id and bm.user_id=v.requested_by and bm.is_active) then
  raise exception 'The payment requester is no longer an active business member';
 end if;
 if not public.has_business_role(v.business_id,array['owner','admin','manager','accountant']::public.business_role[]) then
  raise exception 'Only authorised finance roles can execute payable payments';
 end if;
 v_obligation_id:=(v.request_payload->>'obligation_id')::uuid;v_amount:=(v.request_payload->>'amount')::numeric;
 v_method:=coalesce(v.request_payload->>'payment_method','cash');
 v_date:=coalesce(nullif(v.request_payload->>'payment_date','')::date,current_date);
 v_reference:=v.request_payload->>'client_record_id';
 if v_reference is null or v_reference='' then raise exception 'Approved payment reference is missing'; end if;
 if abs(coalesce(v.amount,0)-v_amount)>0.01 then raise exception 'Approved payment amount has changed'; end if;
 if exists(select 1 from public.financial_obligation_payments p where p.business_id=v.business_id and p.reference=v_reference) then
  raise exception 'This payable payment reference has already been used';
 end if;
 v_result:=public.record_obligation_payment(v_obligation_id,v_amount,v_method,v_date,v_reference);
 select p.id into v_payment_id from public.financial_obligation_payments p
 where p.business_id=v.business_id and p.reference=v_reference;
 if v_payment_id is null then raise exception 'Approved payable payment was not posted'; end if;
 v_result:=jsonb_build_object('payment_id',v_payment_id,'obligation_id',v_obligation_id,'reference',v_reference,
  'payment_status',v_result->>'status','amount_paid',v_result->'amount_paid');
 update public.business_approval_requests set execution_result=v_result,executed_at=now(),updated_at=now() where id=v.id;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v.business_id,auth.uid(),'approved_payable_payment_executed','financial_obligation_payments',v_payment_id::text,v_result);
 return v_result;
end;$function$;

revoke all on function public.create_business_payable_payment_approval(uuid,uuid,uuid,numeric,text,date) from public;
revoke all on function public.create_business_payable_payment_approval(uuid,uuid,uuid,numeric,text,date) from anon;
grant execute on function public.create_business_payable_payment_approval(uuid,uuid,uuid,numeric,text,date) to authenticated;
revoke all on function public.execute_business_payable_payment_approval(uuid) from public;
revoke all on function public.execute_business_payable_payment_approval(uuid) from anon;
revoke all on function public.execute_business_payable_payment_approval(uuid) from authenticated;

create or replace function public.approval_gate_cashbook_expense()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;v_refund_required boolean;v_payload jsonb;v_bank_account_id uuid;v_request_type text;
begin
 if lower(coalesce(new.entry_type,''))<>'expense' then return new; end if;
 select coalesce(s.require_expense_approvals,false),coalesce(s.require_refund_approvals,false)
 into v_required,v_refund_required from public.business_approval_settings s where s.business_id=new.business_id;
 if not coalesce(v_required,false) then return new; end if;
 select r.request_payload,r.request_type into v_payload,v_request_type
 from public.business_approval_requests r
 where r.business_id=new.business_id and r.status='approved' and r.executed_at is null
  and (
   (r.request_type='expense' and r.request_payload->>'operation' in ('cashbook_expense','payable_payment')
    and r.request_payload->>'client_record_id'=new.reference)
   or
   (r.request_type='refund' and r.request_payload->>'operation'='refund'
    and r.request_payload->>'client_return_id'=new.reference)
  )
 order by r.created_at desc limit 1 for update;
 if found then
  if v_request_type='expense' and v_payload->>'operation'='cashbook_expense' then
   v_bank_account_id:=nullif(v_payload->>'bank_account_id','')::uuid;
   if v_bank_account_id is not null then
    if not exists(select 1 from public.bank_accounts b where b.id=v_bank_account_id and b.business_id=new.business_id and b.is_active) then
     raise exception 'The selected bank or mobile-money account is no longer active in this business';
    end if;
    new.bank_account_id:=v_bank_account_id;
   end if;
  end if;
  return new;
 end if;
 if not coalesce(v_refund_required,false) and exists(
  select 1 from public.offline_sale_returns r where r.business_id=new.business_id and r.client_return_id=new.reference
 ) then return new; end if;
 raise exception 'This cashbook expense requires an approved expense, payable-payment or refund request';
end;$function$;

create or replace function public.review_business_approval_request(
 p_request_id uuid,p_decision text,p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid:=auth.uid();v_request public.business_approval_requests%rowtype;
 v_decision text:=lower(btrim(coalesce(p_decision,'')));v_note text:=nullif(left(btrim(coalesce(p_review_note,'')),1000),'');
 v_result jsonb;
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 if v_decision not in ('approved','rejected','cancelled') then raise exception 'Unsupported approval decision'; end if;
 select * into v_request from public.business_approval_requests where id=p_request_id for update;
 if not found then raise exception 'Approval request was not found or is not available to this workspace'; end if;
 if not public.is_business_member(v_request.business_id) then raise exception 'You no longer have access to this business workspace'; end if;
 if v_request.status<>'pending' then raise exception 'This request has already been reviewed'; end if;
 if v_decision='cancelled' then
  if v_request.requested_by<>v_user_id then raise exception 'Only the person who submitted this request can cancel it'; end if;
 else
  if v_request.requested_by=v_user_id then raise exception 'You cannot approve or reject your own request'; end if;
  if v_request.request_type in ('payroll','purchase','refund') then
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager']::public.business_role[]) then
    raise exception 'This request must be reviewed by an owner, administrator or manager'; end if;
   if v_request.request_type='payroll' and not public.has_business_role(v_request.business_id,array['owner','admin']::public.business_role[]) then
    raise exception 'Payroll approvals are restricted to business owners and administrators'; end if;
  else
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager','accountant']::public.business_role[]) then
    raise exception 'You do not have permission to review this request'; end if;
  end if;
 end if;
 update public.business_approval_requests set status=v_decision,reviewed_by=v_user_id,review_note=v_note,
  reviewed_at=now(),updated_at=now() where id=v_request.id;
 if v_decision='approved' and v_request.request_payload is not null then
  if v_request.request_type='expense' and v_request.request_payload->>'operation'='payable_payment' then
   v_result:=public.execute_business_payable_payment_approval(v_request.id);
  elsif v_request.request_type='purchase' and v_request.request_payload->>'operation'='batch_receipt' then
   perform set_config('koroma.business_approval_request_id',v_request.id::text,true);
   v_result:=public.execute_business_operation_approval(v_request.id);
   perform set_config('koroma.business_approval_request_id','',true);
  else
   v_result:=public.execute_business_operation_approval(v_request.id);
  end if;
 end if;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_request.business_id,v_user_id,'approval_request_'||v_decision,'business_approval_requests',v_request.id::text,
  jsonb_build_object('request_type',v_request.request_type,'title',v_request.title,'amount',v_request.amount,
   'currency_code',v_request.currency_code,'previous_status',v_request.status,'new_status',v_decision,'execution',v_result));
 return jsonb_build_object('success',true,'request_id',v_request.id,'status',v_decision,'execution',v_result);
end;$function$;
revoke all on function public.review_business_approval_request(uuid,text,text) from public;
revoke all on function public.review_business_approval_request(uuid,text,text) from anon;
grant execute on function public.review_business_approval_request(uuid,text,text) to authenticated;
