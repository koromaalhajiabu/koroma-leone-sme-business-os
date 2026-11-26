begin;
create table if not exists public.slfa_match_ops_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  competition_id uuid not null,
  fixture_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  alert_code text not null,
  title text not null,
  body text not null,
  action_page text not null default 'slfa-match-operations',
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint slfa_match_ops_notifications_fixture_fk
    foreign key (fixture_id, business_id, competition_id)
    references public.league_fixtures(id, business_id, competition_id) on delete cascade
);
create index if not exists slfa_match_ops_notifications_recipient_created_idx
  on public.slfa_match_ops_notifications(recipient_user_id, created_at desc);
create index if not exists slfa_match_ops_notifications_business_fixture_idx
  on public.slfa_match_ops_notifications(business_id, fixture_id, created_at desc);
alter table public.slfa_match_ops_notifications enable row level security;
revoke all on public.slfa_match_ops_notifications from public, anon;
grant select, update(read_at) on public.slfa_match_ops_notifications to authenticated;
drop policy if exists slfa_match_ops_notifications_read_own on public.slfa_match_ops_notifications;
create policy slfa_match_ops_notifications_read_own on public.slfa_match_ops_notifications
 for select to authenticated using (recipient_user_id = (select auth.uid()));
drop policy if exists slfa_match_ops_notifications_mark_own on public.slfa_match_ops_notifications;
create policy slfa_match_ops_notifications_mark_own on public.slfa_match_ops_notifications
 for update to authenticated using (recipient_user_id = (select auth.uid()))
 with check (recipient_user_id = (select auth.uid()));
create or replace function public.generate_slfa_match_ops_notifications()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_total integer:=0; v_rows integer:=0;
begin
 insert into public.slfa_match_ops_notifications(business_id,competition_id,fixture_id,recipient_user_id,alert_code,title,body,dedupe_key)
 select f.business_id,f.competition_id,f.id,a.user_id,
  case when ts.id is null then 'team_sheet_due' else 'team_sheet_returned' end,
  case when ts.id is null then 'Team sheet due' else 'Team sheet returned for correction' end,
  case when ts.id is null then 'Submit the team sheet for '||hc.name||' vs '||ac.name||' before the 20-minute cutoff.'
   else 'The team sheet for '||c.name||' was returned. Review the correction note and resubmit before kick-off.' end,
  case when ts.id is null then 'team-sheet-due:'||f.id::text||':'||a.club_id::text||':'||a.user_id::text
   else 'team-sheet-returned:'||ts.id::text||':'||coalesce(ts.updated_at::text,'')||':'||a.user_id::text end
 from public.league_fixtures f
 join public.slfa_match_ops_licenses l on l.business_id=f.business_id and l.status='active'
  and (l.starts_on is null or l.starts_on<=current_date) and (l.valid_until is null or l.valid_until>=current_date)
 join public.league_clubs hc on hc.id=f.home_club_id
 join public.league_clubs ac on ac.id=f.away_club_id
 join public.slfa_match_official_assignments a on a.business_id=f.business_id and a.competition_id=f.competition_id
  and a.role='team_official' and a.is_active and a.club_id in (f.home_club_id,f.away_club_id)
 left join lateral (select s.id,s.status,s.updated_at,s.review_note from public.slfa_match_team_sheets s
  where s.fixture_id=f.id and s.club_id=a.club_id order by s.updated_at desc limit 1) ts on true
 left join public.league_clubs c on c.id=a.club_id
 where f.status='scheduled' and f.kickoff_at>now()+interval '20 minutes'
  and f.kickoff_at<=now()+interval '24 hours' and (ts.id is null or ts.status='returned')
 on conflict (dedupe_key) do nothing;
 get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

 insert into public.slfa_match_ops_notifications(business_id,competition_id,fixture_id,recipient_user_id,alert_code,title,body,dedupe_key)
 select f.business_id,f.competition_id,f.id,a.user_id,
  case when latest.id is null then 'match_report_overdue' else 'match_report_returned' end,
  case when latest.id is null then 'Match report overdue' else 'Match report requires correction' end,
  case when latest.id is null then 'Your '||replace(a.role,'_',' ')||' report is outstanding for '||hc.name||' vs '||ac.name||'. Submit it for Super Admin review.'
   else 'Your '||replace(a.role,'_',' ')||' report for '||hc.name||' vs '||ac.name||' was returned. Review the correction note and resubmit.' end,
  case when latest.id is null then 'report-overdue:'||f.id::text||':'||a.role||':'||a.user_id::text
   else 'report-returned:'||latest.id::text||':'||coalesce(latest.updated_at::text,'')||':'||a.user_id::text end
 from public.league_fixtures f
 join public.slfa_match_ops_licenses l on l.business_id=f.business_id and l.status='active'
  and (l.starts_on is null or l.starts_on<=current_date) and (l.valid_until is null or l.valid_until>=current_date)
 join public.league_clubs hc on hc.id=f.home_club_id
 join public.league_clubs ac on ac.id=f.away_club_id
 join public.slfa_match_official_assignments a on a.business_id=f.business_id and a.competition_id=f.competition_id
  and a.fixture_id=f.id and a.role in ('referee','match_commissioner') and a.is_active
 left join lateral (select r.id,r.status,r.updated_at,r.review_note from public.slfa_match_reports r
  where r.fixture_id=f.id and r.report_type=a.role order by r.submitted_at desc limit 1) latest on true
 where f.status in ('scheduled','completed') and f.kickoff_at is not null
  and f.kickoff_at<=now()-interval '90 minutes' and (latest.id is null or latest.status='returned')
 on conflict (dedupe_key) do nothing;
 get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

 insert into public.slfa_match_ops_notifications(business_id,competition_id,fixture_id,recipient_user_id,alert_code,title,body,dedupe_key)
 select s.business_id,s.competition_id,s.fixture_id,admins.user_id,'team_sheet_review','Team sheet awaiting approval',
  'A submitted team sheet for '||c.name||' in '||hc.name||' vs '||ac.name||' is waiting for review.',
  'team-sheet-review:'||s.id::text||':'||admins.user_id::text
 from public.slfa_match_team_sheets s
 join public.league_fixtures f on f.id=s.fixture_id
 join public.league_clubs c on c.id=s.club_id
 join public.league_clubs hc on hc.id=f.home_club_id
 join public.league_clubs ac on ac.id=f.away_club_id
 join (
  select bm.business_id,bm.user_id from public.business_members bm where bm.is_active and bm.role::text in ('owner','admin','manager')
  union select a.business_id,a.user_id from public.slfa_match_official_assignments a where a.is_active and a.role='competition_admin'
 ) admins on admins.business_id=s.business_id
 where s.status='pending'
 on conflict (dedupe_key) do nothing;
 get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

 insert into public.slfa_match_ops_notifications(business_id,competition_id,fixture_id,recipient_user_id,alert_code,title,body,dedupe_key)
 select r.business_id,r.competition_id,r.fixture_id,admins.user_id,'match_report_review','Match report awaiting review',
  'A '||replace(r.report_type,'_',' ')||' report for '||hc.name||' vs '||ac.name||' is waiting for verification.',
  'match-report-review:'||r.id::text||':'||admins.user_id::text
 from public.slfa_match_reports r
 join public.league_fixtures f on f.id=r.fixture_id
 join public.league_clubs hc on hc.id=f.home_club_id
 join public.league_clubs ac on ac.id=f.away_club_id
 join (
  select bm.business_id,bm.user_id from public.business_members bm where bm.is_active and bm.role::text in ('owner','admin','manager')
  union select a.business_id,a.user_id from public.slfa_match_official_assignments a where a.is_active and a.role='competition_admin'
 ) admins on admins.business_id=r.business_id
 where r.status='pending'
 on conflict (dedupe_key) do nothing;
 get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

 insert into public.slfa_match_ops_notifications(business_id,competition_id,fixture_id,recipient_user_id,alert_code,title,body,dedupe_key)
 select f.business_id,f.competition_id,f.id,admins.user_id,'score_discrepancy','Score discrepancy detected',
  'The referee report score does not match the score stored on the fixture for '||hc.name||' vs '||ac.name||'. Check both source records before finalising.',
  'score-discrepancy:'||f.id::text||':'||r.id::text||':'||admins.user_id::text
 from public.league_fixtures f
 join public.slfa_match_reports r on r.fixture_id=f.id and r.report_type='referee'
 join public.league_clubs hc on hc.id=f.home_club_id
 join public.league_clubs ac on ac.id=f.away_club_id
 join (
  select bm.business_id,bm.user_id from public.business_members bm where bm.is_active and bm.role::text in ('owner','admin','manager')
  union select a.business_id,a.user_id from public.slfa_match_official_assignments a where a.is_active and a.role='competition_admin'
 ) admins on admins.business_id=f.business_id
 where f.home_score is not null and f.away_score is not null
  and (r.report_data->>'home_score')~'^[0-9]+$' and (r.report_data->>'away_score')~'^[0-9]+$'
  and ((r.report_data->>'home_score')::integer<>f.home_score or (r.report_data->>'away_score')::integer<>f.away_score)
 on conflict (dedupe_key) do nothing;
 get diagnostics v_rows=row_count; v_total:=v_total+v_rows;
 return v_total;
end;
$$;
revoke all on function public.generate_slfa_match_ops_notifications() from public,anon,authenticated;
do $$
declare v_job_id bigint;
begin
 for v_job_id in select jobid from cron.job where jobname='koroma-slfa-match-ops-reminders'
 loop perform cron.unschedule(v_job_id); end loop;
 perform cron.schedule('koroma-slfa-match-ops-reminders','*/15 * * * *','select public.generate_slfa_match_ops_notifications();');
end;
$$;
commit;