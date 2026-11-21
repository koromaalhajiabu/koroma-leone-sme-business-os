-- Restrict refund reviewers to roles that can execute the existing sale-return function.
create or replace function public.review_business_approval_request(
 p_request_id uuid,p_decision text,p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_user_id uuid:=auth.uid();v_request public.business_approval_requests%rowtype;
 v_decision text:=lower(btrim(coalesce(p_decision,'')));
 v_note text:=nullif(left(btrim(coalesce(p_review_note,'')),1000),'');v_result jsonb;
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
  if v_request.request_type='payroll' then
   if not public.has_business_role(v_request.business_id,array['owner','admin']::public.business_role[]) then
    raise exception 'Payroll approvals are restricted to business owners and administrators';
   end if;
  elsif v_request.request_type='refund' then
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager']::public.business_role[]) then
    raise exception 'Refund approvals are restricted to owners, administrators and managers';
   end if;
  else
   if not public.has_business_role(v_request.business_id,array['owner','admin','manager','accountant']::public.business_role[]) then
    raise exception 'You do not have permission to review this request';
   end if;
  end if;
 end if;
 update public.business_approval_requests set status=v_decision,reviewed_by=v_user_id,
  review_note=v_note,reviewed_at=now(),updated_at=now() where id=v_request.id;
 if v_decision='approved' and v_request.request_payload is not null then
  v_result:=public.execute_business_operation_approval(v_request.id);
 end if;
 insert into public.audit_logs(business_id,actor_user_id,action,entity_table,entity_id,details)
 values(v_request.business_id,v_user_id,'approval_request_'||v_decision,'business_approval_requests',v_request.id::text,
  jsonb_build_object('request_type',v_request.request_type,'title',v_request.title,'amount',v_request.amount,
   'currency_code',v_request.currency_code,'previous_status',v_request.status,'new_status',v_decision,'executed',v_result));
 return jsonb_build_object('success',true,'request_id',v_request.id,'status',v_decision,'execution',v_result);
end;$function$;
revoke all on function public.review_business_approval_request(uuid,text,text) from public;
revoke all on function public.review_business_approval_request(uuid,text,text) from anon;
grant execute on function public.review_business_approval_request(uuid,text,text) to authenticated;
