-- Restrict SECURITY DEFINER functions to their intended invocation surfaces.
-- Trigger/event-trigger handlers are internal only. Functions containing explicit
-- authenticated/platform/business authorization checks are callable by authenticated
-- users only. Deliberately public storefront, tracking, and public portal RPCs remain
-- public and must continue to validate their inputs and expose only intended fields.
BEGIN;

DO $hardening$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature,
           p.prorettype::regtype::text AS return_type,
           EXISTS (
             SELECT 1 FROM pg_trigger t
             WHERE t.tgfoid=p.oid AND NOT t.tgisinternal
           ) AS trigger_bound,
           (
             position('auth.uid()' in pg_get_functiondef(p.oid))>0
             OR position('is_platform_developer' in pg_get_functiondef(p.oid))>0
             OR position('has_business_role' in pg_get_functiondef(p.oid))>0
             OR position('is_business_member' in pg_get_functiondef(p.oid))>0
           ) AS has_authz_guard
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  LOOP
    IF r.trigger_bound OR r.return_type IN ('trigger','event_trigger') THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        r.signature
      );
    ELSIF r.has_authz_guard THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',r.signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);
    END IF;
  END LOOP;
END
$hardening$;

COMMIT;
