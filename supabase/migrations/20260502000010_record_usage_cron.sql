-- =============================================================================
-- Wave 6 — Sub-wave 6.2 — Story S6-MeteredUsage
-- Schedule pg_cron quotidien (3h00 UTC) qui invoque l'edge fn `record-usage`
-- pour agréger l'usage par organization sur les dernières 24h et reporter
-- l'overage à Stripe via metered prices.
-- =============================================================================
-- Depends on:
--   * 20260430000003_pg_cron.sql      (CREATE EXTENSION pg_cron)
--   * 20260502000001_orgs.sql         (table usage_records, subscriptions)
--   * 20260502000002_org_id_columns.sql (org_id sur logs / llm_costs / signals)
-- =============================================================================
-- TODO post-deploy (utilisateur) :
--   1. Set le secret `app.settings.cron_secret` :
--        ALTER DATABASE postgres SET app.settings.cron_secret = '<random>';
--      (ou via Dashboard > Settings > Database > Custom Postgres Config)
--      Le même secret doit aussi être posé en env de l'edge fn :
--        bunx supabase secrets set CRON_SECRET=<random>
--   2. Set le secret `app.settings.supabase_url` (URL projet Supabase) si non
--      déjà configuré pour pg_net dans une migration précédente.
--   3. Vérifier que pg_net est dispo (tier Supabase gérant pg_net = pro+ ; sur
--      free tier, fallback : appel manuel quotidien via GitHub Actions).
-- =============================================================================

-- Pré-requis : pg_cron déjà actif (cf. 20260430000003_pg_cron.sql).
-- pg_net : extension qui permet de POST en HTTP depuis un job cron.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================================
-- Cron job : record-usage-daily
--   * Schedule : 0 3 * * *  → tous les jours à 03:00 UTC (= 04:00 ou 05:00 Paris
--     selon DST). Choix de 03:00 UTC pour limiter les conflits avec le reste
--     du pipeline et garantir une fenêtre stable de 24h écoulées.
--   * Action  : POST {SUPABASE_URL}/functions/v1/record-usage
--                 - Header `Authorization: Bearer <service_role>` (pour passer
--                   le supabase auth gateway de l'edge fn).
--                 - Header `x-cron-secret: <secret>` (validé par l'edge fn).
--   * Idempotence : la table `usage_records` a un UNIQUE(org_id, period_start,
--     period_end) → un re-run sur la même fenêtre fait un upsert sans doublon.
-- =============================================================================

-- On supprime un éventuel job précédent du même nom (idempotence migration).
DO $$
BEGIN
  PERFORM cron.unschedule('record-usage-daily');
EXCEPTION WHEN OTHERS THEN
  -- Le job n existe pas → ok, on continue.
  NULL;
END
$$;

SELECT cron.schedule(
  'record-usage-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/record-usage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

COMMENT ON EXTENSION pg_net IS 'Used by cron jobs to POST to Supabase edge functions (record-usage daily).';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
