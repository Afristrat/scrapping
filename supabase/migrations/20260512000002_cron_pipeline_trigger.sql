-- =============================================================================
-- Migration : déclenchement quotidien automatique du pipeline (portage Saqr P1)
--
-- Avant : le pipeline était 100 % manuel (bouton dashboard uniquement).
-- Après : pg_cron → cron-pipeline-trigger (x-cron-secret) → run-pipeline en
-- mode interne (ADR 0009) pour chaque user opt-in (settings.cron_enabled).
-- =============================================================================

-- 1. Opt-in + télémetrie du cron sur settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cron_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cron_last_run_at TIMESTAMPTZ;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cron_last_run_status TEXT;

COMMENT ON COLUMN settings.cron_enabled IS
  'Opt-in au déclenchement quotidien automatique du pipeline (cron-pipeline-trigger).';

-- 2. Variante paramétrée de unscored_signals pour le mode interne :
--    l''originale repose sur auth.uid(), nul en service_role.
--    SECURITY DEFINER + search_path épinglé + EXECUTE réservé à service_role
--    (précédent : 20260510000001_harden_definer_functions).
CREATE OR REPLACE FUNCTION public.unscored_signals_for(p_user_id UUID, lim INT DEFAULT 100)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM signals s
  WHERE s.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM scores sc
      WHERE sc.signal_id = s.id AND sc.user_id = p_user_id
    )
  ORDER BY s.scraped_at DESC
  LIMIT lim;
$$;

REVOKE EXECUTE ON FUNCTION public.unscored_signals_for(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unscored_signals_for(UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unscored_signals_for(UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unscored_signals_for(UUID, INT) TO service_role;

COMMENT ON FUNCTION public.unscored_signals_for(UUID, INT) IS
  'Variante interne de unscored_signals (auth.uid() nul en service_role). Réservée à service_role.';

-- 3. Job pg_cron quotidien (05:00 UTC) → cron-pipeline-trigger (tous les opt-in)
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
  PERFORM cron.unschedule('pipeline-trigger-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job absent au premier passage
END
$outer$;

SELECT cron.schedule(
  'pipeline-trigger-daily',
  '0 5 * * *',  -- tous les jours à 05:00 UTC
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/cron-pipeline-trigger',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);

NOTIFY pgrst, 'reload schema';
