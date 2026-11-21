-- Run the secure notification dispatcher every five minutes once Vault credentials are configured.
begin;
do $schedule$
begin
 if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_extension where extname='supabase_vault') then
  perform cron.unschedule(jobid) from cron.job where jobname='koroma-notification-dispatch';
  perform cron.schedule('koroma-notification-dispatch','*/5 * * * *',$job$
   select case
    when exists(select 1 from vault.decrypted_secrets where name='notification_project_url')
     and exists(select 1 from vault.decrypted_secrets where name='notification_dispatch_key')
    then net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name='notification_project_url' limit 1)||'/functions/v1/dispatch-notifications',
     headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='notification_dispatch_key' limit 1),
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='notification_dispatch_key' limit 1)
     ),
     body := '{}'::jsonb, timeout_milliseconds := 10000
    )
    else null
   end;
  $job$);
 end if;
end;
$schedule$;
commit;