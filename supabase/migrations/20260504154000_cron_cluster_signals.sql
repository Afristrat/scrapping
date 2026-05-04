-- =============================================================================
-- Wave 10.C — Story S-10C.4 — pg_cron horaire pour cluster-signals
-- =============================================================================
-- Depends on :
--   * 20260430000003_pg_cron.sql       (CREATE EXTENSION pg_cron)
--   * 20260504153000_signal_clusters.sql (tables signal_clusters)
-- =============================================================================
-- TODO post-deploy (utilisateur) :
--   1. Vérifier que `app.settings.supabase_url` et `app.settings.service_role_key`
--      sont définis (réutilisés depuis les autres cron jobs).
--   2. S'assurer que `app.settings.cron_secret` est posé et que le secret
--      CRON_SECRET est configuré sur l'edge fn :
--        bunx supabase secrets set CRON_SECRET=<random>
--   3. pg_net doit être actif (tier pro+ ou fallback GitHub Actions).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotence : supprimer le job s'il existe déjà
DO $$
BEGIN
  PERFORM cron.unschedule('cluster-signals-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'cluster-signals-hourly',
  '0 * * * *',  -- toutes les heures, minute 0
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/cluster-signals',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

COMMENT ON EXTENSION pg_net IS 'Used by cron jobs to POST to Supabase edge functions (cluster-signals hourly).';
