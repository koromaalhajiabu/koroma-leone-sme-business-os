
-- Koroma Leone Tech: tenant-scoped football club website management.
-- Public visitors can read published club content only. Website management is restricted
-- to the platform developer and the club workspace owner, admin or manager.

create table if not exists public.football_club_websites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  club_name text not null check (char_length(trim(club_name)) between 2 and 120),
  short_name text, tagline text, about_text text, history_text text,
  founded_year integer check (founded_year is null or founded_year between 1800 and 2100),
  home_ground text, city text, country text not null default 'Sierra Leone',
  crest_url text, hero_image_url text,
  primary_color text not null default '#075B35' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#101A2D' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#D5AE5A' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  contact_email text, contact_phone text, whatsapp_phone text, address text,
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  seo_title text, seo_description text,
  is_published boolean not null default false,
  maintenance_mode boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists football_club_websites_slug_lower_uidx on public.football_club_websites (lower(slug));
create index if not exists football_club_websites_published_idx on public.football_club_websites (is_published, lower(slug));

create table if not exists public.football_club_website_pages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null, slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  summary text, body text not null default '',
  show_in_navigation boolean not null default true, is_published boolean not null default false,
  sort_order integer not null default 100, seo_title text, seo_description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, slug)
);
create index if not exists football_club_website_pages_public_idx on public.football_club_website_pages (business_id, is_published, sort_order);

create table if not exists public.football_club_website_news (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null, slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null default 'Club news', excerpt text, body text not null default '',
  cover_image_url text, author_name text, is_featured boolean not null default false,
  is_published boolean not null default false, published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, slug)
);
create index if not exists football_club_website_news_public_idx on public.football_club_website_news (business_id, is_published, published_at desc);

create table if not exists public.football_club_website_squad (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null, shirt_number text, position text,
  squad_group text not null default 'First Team' check (squad_group in ('First Team','Women','U23','U21','U18','Academy','Other')),
  nationality text, bio text, photo_url text,
  appearances integer not null default 0 check (appearances >= 0),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  is_captain boolean not null default false, is_published boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists football_club_website_squad_public_idx on public.football_club_website_squad (business_id, is_published, squad_group, sort_order);

create table if not exists public.football_club_website_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null, staff_title text not null, biography text, photo_url text,
  is_published boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists football_club_website_staff_public_idx on public.football_club_website_staff (business_id, is_published, sort_order);

create table if not exists public.football_club_website_fixtures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  opponent_name text not null, competition_name text,
  fixture_type text not null default 'Friendly' check (fixture_type in ('League','Cup','Friendly','Continental','Other')),
  venue_type text not null default 'Home' check (venue_type in ('Home','Away','Neutral')),
  venue_name text, kickoff_at timestamptz not null,
  match_status text not null default 'Scheduled' check (match_status in ('Scheduled','Live','Completed','Postponed','Cancelled')),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  match_report text,
  attendance integer check (attendance is null or attendance >= 0),
  man_of_the_match text, is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists football_club_website_fixtures_public_idx on public.football_club_website_fixtures (business_id, is_published, kickoff_at desc);

create table if not exists public.football_club_website_gallery (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text, media_type text not null default 'Image' check (media_type in ('Image','Video')),
  asset_url text not null, caption text, alt_text text, category text not null default 'Club',
  is_published boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists football_club_website_gallery_public_idx on public.football_club_website_gallery (business_id, is_published, sort_order);

create table if not exists public.football_club_website_sponsors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sponsor_name text not null,
  tier text not null default 'Partner' check (tier in ('Title Sponsor','Principal Sponsor','Official Partner','Partner','Community Partner')),
  logo_url text, website_url text, description text,
  is_published boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists football_club_website_sponsors_public_idx on public.football_club_website_sponsors (business_id, is_published, sort_order);

create table if not exists public.football_club_website_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  event_type text not null default 'Community' check (event_type in ('Trial','Academy','Community','Matchday','Other')),
  description text, start_at timestamptz not null, end_at timestamptz,
  venue text, registration_url text, cover_image_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists football_club_website_events_public_idx on public.football_club_website_events (business_id, is_published, start_at);

create table if not exists public.football_club_website_honours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null, competition_name text, season text,
  honour_type text not null default 'Trophy' check (honour_type in ('Trophy','League Title','Cup','Award','Other')),
  details text, award_date date, image_url text,
  is_published boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists football_club_website_honours_public_idx on public.football_club_website_honours (business_id, is_published, award_date desc);

create table if not exists public.football_club_website_enquiries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  email text, phone text,
  enquiry_type text not null default 'General' check (enquiry_type in ('General','Player Trial','Academy','Sponsorship','Ticketing','Media','Other')),
  subject text, message text not null check (char_length(trim(message)) between 10 and 3000),
  status text not null default 'New' check (status in ('New','In Progress','Resolved','Archived')),
  created_at timestamptz not null default now()
);
create index if not exists football_club_website_enquiries_inbox_idx on public.football_club_website_enquiries (business_id, status, created_at desc);

create or replace function public.can_manage_football_club_website(p_business_id uuid)
returns boolean language sql stable set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.is_platform_developer()
    or public.has_business_role(p_business_id, array['owner','admin','manager']::public.business_role[])
  );
$function$;

create or replace function public.is_published_football_club_website(p_business_id uuid)
returns boolean language sql stable set search_path = ''
as $function$
  select exists (
    select 1 from public.football_club_websites w
    where w.business_id=p_business_id and w.is_published=true and w.maintenance_mode=false
  );
$function$;

alter table public.football_club_websites enable row level security;
alter table public.football_club_website_pages enable row level security;
alter table public.football_club_website_news enable row level security;
alter table public.football_club_website_squad enable row level security;
alter table public.football_club_website_staff enable row level security;
alter table public.football_club_website_fixtures enable row level security;
alter table public.football_club_website_gallery enable row level security;
alter table public.football_club_website_sponsors enable row level security;
alter table public.football_club_website_events enable row level security;
alter table public.football_club_website_honours enable row level security;
alter table public.football_club_website_enquiries enable row level security;

drop policy if exists football_club_website_select on public.football_club_websites;
create policy football_club_website_select on public.football_club_websites
for select to anon, authenticated
using (is_published=true or public.can_manage_football_club_website(business_id));
drop policy if exists football_club_website_insert on public.football_club_websites;
create policy football_club_website_insert on public.football_club_websites
for insert to authenticated with check (public.can_manage_football_club_website(business_id));
drop policy if exists football_club_website_update on public.football_club_websites;
create policy football_club_website_update on public.football_club_websites
for update to authenticated using (public.can_manage_football_club_website(business_id))
with check (public.can_manage_football_club_website(business_id));
drop policy if exists football_club_website_delete on public.football_club_websites;
create policy football_club_website_delete on public.football_club_websites
for delete to authenticated using (public.can_manage_football_club_website(business_id));

do $policies$
declare t text;
begin
  foreach t in array array[
    'football_club_website_pages','football_club_website_news','football_club_website_squad',
    'football_club_website_staff','football_club_website_fixtures','football_club_website_gallery',
    'football_club_website_sponsors','football_club_website_events','football_club_website_honours',
    'football_club_website_standings','football_club_website_transfers'
  ]
  loop
    execute format('drop policy if exists %I on public.%I',t||'_select',t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (public.can_manage_football_club_website(business_id) or (is_published=true and public.is_published_football_club_website(business_id)))',t||'_select',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_manage_football_club_website(business_id))',t||'_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_update',t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_manage_football_club_website(business_id)) with check (public.can_manage_football_club_website(business_id))',t||'_update',t);
    execute format('drop policy if exists %I on public.%I',t||'_delete',t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_manage_football_club_website(business_id))',t||'_delete',t);
  end loop;
end;
$policies$;

drop policy if exists football_club_website_enquiries_select on public.football_club_website_enquiries;
create policy football_club_website_enquiries_select on public.football_club_website_enquiries
for select to authenticated using (public.can_manage_football_club_website(business_id));
drop policy if exists football_club_website_enquiries_insert on public.football_club_website_enquiries;
create policy football_club_website_enquiries_insert on public.football_club_website_enquiries
for insert to anon, authenticated with check (
  public.is_published_football_club_website(business_id)
  and char_length(trim(full_name)) between 2 and 100
  and char_length(trim(message)) between 10 and 3000
);
drop policy if exists football_club_website_enquiries_update on public.football_club_website_enquiries;
create policy football_club_website_enquiries_update on public.football_club_website_enquiries
for update to authenticated using (public.can_manage_football_club_website(business_id))
with check (public.can_manage_football_club_website(business_id));
drop policy if exists football_club_website_enquiries_delete on public.football_club_website_enquiries;
create policy football_club_website_enquiries_delete on public.football_club_website_enquiries
for delete to authenticated using (public.can_manage_football_club_website(business_id));

grant execute on function public.can_manage_football_club_website(uuid) to anon, authenticated;
grant execute on function public.is_published_football_club_website(uuid) to anon, authenticated;
grant select on public.football_club_websites,public.football_club_website_pages,public.football_club_website_news,
 public.football_club_website_squad,public.football_club_website_staff,public.football_club_website_fixtures,
 public.football_club_website_gallery,public.football_club_website_sponsors,public.football_club_website_events,
 public.football_club_website_honours,public.football_club_website_standings,public.football_club_website_transfers to anon;
grant select,insert,update,delete on public.football_club_websites,public.football_club_website_pages,
 public.football_club_website_news,public.football_club_website_squad,public.football_club_website_staff,
 public.football_club_website_fixtures,public.football_club_website_gallery,public.football_club_website_sponsors,
 public.football_club_website_events,public.football_club_website_honours,public.football_club_website_standings,
 public.football_club_website_transfers to authenticated;
revoke all on public.football_club_website_enquiries from anon, authenticated;
grant insert (business_id,full_name,email,phone,enquiry_type,subject,message)
on public.football_club_website_enquiries to anon, authenticated;
grant select,update,delete on public.football_club_website_enquiries to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('club-website-media','club-website-media',true,52428800,
 array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists club_website_media_upload on storage.objects;
create policy club_website_media_upload on storage.objects for insert to authenticated
with check (bucket_id='club-website-media' and exists (
  select 1 from public.businesses b where b.id::text=(storage.foldername(name))[1]
    and public.can_manage_football_club_website(b.id)
));
drop policy if exists club_website_media_update on storage.objects;
create policy club_website_media_update on storage.objects for update to authenticated
using (bucket_id='club-website-media' and exists (
  select 1 from public.businesses b where b.id::text=(storage.foldername(name))[1]
    and public.can_manage_football_club_website(b.id)
))
with check (bucket_id='club-website-media' and exists (
  select 1 from public.businesses b where b.id::text=(storage.foldername(name))[1]
    and public.can_manage_football_club_website(b.id)
));
drop policy if exists club_website_media_delete on storage.objects;
create policy club_website_media_delete on storage.objects for delete to authenticated
using (bucket_id='club-website-media' and exists (
  select 1 from public.businesses b where b.id::text=(storage.foldername(name))[1]
    and public.can_manage_football_club_website(b.id)
));

create or replace function public.platform_club_website_business_directory(p_search text default null)
returns table (business_id uuid,business_name text,industry text,website_id uuid,club_name text,slug text,is_published boolean)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  return query
  select b.id,b.name,b.industry,w.id,w.club_name,w.slug,coalesce(w.is_published,false)
  from public.businesses b left join public.football_club_websites w on w.business_id=b.id
  where b.is_suspended=false
    and (w.id is not null or b.industry ilike '%club%' or b.industry ilike '%football%' or b.industry ilike '%sport%'
      or exists(select 1 from public.business_industry_modules m where m.business_id=b.id
        and m.module_key in ('football_club_manager','football_club_website') and m.is_enabled=true)
      or nullif(trim(p_search),'') is not null)
    and (nullif(trim(p_search),'') is null or b.name ilike '%'||trim(p_search)||'%' or b.industry ilike '%'||trim(p_search)||'%')
  order by (w.id is not null) desc,b.name asc;
end;
$function$;

create or replace function public.platform_create_club_website(p_business_id uuid,p_club_name text,p_slug text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid; v_slug text:=lower(trim(coalesce(p_slug,''))); v_club_name text:=trim(coalesce(p_club_name,''));
begin
  if auth.uid() is null or not public.is_platform_developer() then raise exception 'Developer access required'; end if;
  if p_business_id is null or v_club_name='' or char_length(v_club_name)>120
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'A valid business, club name and website slug are required'; end if;
  if not exists(select 1 from public.businesses b where b.id=p_business_id and b.is_suspended=false and b.is_frozen=false) then
    raise exception 'The selected business workspace is unavailable or frozen';
  end if;
  insert into public.football_club_websites (business_id,club_name,slug) values (p_business_id,v_club_name,v_slug) returning id into v_id;
  insert into public.business_industry_modules (business_id,module_key,is_enabled,configuration,updated_by,updated_at)
  values (p_business_id,'football_club_website',true,jsonb_build_object('activated_by','platform_developer'),auth.uid(),now())
  on conflict (business_id,module_key) do update set is_enabled=true,configuration=excluded.configuration,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs (business_id,actor_user_id,action,entity_table,entity_id,details)
  values (p_business_id,auth.uid(),'club_website_created','football_club_websites',v_id::text,jsonb_build_object('club_name',v_club_name,'slug',v_slug));
  return v_id;
end;
$function$;

revoke all on function public.platform_club_website_business_directory(text) from public,anon;
revoke all on function public.platform_create_club_website(uuid,text,text) from public,anon;
grant execute on function public.platform_club_website_business_directory(text) to authenticated;
grant execute on function public.platform_create_club_website(uuid,text,text) to authenticated;

insert into public.business_industry_modules (business_id,module_key,is_enabled,configuration)
select b.id,'football_club_website',true,jsonb_build_object('activated_by','industry_default')
from public.businesses b
where b.industry ilike '%club%' or b.industry ilike '%football%' or b.industry ilike '%sport%'
 or exists(select 1 from public.business_industry_modules m where m.business_id=b.id and m.module_key='football_club_manager' and m.is_enabled=true)
on conflict (business_id,module_key) do update set is_enabled=true,configuration=excluded.configuration,updated_at=now();
