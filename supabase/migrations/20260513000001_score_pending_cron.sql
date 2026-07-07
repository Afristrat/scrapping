-- =============================================================================
-- Migration : rattrapage automatique du backlog de scoring (portage Saqr P1)
--
-- Avant : run-pipeline plafonne le scoring à SCORE_LIMIT=50/run — au-delà, le
-- backlog de signaux non scorés n'est jamais rattrapé (aucun worker dédié).
-- Après : pg_cron toutes les 2 min -> score-pending (x-cron-secret), qui
-- fan-out une invocation par utilisateur connu et chaîne par lots de 60
-- jusqu'à épuisement du backlog (cf. supabase/functions/score-pending).
-- =============================================================================

DO $outer$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponible : %', SQLERRM;
END
$outer$;

DO $outer$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net indisponible : %', SQLERRM;
END
$outer$;

-- Rejouable : supprimer le job existant avant de le recréer
DO $outer$
BEGIN
  PERFORM cron.unschedule('score-pending-tick');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job absent au premier passage
END
$outer$;

SELECT cron.schedule(
  'score-pending-tick',
  '*/2 * * * *', -- toutes les 2 minutes
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/score-pending',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

NOTIFY pgrst, 'reload schema';
