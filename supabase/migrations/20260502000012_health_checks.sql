-- =============================================================================
-- Wave 6 — Sub-wave 6.5 — Story S6-SLAMonitoring
-- Health checks append-only pour la page /status publique et l'engagement
-- contractuel SLA 99,9 % du plan Enterprise.
--
-- Stratégie : un cron interne (record-health-check) ou un appel externe
-- (UptimeRobot, BetterStack, Pingdom...) écrit les résultats dans cette
-- table toutes les 1 à 5 minutes. La table est volontairement publique en
-- lecture (transparence du status page) mais write-only pour le
-- service_role afin d'éviter toute pollution.
--
-- La vue `daily_uptime` agrège le pourcentage de disponibilité par
-- service et par jour sur les 90 derniers jours, format consommé
-- directement par la timeline frontend (Recharts).
-- =============================================================================
-- Depends on:
--   20260430000001_init.sql (extensions, base schema)
-- =============================================================================

-- =============================================================================
-- ENUMs : health_service + health_status
-- =============================================================================

CREATE TYPE health_service AS ENUM ('db', 'minio', 'llm', 'apify');

CREATE TYPE health_status AS ENUM ('ok', 'degraded', 'down');

COMMENT ON TYPE health_service IS
  'Services monitorés pour la SLA Enterprise : Postgres (db), object storage (minio), LLM provider (OpenRouter), scraper (Apify).';
COMMENT ON TYPE health_status IS
  'ok = healthy ; degraded = lent (latence > seuil) ; down = unreachable / 5xx.';

-- =============================================================================
-- TABLE : health_checks
-- =============================================================================

CREATE TABLE health_checks (
  id          BIGSERIAL PRIMARY KEY,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  service     health_service NOT NULL,
  status      health_status NOT NULL,
  latency_ms  INTEGER,
  error       TEXT
);

COMMENT ON TABLE health_checks IS
  'Append-only log des sondes de disponibilité. Lecture publique pour le status page, écriture service_role uniquement.';
COMMENT ON COLUMN health_checks.latency_ms IS
  'Latence du check en ms. NULL si la sonde a timeout avant mesure.';
COMMENT ON COLUMN health_checks.error IS
  'Message d''erreur si status != ok (max 500 chars conseillés).';

-- =============================================================================
-- INDEXES
-- Patterns de query :
--   1. Dernier statut par service        → (service, checked_at DESC)
--   2. Aggregation timeline 30 / 90 j    → (checked_at DESC) + filter service
--   3. Liste des incidents (status != ok) → partial index
-- =============================================================================

CREATE INDEX idx_health_checks_service_time
  ON health_checks (service, checked_at DESC);

CREATE INDEX idx_health_checks_time
  ON health_checks (checked_at DESC);

CREATE INDEX idx_health_checks_incidents
  ON health_checks (checked_at DESC)
  WHERE status <> 'ok';

-- =============================================================================
-- VIEW : daily_uptime
-- Pourcentage de disponibilité par service par jour sur 90 j.
-- uptime_pct = checks OK / checks totaux * 100.
-- =============================================================================

CREATE OR REPLACE VIEW daily_uptime AS
SELECT
  service,
  date_trunc('day', checked_at)::date           AS day,
  COUNT(*)                                       AS total_checks,
  COUNT(*) FILTER (WHERE status = 'ok')          AS ok_checks,
  COUNT(*) FILTER (WHERE status = 'degraded')    AS degraded_checks,
  COUNT(*) FILTER (WHERE status = 'down')        AS down_checks,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'ok'))::numeric
      / NULLIF(COUNT(*), 0)::numeric * 100,
    3
  )                                              AS uptime_pct,
  COALESCE(
    AVG(latency_ms) FILTER (WHERE status = 'ok')::numeric(10, 2),
    0
  )                                              AS avg_latency_ms
FROM health_checks
WHERE checked_at >= now() - INTERVAL '90 days'
GROUP BY service, date_trunc('day', checked_at)
ORDER BY day DESC, service;

COMMENT ON VIEW daily_uptime IS
  'Aggrégation 90 j du % de disponibilité par service par jour. Source de la timeline /status.';

-- =============================================================================
-- RLS : ENABLE
-- Append-only pattern :
--   - SELECT : public (anon + authenticated) → status page transparent
--   - INSERT : aucune policy → seul service_role bypasse RLS
--   - UPDATE / DELETE : aucune policy → append-only by design
-- =============================================================================

ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_checks_public_select" ON health_checks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pas de policy INSERT / UPDATE / DELETE — seul service_role (utilisé par la
-- edge fn record-health-check + cron) peut écrire. Les utilisateurs finaux
-- n'ont donc aucun moyen de polluer ou réécrire l'historique.

-- Vue : héritée RLS de la table sous-jacente. On expose via grant explicite.
GRANT SELECT ON daily_uptime TO anon, authenticated;

-- =============================================================================
-- pg_cron : purge des checks > 90 jours (1 fois par jour à 03:30 UTC)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'health_checks_purge_90d',
      '30 3 * * *',
      $cron$
        DELETE FROM health_checks
        WHERE checked_at < now() - INTERVAL '90 days';
      $cron$
    );
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
