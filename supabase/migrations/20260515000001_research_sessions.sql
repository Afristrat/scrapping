-- research_sessions — tracking async pour research-from-seed (S-PORT-ASYNC).
--
-- Le pipeline complet (research-strategist → rubric-architect → scrape →
-- llm-score-batch → signal-synthesizer → quality-auditor) enchaîne jusqu'à
-- 7 appels réseau et dépasse fréquemment le budget wall-clock d'une requête
-- HTTP synchrone (mesuré en prod sur ce repo, commit aedc93f, ligne main
-- jamais mergée : research-strategist 31s, rubric 22s, scrape 44s, score 12s,
-- synthesizer 45s, auditor 14s = ~168s cumulés). Pattern async : POST crée une
-- row + lance le pipeline en EdgeRuntime.waitUntil, retourne 202 immédiat ;
-- GET ?session_id=X poll status + result.
--
-- Scoping sécurité : api_key_id (jamais NULL, résolu à la création) — une clé
-- ne peut lire que ses propres sessions. org_id nullable pour l'instant :
-- la résolution proxy_user_id→org_id sur les clés existantes est le
-- périmètre de S-PROV-03, pas de celle-ci (pas de scope creep).

CREATE TABLE IF NOT EXISTS research_sessions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id        UUID          NOT NULL REFERENCES public_api_keys(id) ON DELETE CASCADE,
  org_id            UUID          REFERENCES organizations(id) ON DELETE SET NULL,
  status            TEXT          NOT NULL DEFAULT 'running' CHECK (
                                    status IN ('running', 'completed', 'failed')
                                  ),
  seed              TEXT          NOT NULL,
  lang              TEXT          NOT NULL,
  sector_hint       TEXT,
  depth_hint        SMALLINT,
  output_profile    TEXT,
  idempotency_key   TEXT,
  result            JSONB,
  error_detail      JSONB,
  telemetry         JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ   NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_api_key_id ON research_sessions(api_key_id);
CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_research_sessions_expires_at ON research_sessions(expires_at);

-- Dédup idempotency_key par clé appelante (index partiel, NULL exclu — la
-- plupart des appels n'en fournissent pas).
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_sessions_key_idempotency
  ON research_sessions(api_key_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
-- Pas de policy user — accès service_role uniquement (même pattern que
-- signals_session, 20260508000001). research_sessions n'est jamais exposée
-- directement à un JWT user, seule research-from-seed (service_role) y touche.

COMMENT ON TABLE research_sessions IS
  'Tracking async des runs research-from-seed (S-PORT-ASYNC). POST crée une '
  'row + lance le pipeline en waitUntil, GET ?session_id=X poll status + '
  'result. TTL 24h, accès service_role uniquement, scopé par api_key_id.';

-- Purge horaire des sessions expirées (pg_cron déjà activé).
DO $$
BEGIN
  PERFORM cron.unschedule('purge-research-sessions-hourly');
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- job pas encore créé, premier passage de la migration
END $$;

SELECT cron.schedule(
  'purge-research-sessions-hourly',
  '0 * * * *',
  $$ DELETE FROM public.research_sessions WHERE expires_at < now() $$
);
