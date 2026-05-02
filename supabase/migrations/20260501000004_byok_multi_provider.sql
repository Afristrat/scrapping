-- BYOK multi-provider : élargir user_api_keys, ajouter provider_models, model_config sur settings
-- Depends on: 20260430000006_modular_config.sql (user_api_keys), 20260430000001_init.sql (settings)

-- =============================================================================
-- Étendre user_api_keys aux nouveaux providers
-- =============================================================================

ALTER TABLE user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_provider_check;

ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS validation_status TEXT
    CHECK (validation_status IN ('valid','invalid','unknown') OR validation_status IS NULL),
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

-- =============================================================================
-- provider_models : cache des modèles disponibles par (user, provider)
-- =============================================================================

CREATE TABLE provider_models (
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  display_name          TEXT,
  context_window        INTEGER,
  pricing_input_per_1m  DOUBLE PRECISION,
  pricing_output_per_1m DOUBLE PRECISION,
  capabilities          JSONB NOT NULL DEFAULT '[]',
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider, model_id)
);

ALTER TABLE provider_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_provider_models_select" ON provider_models FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_provider_models_insert" ON provider_models FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_provider_models_update" ON provider_models FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_provider_models_delete" ON provider_models FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_provider_models_user_provider ON provider_models(user_id, provider);
CREATE INDEX idx_provider_models_fetched ON provider_models(fetched_at);

-- =============================================================================
-- settings.model_config : sélection (provider, model) par tâche
-- Format: { "scoring": {"provider":"openrouter","model":"anthropic/claude-haiku-4.5"}, ... }
-- =============================================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS model_config JSONB NOT NULL DEFAULT '{}';

-- Backfill depuis les 4 colonnes existantes (modèles déjà choisis avant migration BYOK).
-- Tous assumés sur 'openrouter' puisque c'était le seul provider supporté.
UPDATE settings
SET model_config = jsonb_strip_nulls(jsonb_build_object(
  'scoring',     CASE WHEN model_scoring     IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_scoring)     END,
  'scraping',    CASE WHEN model_scraping    IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_scraping)    END,
  'monitoring',  CASE WHEN model_monitoring  IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_monitoring)  END,
  'digest',      CASE WHEN model_digest      IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_digest)      END
))
WHERE model_config = '{}'::jsonb OR model_config IS NULL;
