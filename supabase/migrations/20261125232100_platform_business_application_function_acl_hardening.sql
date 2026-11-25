-- Explicitly remove inherited API-role execute access from onboarding RPCs.
begin;
revoke all on function public.submit_platform_business_application(text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_platform_business_application() from public, anon, authenticated, service_role;
revoke all on function public.get_platform_pending_business_applications() from public, anon, authenticated, service_role;
revoke all on function public.review_platform_business_application(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_platform_access_status() from public, anon, authenticated, service_role;
grant execute on function public.submit_platform_business_application(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_my_platform_business_application() to authenticated;
grant execute on function public.get_platform_pending_business_applications() to authenticated;
grant execute on function public.review_platform_business_application(uuid,text,text) to authenticated;
grant execute on function public.get_my_platform_access_status() to authenticated;
commit;