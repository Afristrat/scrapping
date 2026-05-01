-- Init schema zlatan-scrap : signals + scores + logs + llm_costs + settings
-- Conventions :
--   - 1 user = 1 fork = 1 instance Supabase indépendante
--   - RLS appliquée dans la migration suivante (20260430000002_rls.sql)

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE signal_source AS ENUM ('reddit', 'arxiv', 'x');
CREATE TYPE llm_task AS ENUM ('scraping', 'scoring', 'monitoring');

-- =============================================================================
-- signals : ingestion brute des sources
-- =============================================================================

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source signal_source NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT,
  title TEXT,
  raw_payload JSONB NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_id)
);

CREATE INDEX idx_signals_user_scraped ON signals(user_id, scraped_at DESC);
CREATE INDEX idx_signals_user_source  ON signals(user_id, source, scraped_at DESC);

COMMENT ON TABLE signals IS 'Raw signals scraped from external sources.';
COMMENT ON COLUMN signals.external_id IS 'Native ID from source (Reddit post id, Arxiv abs URL, X tweet id).';

-- =============================================================================
-- scores : score LLM par signal × user
-- =============================================================================

CREATE TABLE scores (
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  reasoning TEXT,
  model_used TEXT NOT NULL,
  cost NUMERIC NOT NULL DEFAULT 0,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, user_id)
);

CREATE INDEX idx_scores_user_score ON scores(user_id, score DESC);

COMMENT ON TABLE scores IS 'LLM-generated relevance score per signal per user.';

-- =============================================================================
-- logs : trace requêtes scrape/LLM (purgés < 24h via pg_cron)
-- =============================================================================

CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB,
  status TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_user_ts ON logs(user_id, ts DESC);

COMMENT ON TABLE logs IS 'Action logs (scrape/LLM/pipeline). Purged hourly, kept < 24h.';

-- =============================================================================
-- llm_costs : tracking coûts par tâche/modèle/jour
-- =============================================================================

CREATE TABLE llm_costs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task llm_task NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  cost NUMERIC NOT NULL DEFAULT 0,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_costs_user_ts       ON llm_costs(user_id, ts DESC);
CREATE INDEX idx_llm_costs_user_task_day ON llm_costs(user_id, task, (date_trunc('day', ts AT TIME ZONE 'UTC')));

COMMENT ON TABLE llm_costs IS 'Per-call OpenRouter cost tracking.';

-- =============================================================================
-- settings : 1 ligne par user (auto-créée via trigger sur auth.users)
-- =============================================================================

CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  model_scraping   TEXT NOT NULL DEFAULT 'openrouter/auto',
  model_scoring    TEXT NOT NULL DEFAULT 'anthropic/claude-haiku-4.5',
  model_monitoring TEXT NOT NULL DEFAULT 'openrouter/auto',
  prompt_scoring   TEXT NOT NULL DEFAULT 'Score de 0 à 100 la pertinence de ce signal pour un builder IA. Justifie en 1 phrase.',
  reddit_subs      TEXT[] NOT NULL DEFAULT ARRAY['LocalLLaMA','MachineLearning','singularity'],
  arxiv_categories TEXT[] NOT NULL DEFAULT ARRAY['cs.AI','cs.CL'],
  x_queries        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  branding         JSONB NOT NULL DEFAULT '{"name":"zlatan-scrap","primary":"#3b82f6","logo_url":null}'::jsonb,
  daily_budget_usd NUMERIC NOT NULL DEFAULT 1.00,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE settings IS 'Per-user customization (models, prompts, sources, branding, budget).';

-- =============================================================================
-- updated_at trigger pour settings
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
