
alter table public.football_scout_recruitment_leads
  add column if not exists verification_status text not null default 'not_started'
    check (verification_status in ('not_started','pending_review','approved','rejected','more_information')),
  add column if not exists verification_notes text,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists verification_checked_by uuid references auth.users(id) on delete set null;

create table if not exists public.football_scout_recruitment_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.football_scout_recruitment_leads(id) on delete cascade,
  activity_type text not null check (activity_type in ('email_sent','call','linkedin','whatsapp','reply_received','meeting','invitation_sent','verification_review','note')),
  outcome text,
  details text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists football_scout_recruitment_activities_lead_time_idx
  on public.football_scout_recruitment_activities (lead_id, occurred_at desc);

alter table public.football_scout_recruitment_activities enable row level security;

drop policy if exists football_scout_recruitment_activities_developer_select on public.football_scout_recruitment_activities;
create policy football_scout_recruitment_activities_developer_select
  on public.football_scout_recruitment_activities for select to authenticated
  using (public.is_platform_developer());

drop policy if exists football_scout_recruitment_activities_developer_insert on public.football_scout_recruitment_activities;
create policy football_scout_recruitment_activities_developer_insert
  on public.football_scout_recruitment_activities for insert to authenticated
  with check (public.is_platform_developer() and created_by = (select auth.uid()));

drop policy if exists football_scout_recruitment_activities_developer_delete on public.football_scout_recruitment_activities;
create policy football_scout_recruitment_activities_developer_delete
  on public.football_scout_recruitment_activities for delete to authenticated
  using (public.is_platform_developer());

grant select, insert, delete on public.football_scout_recruitment_activities to authenticated;
grant select, insert, update, delete on public.football_scout_recruitment_leads to authenticated;
notify pgrst, 'reload schema';
