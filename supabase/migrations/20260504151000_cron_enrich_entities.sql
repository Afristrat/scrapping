-- =============================================================================
-- Wave 10C — Story S-10C.2
-- pg_cron : lancer enrich-entities toutes les 30 minutes
--
-- Prérequis : extensions pg_cron et pg_net activées sur le projet Supabase.
-- Si non disponibles, ce cron peut être ignoré et la edge fn appelée manuellement.
-- =============================================================================

-- Note : pg_cron et pg_net doivent être activés dans les extensions Supabase
-- (Dashboard → Database → Extensions → pg_cron + pg_net).
-- Si ces extensions sont absentes, commenter le bloc SELECT cron.schedule ci-dessous.

DO $outer$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    PERFORM cron.schedule(
      'enrich-entities-cron',
      '*/30 * * * *',
      $cron$SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/enrich-entities',
        headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
        body := '{}'::jsonb
      )$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron ou pg_net non disponible — enrich-entities-cron non planifié. Appeler manuellement POST /functions/v1/enrich-entities.';
  END IF;
END $outer$;
