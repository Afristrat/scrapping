-- Antifragility pack 2026-05-17/18 (devil-advocate hardening Bassira→Kairos)
--
-- pgcrypto requis pour DIGEST() utilisé par le backfill seed_hash + helper SQL.
-- Sur Supabase Cloud, l'extension est généralement disponible mais pas active
-- par défaut sur tous les projets.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

--
-- Trois axes :
--   1. Idempotency : Bassira peut envoyer le même seed 2 fois (retry réseau,
--      navigation utilisateur) sans dupliquer la session ni doubler le coût LLM.
--   2. PII anti-leak : seed_hash matérialisé pour requêtes/logs anonymisés.
--      Le seed lui-même reste en clair en DB (audit obligatoire) mais sous RLS strict.
--   3. Supervision : vue health agrégée + RPC alert_on_failure_spike + cron stale.
--
-- Lien doc : docs/bassira-kairos-devil-advocate.md

-- ─── 1. Colonnes idempotency + seed_hash ─────────────────────────────────

ALTER TABLE research_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS seed_hash TEXT;

-- Constraint format : 1-64 chars, alphanumérique + hyphens (sécurité anti-injection
-- dans les logs / index)
ALTER TABLE research_sessions
  DROP CONSTRAINT IF EXISTS research_sessions_idempotency_key_format;
ALTER TABLE research_sessions
  ADD CONSTRAINT research_sessions_idempotency_key_format
  CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{1,64}$');

-- Index unique partiel : Bassira ne peut pas créer 2 sessions concurrentes
-- avec la même api_key + idempotency_key. Dedup applicatif au insert.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_research_sessions_idempotency
  ON research_sessions(api_key_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_sessions_seed_hash
  ON research_sessions(seed_hash);

COMMENT ON COLUMN research_sessions.idempotency_key IS
  'Token client (1-64 chars alphanumériques) pour dedup retries Bassira → Kairos. Couple unique avec api_key_id.';
COMMENT ON COLUMN research_sessions.seed_hash IS
  'SHA-256 hex first 16 chars du seed. Permet de groupes/comptes sans exposer le seed en clair dans les logs/vue.';

-- ─── 2. Élargissement de l'enum status pour 'stale' ──────────────────────

-- 'stale' = session restée en 'running' au-delà du wall-clock plausible
-- (> 15 min depuis updated_at). Indique un crash EdgeRuntime.waitUntil ou
-- un timeout gateway non capturé.
ALTER TABLE research_sessions
  DROP CONSTRAINT IF EXISTS research_sessions_status_check;
ALTER TABLE research_sessions
  ADD CONSTRAINT research_sessions_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout', 'stale'));

-- ─── 3. Vue research_sessions_health ─────────────────────────────────────

CREATE OR REPLACE VIEW research_sessions_health AS
SELECT
  date_trunc('hour', created_at) AS hour_bucket,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE status = 'running') AS still_running,
  COUNT(*) FILTER (WHERE status = 'stale') AS stale_count,
  COUNT(*) FILTER (WHERE status = 'timeout') AS timeout_count,
  -- Taux d'échec direct
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status IN ('failed', 'timeout', 'stale'))
    / NULLIF(COUNT(*), 0),
    1
  ) AS failure_pct,
  -- Quality warnings extraits du result/error_detail
  COUNT(*) FILTER (
    WHERE result->>'quality_warning' = 'scoring_poor'
       OR result->>'quality_warning' = 'scoring_poor_and_audit_unavailable'
  ) AS scoring_poor_count,
  COUNT(*) FILTER (
    WHERE result->>'quality_warning' = 'quality_fail'
  ) AS audit_fail_count,
  -- Coût total période
  ROUND(SUM(COALESCE((telemetry->>'total_cost_usd')::numeric, 0))::numeric, 4) AS total_cost_usd,
  -- Durée moyenne (completed only) en secondes
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))
    FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL)::numeric, 1) AS avg_duration_s,
  -- p95 latence (completed only)
  ROUND(
    PERCENTILE_CONT(0.95) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))
    ) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL)::numeric,
    1
  ) AS p95_duration_s
FROM research_sessions
WHERE created_at >= now() - INTERVAL '7 days'
GROUP BY date_trunc('hour', created_at)
ORDER BY hour_bucket DESC;

COMMENT ON VIEW research_sessions_health IS
  'Agrégation horaire 7j des research_sessions pour monitoring santé pipeline. Lecture service_role uniquement.';

-- Restreindre l'accès à la vue (service_role bypass RLS automatiquement)
REVOKE ALL ON research_sessions_health FROM PUBLIC;
REVOKE ALL ON research_sessions_health FROM anon;
REVOKE ALL ON research_sessions_health FROM authenticated;

-- ─── 4. RPC alert_on_failure_spike ───────────────────────────────────────

CREATE OR REPLACE FUNCTION alert_on_failure_spike(
  window_minutes INT DEFAULT 60,
  failure_threshold_pct NUMERIC DEFAULT 30
)
RETURNS TABLE (
  triggered BOOLEAN,
  window_start TIMESTAMPTZ,
  total_sessions INT,
  failed_sessions INT,
  failure_pct NUMERIC,
  detail JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_failed INT;
  v_pct NUMERIC;
  v_start TIMESTAMPTZ := now() - (window_minutes || ' minutes')::INTERVAL;
  v_breakdown JSONB;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('failed', 'timeout', 'stale'))
  INTO v_total, v_failed
  FROM research_sessions
  WHERE created_at >= v_start;

  v_pct := CASE WHEN v_total > 0 THEN ROUND(100.0 * v_failed / v_total, 1) ELSE 0 END;

  -- Breakdown par failure_type (extrait de error_detail.failure_type)
  SELECT jsonb_object_agg(failure_type, cnt) INTO v_breakdown
  FROM (
    SELECT
      COALESCE(error_detail->>'failure_type', error_detail->>'error', 'unknown') AS failure_type,
      COUNT(*) AS cnt
    FROM research_sessions
    WHERE created_at >= v_start
      AND status IN ('failed', 'timeout', 'stale')
    GROUP BY 1
  ) sub;

  RETURN QUERY SELECT
    v_pct >= failure_threshold_pct AS triggered,
    v_start AS window_start,
    v_total AS total_sessions,
    v_failed AS failed_sessions,
    v_pct AS failure_pct,
    COALESCE(v_breakdown, '{}'::JSONB) AS detail;
END;
$$;

COMMENT ON FUNCTION alert_on_failure_spike IS
  'Détecte un spike de failures research-from-seed sur fenêtre glissante. Appelé par cron + Bassira monitoring.';

REVOKE ALL ON FUNCTION alert_on_failure_spike FROM PUBLIC;
REVOKE ALL ON FUNCTION alert_on_failure_spike FROM anon;
REVOKE ALL ON FUNCTION alert_on_failure_spike FROM authenticated;

-- ─── 5. Cron : mark stale running sessions ───────────────────────────────

-- Une session 'running' qui n'a pas été updated depuis > 15 min est très
-- probablement victime d'un crash EdgeRuntime.waitUntil ou d'un timeout
-- gateway. On la marque 'stale' pour qu'elle apparaisse dans la vue health
-- et que Bassira frontend ne polle pas indéfiniment.

CREATE OR REPLACE FUNCTION mark_stale_running_sessions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected INT;
BEGIN
  WITH stale_rows AS (
    UPDATE research_sessions
    SET status = 'stale',
        updated_at = now(),
        completed_at = COALESCE(completed_at, now()),
        error_detail = jsonb_build_object(
          'ok', false,
          'error', 'STALE_RUNNING',
          'detail', 'Session restée en running > 15 min sans update — probable crash EdgeRuntime ou timeout gateway.',
          'failure_type', 'stale_running',
          'marked_at', now()
        )
    WHERE status = 'running'
      AND updated_at < now() - INTERVAL '15 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_affected FROM stale_rows;
  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION mark_stale_running_sessions IS
  'Marque stale les sessions running > 15 min sans update. Cron toutes les 5 min.';

SELECT cron.schedule(
  'mark-stale-research-sessions',
  '*/5 * * * *',
  $$SELECT mark_stale_running_sessions()$$
);

-- ─── 5b. Cron : check_failure_spike (30 min) ─────────────────────────────

-- Appelle alert_on_failure_spike et persiste un log si triggered.
-- L'admin/Bassira peut query logs table sur action='research_pipeline:failure_spike_alert'
-- pour voir l'historique d'alertes sans avoir besoin d'un webhook externe.

CREATE OR REPLACE FUNCTION check_failure_spike_and_log()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert RECORD;
  v_founder_id UUID;
BEGIN
  -- Founder user_id : pris depuis app_admins. Fallback NULL si pas d'admin.
  SELECT user_id INTO v_founder_id
  FROM app_admins
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT * INTO v_alert FROM alert_on_failure_spike(60, 30);

  IF v_alert.triggered THEN
    INSERT INTO logs (user_id, action, status, payload, ts)
    VALUES (
      v_founder_id,
      'research_pipeline:failure_spike_alert',
      'warn',
      jsonb_build_object(
        'window_minutes', 60,
        'threshold_pct', 30,
        'failure_pct', v_alert.failure_pct,
        'total_sessions', v_alert.total_sessions,
        'failed_sessions', v_alert.failed_sessions,
        'breakdown', v_alert.detail,
        'window_start', v_alert.window_start
      ),
      now()
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION check_failure_spike_and_log IS
  'Cron-callable : check failure spike + log dans logs table si triggered. Toutes les 30 min.';

SELECT cron.schedule(
  'check-research-failure-spike',
  '*/30 * * * *',
  $$SELECT check_failure_spike_and_log()$$
);

-- ─── 5c. Vue research_alerts_recent (raccourci admin) ────────────────────

CREATE OR REPLACE VIEW research_alerts_recent AS
SELECT
  id,
  ts,
  status,
  payload->>'failure_pct' AS failure_pct,
  payload->>'total_sessions' AS total_sessions,
  payload->>'failed_sessions' AS failed_sessions,
  payload->'breakdown' AS breakdown
FROM logs
WHERE action = 'research_pipeline:failure_spike_alert'
  AND ts >= now() - INTERVAL '7 days'
ORDER BY ts DESC;

REVOKE ALL ON research_alerts_recent FROM PUBLIC;
REVOKE ALL ON research_alerts_recent FROM anon;
REVOKE ALL ON research_alerts_recent FROM authenticated;

COMMENT ON VIEW research_alerts_recent IS
  'Historique 7j des alertes failure spike research-from-seed. Service_role only.';

-- ─── 6. Backfill seed_hash sur les rows existantes ──────────────────────

-- Best-effort : matérialise seed_hash sur les sessions déjà en table.
-- Le hash inclus est SHA-256 first 16 hex chars du seed. Si seed est NULL, on skip.
-- Sur Supabase Cloud, pgcrypto vit dans le schema `extensions`. On qualifie
-- explicitement digest() pour éviter ERROR 42883 function does not exist.
UPDATE research_sessions
SET seed_hash = SUBSTRING(ENCODE(extensions.digest(seed, 'sha256'), 'hex') FOR 16)
WHERE seed_hash IS NULL AND seed IS NOT NULL;
