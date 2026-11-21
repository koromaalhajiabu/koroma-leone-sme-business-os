-- Business-scoped approval requests with audited, role-guarded decisions.
create table if not exists public.business_approval_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_request_id uuid not null,
  request_type text not null check (request_type in ('purchase','expense','refund','discount','payroll','stock_adjustment','other')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  amount numeric(14,2) check (amount is null or amount >= 0),
  currency_code text not null default 'SLE' check (char_length(currency_code) = 3),
  requested_by uuid not null default auth.uid() references auth.users(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references auth.users(id),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_approval_requests_client_key unique (business_id, client_request_id),
  constraint business_approval_requests_review_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);
create index if not exists business_approval_requests_queue_idx
  on public.business_approval_requests (business_id, status, created_at desc);
create index if not exists business_approval_requests_owner_idx
  on public.business_approval_requests (business_id, requested_by, created_at desc);

alter table public.business_approval_requests enable row level security;
drop policy if exists business_approval_requests_read on public.business_approval_requests;
create policy business_approval_requests_read
on public.business_approval_requests for select to authenticated
using (
  requested_by = (select auth.uid())
  or (request_type = 'payroll' and public.has_business_role(business_id, array['owner','admin']::public.business_role[]))
  or (request_type <> 'payroll' and public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.business_role[]))
);
drop policy if exists business_approval_requests_create on public.business_approval_requests;
create policy business_approval_requests_create
on public.business_approval_requests for insert to authenticated
with check (requested_by = (select auth.uid()) and public.is_business_member(business_id));

revoke all on table public.business_approval_requests from anon;
revoke update, delete on table public.business_approval_requests from authenticated;
grant select, insert on table public.business_approval_requests to authenticated;

create or replace function public.review_business_approval_request(
  p_request_id uuid, p_decision text, p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.business_approval_requests%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(left(btrim(coalesce(p_review_note, '')), 1000), '');
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if v_decision not in ('approved','rejected','cancelled') then raise exception 'Unsupported approval decision'; end if;

  select * into v_request from public.business_approval_requests where id = p_request_id for update;
  if not found then raise exception 'Approval request was not found or is not available to this workspace'; end if;
  if v_request.status <> 'pending' then raise exception 'This request has already been reviewed'; end if;

  if v_decision = 'cancelled' then
    if v_request.requested_by <> v_user_id then raise exception 'Only the person who submitted this request can cancel it'; end if;
  else
    if v_request.requested_by = v_user_id then raise exception 'You cannot approve or reject your own request'; end if;
    if v_request.request_type = 'payroll' then
      if not public.has_business_role(v_request.business_id, array['owner','admin']::public.business_role[]) then
        raise exception 'Payroll approvals are restricted to business owners and administrators';
      end if;
    else
      if not public.has_business_role(v_request.business_id, array['owner','admin','manager','accountant']::public.business_role[]) then
        raise exception 'You do not have permission to review this request';
      end if;
    end if;
  end if;

  update public.business_approval_requests
     set status = v_decision, reviewed_by = v_user_id, review_note = v_note,
         reviewed_at = now(), updated_at = now()
   where id = v_request.id;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_table, entity_id, details, created_at)
  values (
    v_request.business_id, v_user_id, 'approval_request_' || v_decision,
    'business_approval_requests', v_request.id::text,
    jsonb_build_object(
      'request_type', v_request.request_type, 'title', v_request.title,
      'amount', v_request.amount, 'currency_code', v_request.currency_code,
      'previous_status', v_request.status, 'new_status', v_decision
    ), now()
  );

  return jsonb_build_object('success', true, 'request_id', v_request.id, 'status', v_decision);
end;
$function$;

revoke all on function public.review_business_approval_request(uuid, text, text) from public;
revoke all on function public.review_business_approval_request(uuid, text, text) from anon;
grant execute on function public.review_business_approval_request(uuid, text, text) to authenticated;

comment on table public.business_approval_requests is
  'Business-scoped approval inbox. Only requesters and authorised approvers can read requests; decisions are made through the guarded RPC.';
comment on function public.review_business_approval_request(uuid, text, text) is
  'Reviews a pending business approval request with role checks, self-approval prevention and audit logging.';
