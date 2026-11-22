
alter table public.businesses
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists tax_registration_number text,
  add column if not exists receipt_footer text;

comment on column public.businesses.contact_email is 'Business contact email displayed in business profile and documents.';
comment on column public.businesses.contact_phone is 'Business contact phone displayed in business profile and documents.';
comment on column public.businesses.address is 'Registered or trading address for this business workspace.';
comment on column public.businesses.website is 'Public website for this business workspace.';
comment on column public.businesses.tax_registration_number is 'Tax or business registration reference for documents.';
comment on column public.businesses.receipt_footer is 'Optional custom message printed at the bottom of receipts.';
