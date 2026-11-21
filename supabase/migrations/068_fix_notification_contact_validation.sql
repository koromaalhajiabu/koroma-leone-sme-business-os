begin;
alter table public.notification_channel_preferences drop constraint if exists notification_email_format, drop constraint if exists notification_phone_e164;
alter table public.notification_channel_preferences
 add constraint notification_email_format check(email_address is null or email_address ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'),
 add constraint notification_phone_e164 check(phone_e164 is null or phone_e164 ~ '^[+][1-9][0-9]{7,14}$');
commit;