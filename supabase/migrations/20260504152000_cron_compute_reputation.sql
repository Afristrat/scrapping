-- =============================================================================
-- Wave 10C — Story S-10C.3
-- Schedule pg_cron quotidien (3h00 UTC) qui invoque l'edge fn `compute-reputation`
-- pour recalculer le score de réputation des auteurs (entités kind='person')
-- via la file d'attente pending_enrichments (pass_kind='reputation').
-- =============================================================================
-- Depends on:
--   * 20260430000003_pg_cron.sql      (CREATE EXTENSION pg_cron)
--   * 20260502000010_record_usage_cron.sql (CREATE EXTENSION pg_net)
--   * 20260504150000_pending_enrichments.sql (table pending_enrichments)
--   * 20260503210003_entities.sql     (table entities)
--   * 20260503210004_signal_enrichment_links.sql (table signal_entities)
-- =============================================================================
-- Post-deploy : vérifier que les secrets suivants sont bien configurés :
--   app.settings.supabase_url    → URL du projet Supabase
--   app.settings.service_role_key → clé service_role (auto-injectée en général)
--   app.settings.cron_secret     → secret partagé validé par l'edge fn
-- =============================================================================

-- pg_cron et pg_net doivent déjà être activés.
-- On les crée ici en IF NOT EXISTS pour idempotence sur des fresh installs,
-- mais en pratique ils sont déjà présents depuis les migrations précédentes.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  -- Extension non disponible sur ce tier (ex: local Supabase CLI) → on commente
  -- le cron.schedule() ci-dessous manuellement si nécessaire.
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
-- Cron job : compute-reputation-daily
--   * Schedule : 0 3 * * *  → tous les jours à 03:00 UTC
--   * Action   : POST {SUPABASE_URL}/functions/v1/compute-reputation
--                 - Header Authorization: Bearer <service_role>
--                 - Header x-cron-secret: <secret>
--   * Idempotence : les pending_enrichments avec status='completed' sont ignorés
--     par l'edge fn → un re-run est sans effet sur les jobs déjà traités.
-- =============================================================================

-- Supprimer un éventuel job précédent du même nom (idempotence migration).
DO $$
BEGIN
  PERFORM cron.unschedule('compute-reputation-daily');
EXCEPTION WHEN OTHERS THEN
  -- Le job n'existe pas → ok, on continue.
  NULL;
END
$$;

-- Programmer le job quotidien à 3h UTC.
-- Si pg_cron ou pg_net ne sont pas disponibles sur ce tier, mettre ce bloc
-- en commentaire et déclencher l'edge fn manuellement ou via GitHub Actions.
SELECT cron.schedule(
  'compute-reputation-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/compute-reputation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Used by cron jobs (record-usage daily, compute-reputation daily).';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
