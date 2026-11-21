-- Restrict sensitive platform administration and transaction RPCs to signed-in callers.
-- The functions retain their internal developer/role checks; this is an additional API boundary.
revoke all on function public.set_platform_account_access(uuid,boolean,text) from public, anon;
grant execute on function public.set_platform_account_access(uuid,boolean,text) to authenticated;

revoke all on function public.set_platform_business_freeze(uuid,boolean,text) from public, anon;
grant execute on function public.set_platform_business_freeze(uuid,boolean,text) to authenticated;

revoke all on function public.set_platform_business_suspension(uuid,boolean) from public, anon;
grant execute on function public.set_platform_business_suspension(uuid,boolean) to authenticated;

revoke all on function public.set_platform_business_registration_limit(text,integer) from public, anon;
grant execute on function public.set_platform_business_registration_limit(text,integer) to authenticated;

revoke all on function public.set_platform_customer_approval(uuid,boolean,text) from public, anon;
grant execute on function public.set_platform_customer_approval(uuid,boolean,text) to authenticated;

revoke all on function public.set_platform_maintenance(boolean,text) from public, anon;
grant execute on function public.set_platform_maintenance(boolean,text) to authenticated;

revoke all on function public.set_platform_member_access(uuid,text,public.business_role,boolean) from public, anon;
grant execute on function public.set_platform_member_access(uuid,text,public.business_role,boolean) to authenticated;

revoke all on function public.sync_branch_transaction(uuid,uuid,text,text,jsonb) from public, anon;
grant execute on function public.sync_branch_transaction(uuid,uuid,text,text,jsonb) to authenticated;

-- This legacy auto-first-branch RPC was intentionally disabled for authenticated clients.
-- Remove its remaining anonymous API exposure; the branch-aware RPC above is the supported path.
revoke all on function public.sync_local_transaction(uuid,text,text,jsonb) from public, anon, authenticated;
