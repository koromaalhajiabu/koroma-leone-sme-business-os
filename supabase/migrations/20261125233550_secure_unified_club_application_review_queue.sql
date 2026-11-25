-- Keep the public club-application review RPC gated by its internal developer check.
begin;
CREATE OR REPLACE FUNCTION public.get_platform_club_applications()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select app_private.get_platform_club_applications();
$function$

revoke all on function public.get_platform_club_applications() from public,anon;
grant execute on function public.get_platform_club_applications() to authenticated;
commit;
