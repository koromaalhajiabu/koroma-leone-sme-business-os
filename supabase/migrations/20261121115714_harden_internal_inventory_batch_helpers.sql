-- Restrict internal inventory batch helpers to trusted database workflows.
-- These SECURITY DEFINER functions directly mutate tracked batch quantities.
-- Their protected callers are SECURITY DEFINER functions owned by postgres.
BEGIN;

REVOKE ALL ON FUNCTION public.consume_product_batches(uuid, uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.transfer_product_batches(uuid, uuid, uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;

COMMIT;
