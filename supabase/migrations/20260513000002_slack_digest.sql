-- =============================================================================
-- Migration : digest Slack quotidien "Veille IA" (portage Saqr P1, adapté
-- multi-tenant Kairos)
--
-- Avant : aucune notification proactive, l'utilisateur doit ouvrir le dashboard.
-- Après : pg_cron -> slack-digest (par utilisateur opt-in avec webhook posé) ->
-- top 10 des signaux scorés >= 60 sur les dernières 24h, posté sur son webhook
-- Slack. Gate DST-proof (heure de Paris calculée nativement par Postgres) +
-- anti-doublon (1 post/23h par utilisateur, basé sur logs.action='slack:digest').
--
-- Kairos n'a pas de pipeline de traduction FR au scrape (contrairement à Saqr,
-- title_fr/excerpt_fr) : le titre posté est donc toujours le titre original.
-- =============================================================================

-- 1. Config par utilisateur : webhook (secret, jamais exposé côté client via
-- RLS lecture — cf. policy own_settings existante qui couvre déjà cette
-- colonne) + toggle opt-in (défaut false : notification nouvelle, pas de spam).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS slack_digest_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN settings.slack_webhook_url IS
  'Webhook Slack (Incoming Webhook) pour le digest "Veille IA" quotidien. Secret utilisateur.';
COMMENT ON COLUMN settings.slack_digest_enabled IS
  'Opt-in au digest Slack quotidien (nécessite slack_webhook_url configuré).';

-- 2. RPC bornée : top N signaux scorés d'une fenêtre, triés par score. Même
-- pattern que unscored_signals_for (SECURITY DEFINER + search_path épinglé +
-- EXECUTE réservé service_role, précédent 20260510000001).
CREATE OR REPLACE FUNCTION public.live_report_candidates(
  p_user_id   UUID,
  p_since     TIMESTAMPTZ,
  p_min_score INT DEFAULT 60,
  p_limit     INT DEFAULT 150
)
RETURNS TABLE (
  id     UUID,
  source TEXT,
  url    TEXT,
  title  TEXT,
  score  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.source, s.url, s.title, sc.score
  FROM signals s
  JOIN scores sc ON sc.signal_id = s.id AND sc.user_id = s.user_id
  WHERE s.user_id = p_user_id
    AND s.scraped_at >= p_since
    AND sc.score >= p_min_score
  ORDER BY sc.score DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.live_report_candidates(UUID, TIMESTAMPTZ, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_report_candidates(UUID, TIMESTAMPTZ, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.live_report_candidates(UUID, TIMESTAMPTZ, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.live_report_candidates(UUID, TIMESTAMPTZ, INT, INT) TO service_role;

COMMENT ON FUNCTION public.live_report_candidates(UUID, TIMESTAMPTZ, INT, INT) IS
  'Top N signaux scorés d''une fenêtre temporelle, triés par score DESC. Réservée à service_role.';

-- 3. Cron DST-proof : pg_cron (cron.timezone=GMT) n'a pas de notion de fuseau
-- par job. On déplace le gate horaire dans une fonction SECURITY DEFINER qui
-- calcule l'heure de Paris nativement (DST géré par Postgres, pas par nous) et
-- fan-out un x-cron-secret POST par utilisateur opt-in. Anti-doublon par
-- utilisateur : logs.action='slack:digest' status='ok' < 23h.
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

CREATE OR REPLACE FUNCTION public.trigger_slack_digest_fanout()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_paris_hour INT;
  v_secret TEXT;
  v_url TEXT;
  r RECORD;
BEGIN
  -- Fenêtre 19h-22h heure de Paris, été comme hiver (DST géré nativement par
  -- `AT TIME ZONE`). Le schedule tick */30 entre 17h et 21h UTC couvre les
  -- deux décalages possibles (CEST=+2, CET=+1) ; cette fonction ne fire que
  -- dans la vraie fenêtre Paris.
  v_paris_hour := extract(hour FROM now() AT TIME ZONE 'Europe/Paris')::int;
  IF v_paris_hour < 19 OR v_paris_hour > 22 THEN
    RETURN;
  END IF;

  v_secret := current_setting('app.settings.cron_secret', true);
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_secret IS NULL OR v_url IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT user_id FROM public.settings
    WHERE slack_digest_enabled = true AND slack_webhook_url IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.logs
      WHERE action = 'slack:digest' AND status = 'ok' AND user_id = r.user_id
        AND ts > now() - interval '23 hours'
    ) THEN
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/slack-digest',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('user_id', r.user_id)
    );
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public.trigger_slack_digest_fanout() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_slack_digest_fanout() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_slack_digest_fanout() FROM authenticated;

DO $outer$
BEGIN
  PERFORM cron.unschedule('slack-digest-tick');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job absent au premier passage
END
$outer$;

SELECT cron.schedule(
  'slack-digest-tick',
  '*/30 17-21 * * *', -- toutes les 30 min ; le gate Paris dans la fonction fait le reste
  $cron$ SELECT public.trigger_slack_digest_fanout(); $cron$
);

NOTIFY pgrst, 'reload schema';
