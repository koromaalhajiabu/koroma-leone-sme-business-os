-- Allow the public scouting directory to read only the explicitly published fields.
-- The private source_account_id remains unavailable to anon and authenticated roles.
grant select (
  id,
  full_name,
  organisation,
  job_title,
  country,
  website_url,
  professional_profile_url,
  scouting_specialties,
  years_experience,
  public_contact_email,
  published_at,
  updated_at
) on table public.football_verified_scout_profiles to anon, authenticated;
