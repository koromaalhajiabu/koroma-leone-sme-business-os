-- Enforce in-app-only notifications. External delivery remains disabled.
BEGIN;

-- Prevent creation of outbound email/SMS/WhatsApp queue entries.
DROP TRIGGER IF EXISTS trg_queue_external_business_notification
ON public.business_notifications;

-- Keep per-user preferences readable but not changeable through the client API.
REVOKE INSERT, UPDATE, DELETE
ON public.notification_channel_preferences
FROM authenticated;

GRANT SELECT
ON public.notification_channel_preferences
TO authenticated;

COMMIT;
