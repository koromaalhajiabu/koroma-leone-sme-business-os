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

drop policy if exists football_scout_recruitment_developer_select on public.football_scout_recruitment_leads;
create policy football_scout_recruitment_developer_select
on public.football_scout_recruitment_leads for select to authenticated
using (public.is_platform_developer());

drop policy if exists football_scout_recruitment_developer_insert on public.football_scout_recruitment_leads;
create policy football_scout_recruitment_developer_insert
on public.football_scout_recruitment_leads for insert to authenticated
with check (public.is_platform_developer() and created_by=auth.uid() and updated_by=auth.uid());

drop policy if exists football_scout_recruitment_developer_update on public.football_scout_recruitment_leads;
create policy football_scout_recruitment_developer_update
on public.football_scout_recruitment_leads for update to authenticated
using (public.is_platform_developer())
with check (public.is_platform_developer() and updated_by=auth.uid());

drop policy if exists football_scout_recruitment_developer_delete on public.football_scout_recruitment_leads;
create policy football_scout_recruitment_developer_delete
on public.football_scout_recruitment_leads for delete to authenticated
using (public.is_platform_developer());
