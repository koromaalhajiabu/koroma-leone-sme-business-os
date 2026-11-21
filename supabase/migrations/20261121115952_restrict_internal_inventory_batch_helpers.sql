-- Keep internal SECURITY DEFINER inventory batch helpers off the client RPC surface.
-- These functions are called from protected SECURITY DEFINER workflows.
BEGIN;

REVOKE ALL ON FUNCTION public.consume_product_batches(uuid, uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.transfer_product_batches(uuid, uuid, uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;

COMMIT;
