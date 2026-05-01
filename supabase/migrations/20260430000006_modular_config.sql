-- Modular config : user API keys, scoring rubrics, settings extensions, tokens_summary RPC
-- Depends on: 20260430000001_init.sql (tables), 20260430000002_rls.sql (RLS + init_user_settings)

-- =============================================================================
-- user_api_keys : clés API par user, par provider
-- =============================================================================

CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openrouter', 'apify')),
  encrypted_key TEXT NOT NULL,
  masked_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Read policy : user voit ses propres clés (encrypted_key incluse via RLS,
-- le front ne doit exposer que masked_key - responsabilité applicative).
CREATE POLICY "own_api_keys_read_masked" ON user_api_keys FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Write policy : insert, update, delete sur ses propres clés uniquement.
CREATE POLICY "own_api_keys_modify" ON user_api_keys FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_api_keys_update" ON user_api_keys FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_api_keys_delete" ON user_api_keys FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_api_keys_user ON user_api_keys(user_id);

-- Trigger updated_at
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE user_api_keys IS 'Per-user API keys by provider. encrypted_key stores plaintext for now, future migration to Vault.';
COMMENT ON COLUMN user_api_keys.encrypted_key IS 'Plaintext key (Vault migration planned). Never expose to client, use masked_key instead.';
COMMENT ON COLUMN user_api_keys.masked_key IS 'Display-safe masked version (e.g. sk-...abc).';

-- =============================================================================
-- scoring_rubrics : grilles de scoring custom multiples par user
-- =============================================================================

CREATE TABLE scoring_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 10 AND 4000),
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scoring_rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_rubrics" ON scoring_rubrics FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_rubrics_user ON scoring_rubrics(user_id);

CREATE TRIGGER trg_rubrics_updated_at
  BEFORE UPDATE ON scoring_rubrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE scoring_rubrics IS 'Custom scoring rubrics per user. Each rubric has a prompt and weighted criteria.';
COMMENT ON COLUMN scoring_rubrics.criteria IS 'JSON array of {label, weight} objects. Weights should sum to 1.0.';

-- =============================================================================
-- settings : nouveaux champs (active_rubric_id, source_priority, apify_config)
-- =============================================================================

ALTER TABLE settings
  ADD COLUMN active_rubric_id UUID REFERENCES scoring_rubrics(id) ON DELETE SET NULL,
  ADD COLUMN source_priority JSONB NOT NULL DEFAULT '{"reddit":1.0,"arxiv":1.0,"x":1.0}'::jsonb,
  ADD COLUMN apify_config JSONB NOT NULL DEFAULT '{
    "x_list_ids": ["2049788531178926529"],
    "x_max_items": 100,
    "reddit_actor": "automation-lab/reddit-scraper",
    "reddit_sort": "top",
    "reddit_time_filter": "week",
    "reddit_max_per_sub": 25
  }'::jsonb;

COMMENT ON COLUMN settings.active_rubric_id IS 'FK to scoring_rubrics. NULL = use legacy prompt_scoring field.';
COMMENT ON COLUMN settings.source_priority IS 'Weight multiplier per source for ranking. Shape: {reddit:number, arxiv:number, x:number}.';
COMMENT ON COLUMN settings.apify_config IS 'Apify actor configuration for X and Reddit scraping.';

-- =============================================================================
-- init_user_settings : update pour seeder un rubric default au signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.init_user_settings()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rubric_id UUID;
BEGIN
  -- Seed default scoring rubric
  INSERT INTO public.scoring_rubrics(user_id, name, description, prompt, criteria, is_default)
  VALUES (
    NEW.id,
    'Default builder IA',
    'Score builder-oriented: pertinence pour quelqu''un qui construit avec l''IA.',
    'Score de 0 a 100 la pertinence de ce signal pour un builder IA. Justifie en 1 phrase.',
    '[{"label":"Innovation","weight":0.35},{"label":"Actionable","weight":0.35},{"label":"Credibilite source","weight":0.30}]'::jsonb,
    true
  )
  RETURNING id INTO v_rubric_id;

  -- Upsert settings with active_rubric_id pointing to the new rubric
  INSERT INTO public.settings(user_id, active_rubric_id)
  VALUES (NEW.id, v_rubric_id)
  ON CONFLICT (user_id) DO UPDATE SET active_rubric_id = EXCLUDED.active_rubric_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RPC tokens_summary : aggregation costs par jour/modele
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tokens_summary(days INT DEFAULT 7)
RETURNS TABLE(
  day DATE,
  model TEXT,
  prompt_tokens BIGINT,
  completion_tokens BIGINT,
  total_cost NUMERIC,
  calls BIGINT
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    date_trunc('day', ts)::date AS day,
    model,
    SUM(prompt_tokens)::bigint AS prompt_tokens,
    SUM(completion_tokens)::bigint AS completion_tokens,
    SUM(cost) AS total_cost,
    COUNT(*)::bigint AS calls
  FROM public.llm_costs
  WHERE user_id = auth.uid()
    AND ts >= now() - (days || ' days')::interval
  GROUP BY 1, 2
  ORDER BY 1 DESC, 5 DESC;
$$;

COMMENT ON FUNCTION public.tokens_summary IS 'Returns daily token usage and cost breakdown by model for the authenticated user.';
