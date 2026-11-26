create table if not exists public.travel_agency_destination_recommendations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 applicant_id uuid not null references public.travel_agency_applicants(id) on delete cascade,
 opportunity_id uuid null references public.travel_agency_opportunities(id) on delete set null,
 destination_country text not null,
 travel_purpose text not null check (travel_purpose in ('work','study','tourism','skilled_migration','business_travel','family_visit','other')),
 pathway_title text not null,
 eligibility_summary text,
 eligibility_checklist jsonb not null default '[]'::jsonb,
 required_documents jsonb not null default '[]'::jsonb,
 estimated_cost numeric(14,2),
 cost_currency text not null default 'SLE',
 cost_breakdown text,
 official_source_links jsonb not null default '[]'::jsonb,
 application_steps jsonb not null default '[]'::jsonb,
 staff_advice text,
 verification_notes text,
 source_checked_at timestamptz,
 status text not null default 'draft' check (status in ('draft','pending_review','approved','returned')),
 approved_at timestamptz,
 approved_by uuid,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint travel_agency_recommendation_json_arrays check (
  jsonb_typeof(eligibility_checklist)='array' and jsonb_typeof(required_documents)='array'
  and jsonb_typeof(official_source_links)='array' and jsonb_typeof(application_steps)='array'
 )
);
create index if not exists travel_agency_recommendations_business_created_idx on public.travel_agency_destination_recommendations(business_id, created_at desc);
create index if not exists travel_agency_recommendations_applicant_idx on public.travel_agency_destination_recommendations(applicant_id);
alter table public.travel_agency_destination_recommendations enable row level security;
drop policy if exists travel_agency_recommendations_member_read on public.travel_agency_destination_recommendations;
create policy travel_agency_recommendations_member_read on public.travel_agency_destination_recommendations for select to authenticated using (public.is_business_member(business_id));
drop policy if exists travel_agency_recommendations_manager_write on public.travel_agency_destination_recommendations;
create policy travel_agency_recommendations_manager_write on public.travel_agency_destination_recommendations for all to authenticated using (public.has_business_role(business_id, array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role])) with check (public.has_business_role(business_id, array['owner'::public.business_role,'admin'::public.business_role,'manager'::public.business_role]));
grant select, insert, update, delete on public.travel_agency_destination_recommendations to authenticated;
