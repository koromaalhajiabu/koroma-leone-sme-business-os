-- Close platform-state authorization gaps in refund and transfer-cancellation RPCs.
-- Preserve the existing business logic and modify only the authorization gates.
begin;

do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.sync_sale_return(uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  );

  v_old := $old$
  select bm.role into v_role
  from public.business_members bm
  where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true;
  if not found or v_role is null or v_role not in ('owner','admin','manager','cashier') then
    raise exception 'Your role cannot process sales returns';
  end if;
$old$;

  v_new := $new$
  if not public.has_business_role(
    p_business_id,
    array['owner','admin','manager','cashier']::public.business_role[]
  ) then
    raise exception 'An approved, active business membership with a permitted role is required to process returns';
  end if;

  select bm.role into v_role
  from public.business_members bm
  where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true;
  if not found or v_role is null or v_role not in ('owner','admin','manager','cashier') then
    raise exception 'Your role cannot process sales returns';
  end if;
$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'Expected refund authorization block was not found; no function was changed';
  end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;

  v_definition := pg_get_functiondef(
    'public.cancel_branch_stock_transfer(uuid)'::regprocedure
  );

  v_old := $old$
  if not found then raise exception 'Transfer request not found'; end if;
  if v_transfer.status<>'pending' then raise exception 'Only pending transfers can be cancelled'; end if;
$old$;

  v_new := $new$
  if not found then raise exception 'Transfer request not found'; end if;
  if not public.is_business_member(v_transfer.business_id) then
    raise exception 'An approved, active member of this business is required to cancel a transfer';
  end if;
  if v_transfer.status<>'pending' then raise exception 'Only pending transfers can be cancelled'; end if;
$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'Expected transfer-cancellation authorization block was not found; no function was changed';
  end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;
end
$migration$;

commit;