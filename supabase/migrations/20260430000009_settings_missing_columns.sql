-- Ajoute les colonnes settings utilisées par le frontend mais absentes de l'init.
-- Frontend refs : src/hooks/useSettings.ts, useUpdateSettings.ts, pages/Settings.tsx.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS language          TEXT    NOT NULL DEFAULT 'fr'
    CHECK (language IN ('fr', 'en', 'es')),
  ADD COLUMN IF NOT EXISTS model_digest      TEXT    NOT NULL DEFAULT 'anthropic/claude-haiku-4.5',
  ADD COLUMN IF NOT EXISTS score_concurrency INTEGER NOT NULL DEFAULT 20
    CHECK (score_concurrency BETWEEN 1 AND 100);

COMMENT ON COLUMN settings.language          IS 'Langue du brief LLM (fr, en, es).';
COMMENT ON COLUMN settings.model_digest      IS 'Modèle OpenRouter utilisé pour la synthèse digest.';
COMMENT ON COLUMN settings.score_concurrency IS 'Nombre de scoring LLM en parallèle (1-100).';

-- Refresh PostgREST schema cache (sinon erreur "column not found in schema cache").
NOTIFY pgrst, 'reload schema';
