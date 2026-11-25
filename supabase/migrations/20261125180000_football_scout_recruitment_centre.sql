-- Global Scout Recruitment Centre: developer-only prospect tracking.
create table if not exists public.football_scout_recruitment_leads (
  id uuid primary key default gen_random_uuid(),
  organisation_name text not null,
  contact_name text,
  role_title text,
  country text,
  region text,
  contact_email text,
  website text,
  channel text not null default 'Manual research',
  status text not null default 'identified'
    check (status in ('identified','contacted','responded','invited','registered','verified','not_interested','do_not_contact')),
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists football_scout_recruitment_status_idx
  on public.football_scout_recruitment_leads(status, next_follow_up_at);
alter table public.football_scout_recruitment_leads enable row level security;
revoke all on public.football_scout_recruitment_leads from anon, authenticated;
grant select, insert, update, delete on public.football_scout_recruitment_leads to authenticated;

create or replace function public.manage_football_scout_recruitment_lead(
  p_id uuid default null,
  p_organisation_name text default null,
  p_contact_name text default null,
  p_role_title text default null,
  p_country text default null,
  p_region text default null,
  p_contact_email text default null,
  p_website text default null,
  p_channel text default 'Manual research',
  p_status text default 'identified',
  p_last_contacted_at timestamptz default null,
  p_next_follow_up_at timestamptz default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Private platform developer access required';
  end if;
  if nullif(trim(p_organisation_name),'') is null then
    raise exception 'Organisation name is required';
  end if;
  if p_status not in ('identified','contacted','responded','invited','registered','verified','not_interested','do_not_contact') then
    raise exception 'Invalid recruitment status';
  end if;
  if p_id is null then
    insert into public.football_scout_recruitment_leads
      (organisation_name,contact_name,role_title,country,region,contact_email,website,channel,status,last_contacted_at,next_follow_up_at,notes,created_by,updated_by)
    values
      (trim(p_organisation_name),nullif(trim(p_contact_name),''),nullif(trim(p_role_title),''),nullif(trim(p_country),''),nullif(trim(p_region),''),nullif(trim(p_contact_email),''),nullif(trim(p_website),''),coalesce(nullif(trim(p_channel),''),'Manual research'),p_status,p_last_contacted_at,p_next_follow_up_at,nullif(trim(p_notes),''),auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.football_scout_recruitment_leads set
      organisation_name=trim(p_organisation_name), contact_name=nullif(trim(p_contact_name),''),
      role_title=nullif(trim(p_role_title),''), country=nullif(trim(p_country),''), region=nullif(trim(p_region),''),
      contact_email=nullif(trim(p_contact_email),''), website=nullif(trim(p_website),''),
      channel=coalesce(nullif(trim(p_channel),''),'Manual research'), status=p_status,
      last_contacted_at=p_last_contacted_at, next_follow_up_at=p_next_follow_up_at,
      notes=nullif(trim(p_notes),''), updated_by=auth.uid(), updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Recruitment lead not found'; end if;
  end if;
  return v_id;
end;
$function$;
revoke all on function public.manage_football_scout_recruitment_lead(uuid,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.manage_football_scout_recruitment_lead(uuid,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.get_football_scout_recruitment_leads()
returns setof public.football_scout_recruitment_leads
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Private platform developer access required';
  end if;
  return query select * from public.football_scout_recruitment_leads order by
    case when next_follow_up_at is not null and next_follow_up_at <= now() then 0 else 1 end,
    next_follow_up_at nulls last, updated_at desc;
end;
$function$;
revoke all on function public.get_football_scout_recruitment_leads() from public,anon;
grant execute on function public.get_football_scout_recruitment_leads() to authenticated;

create or replace function public.delete_football_scout_recruitment_lead(p_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_developer() then
    raise exception 'Private platform developer access required';
  end if;
  delete from public.football_scout_recruitment_leads where id=p_id;
  return found;
end;
$function$;
revoke all on function public.delete_football_scout_recruitment_lead(uuid) from public,anon;
grant execute on function public.delete_football_scout_recruitment_lead(uuid) to authenticated;
