-- White Lion School Management: automatic parent portal provisioning
-- Run after migration 007. Existing school workspaces are provisioned as well.

begin;

create or replace function public.provision_school_parent_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_name text;
begin
  if new.module_key = 'school' and new.is_enabled = true then
    select b.name into v_school_name
    from public.businesses b
    where b.id = new.business_id;

    if v_school_name is not null then
      insert into public.school_profiles (
        business_id, school_name, portal_enabled
      )
      values (new.business_id, v_school_name, true)
      on conflict (business_id) do update
        set school_name = case
              when public.school_profiles.school_name is null
                or btrim(public.school_profiles.school_name) = ''
              then excluded.school_name
              else public.school_profiles.school_name
            end,
            portal_enabled = true,
            updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists provision_school_parent_portal_after_module on public.business_industry_modules;
create trigger provision_school_parent_portal_after_module
after insert or update of is_enabled, module_key
on public.business_industry_modules
for each row
execute function public.provision_school_parent_portal();

-- Backfill all existing workspaces where the School Management module is active.
insert into public.school_profiles (business_id, school_name, portal_enabled)
select b.id, b.name, true
from public.businesses b
join public.business_industry_modules m
  on m.business_id = b.id
where m.module_key = 'school'
  and m.is_enabled = true
on conflict (business_id) do update
set school_name = case
      when public.school_profiles.school_name is null
        or btrim(public.school_profiles.school_name) = ''
      then excluded.school_name
      else public.school_profiles.school_name
    end,
    portal_enabled = true,
    updated_at = now();

commit;
