BEGIN;

CREATE TABLE IF NOT EXISTS public.business_notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'subscription','payment','orders','approvals','inventory','delivery','system'
  )),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.business_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_notification_preferences_read_own
  ON public.business_notification_preferences;
CREATE POLICY business_notification_preferences_read_own
  ON public.business_notification_preferences FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS business_notification_preferences_insert_own
  ON public.business_notification_preferences;
CREATE POLICY business_notification_preferences_insert_own
  ON public.business_notification_preferences FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS business_notification_preferences_update_own
  ON public.business_notification_preferences;
CREATE POLICY business_notification_preferences_update_own
  ON public.business_notification_preferences FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS business_notification_preferences_delete_own
  ON public.business_notification_preferences;
CREATE POLICY business_notification_preferences_delete_own
  ON public.business_notification_preferences FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.business_notification_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.business_notification_preferences TO authenticated;

REVOKE ALL ON public.business_notifications FROM anon, authenticated;
GRANT SELECT ON public.business_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.business_notifications TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'business_notifications') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.business_notifications';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'business_notification_preferences') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.business_notification_preferences';
    END IF;
  END IF;
END $$;

COMMIT;
