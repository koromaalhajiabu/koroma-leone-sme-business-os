begin;

create or replace function public.slfa_match_ops_get_staff(p_business_id uuid)
returns table(user_id uuid, role text, full_name text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.is_business_member(p_business_id) then
    raise exception 'You do not have access to this association workspace';
  end if;
  return query
    select bm.user_id,bm.role::text,
      coalesce(nullif(trim(p.full_name),''),'Association staff')::text
    from public.business_members bm
    left join public.profiles p on p.id=bm.user_id
    where bm.business_id=p_business_id and bm.is_active=true
    order by coalesce(nullif(trim(p.full_name),''),'Association staff'),bm.user_id;
end;
$$;

revoke all on function public.slfa_match_ops_get_staff(uuid) from public,anon;
grant execute on function public.slfa_match_ops_get_staff(uuid) to authenticated;

commit;