-- research-from-seed async pattern (K09e)
--
-- Le pipeline complet (subjects + rubric + scrape + score + synthesize + audit)
-- dépasse souvent le Gateway Supabase IDLE_TIMEOUT 150s sur un sync call.
-- Pattern async : POST crée une session, lance pipeline en background,
-- retourne immédiatement. GET ?session_id=X poll le status + result.

CREATE TABLE IF NOT EXISTS research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public_api_keys(id) ON DELETE SET NULL,
  proxy_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'timeout')
  ),
  seed TEXT NOT NULL,
  lang TEXT NOT NULL,
  sector_hint TEXT,
  depth_hint INT,
  result JSONB,
  error_detail JSONB,
  telemetry JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_research_sessions_api_key_id ON research_sessions(api_key_id);
CREATE INDEX IF NOT EXISTS idx_research_sessions_expires_at ON research_sessions(expires_at);

ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
-- Pas de policy user — accès service_role only (K06 gère).

-- Purge horaire des sessions expirées (24h TTL)
SELECT cron.schedule(
  'purge-research-sessions-hourly',
  '0 * * * *',
  $$DELETE FROM research_sessions WHERE expires_at < now()$$
);

COMMENT ON TABLE research_sessions IS
  'Stockage async des runs research-from-seed. POST crée une row + lance pipeline waitUntil, GET poll status + result. TTL 24h.';
