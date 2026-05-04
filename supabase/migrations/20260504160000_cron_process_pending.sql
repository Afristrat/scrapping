-- =============================================================================
-- Wave 10.C — Story S-10C.7 — pg_cron 30min pour process-pending-enrichments
-- =============================================================================
-- Dépendances :
--   * 20260430000003_pg_cron.sql           (CREATE EXTENSION pg_cron)
--   * 20260502000010_record_usage_cron.sql  (CREATE EXTENSION pg_net)
--   * 20260504150000_pending_enrichments.sql (table pending_enrichments)
--   * 20260504151000_cron_enrich_entities.sql
--   * 20260504152000_cron_compute_reputation.sql
--   * 20260504154000_cron_cluster_signals.sql
-- =============================================================================
-- Post-deploy :
--   Vérifier que les secrets suivants sont configurés :
--     app.settings.supabase_url       → URL du projet Supabase
--     app.settings.service_role_key   → clé service_role
--     app.settings.cron_secret        → secret partagé validé par l'edge fn
-- =============================================================================

-- Idempotence : pg_cron et pg_net déjà activés — on les crée IF NOT EXISTS
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- =============================================================================
-- Cron job : process-pending-enrichments-30min
--   * Schedule : */30 * * * *  → toutes les 30 minutes
--   * Action   : POST {SUPABASE_URL}/functions/v1/process-pending-enrichments
--                Header Authorization: Bearer <service_role>
--   * Idempotence : la fn ré-évalue les jobs pending à chaque run
-- =============================================================================

-- Supprimer un éventuel job précédent du même nom (idempotence migration)
DO $$
BEGIN
  PERFORM cron.unschedule('process-pending-enrichments-30min');
EXCEPTION WHEN OTHERS THEN
  -- Le job n'existe pas → ok, on continue
  NULL;
END
$$;

SELECT cron.schedule(
  'process-pending-enrichments-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/process-pending-enrichments',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Used by cron jobs (record-usage, compute-reputation, process-pending-enrichments).';
