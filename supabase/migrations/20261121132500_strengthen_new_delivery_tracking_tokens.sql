BEGIN;
ALTER TABLE public.delivery_jobs
  ALTER COLUMN tracking_code
  SET DEFAULT upper(substr(encode(gen_random_bytes(16),'hex'),1,24));
COMMIT;