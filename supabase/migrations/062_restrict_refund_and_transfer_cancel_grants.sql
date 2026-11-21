-- Ensure sensitive refund and branch-transfer cancellation RPCs are not callable anonymously.
revoke all on function public.sync_sale_return(uuid,uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.sync_sale_return(uuid,uuid,text,text,text,text,jsonb) to authenticated;

revoke all on function public.cancel_branch_stock_transfer(uuid) from public, anon;
grant execute on function public.cancel_branch_stock_transfer(uuid) to authenticated;