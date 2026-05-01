-- llm_providers : single source of truth pour la config des providers BYOK
-- Depends on: 20260501000004_byok_multi_provider.sql

CREATE TABLE llm_providers (
  id                    TEXT PRIMARY KEY,
  label                 TEXT NOT NULL,
  default_base_url      TEXT NOT NULL,
  auth_scheme           TEXT NOT NULL CHECK (auth_scheme IN ('bearer','x-api-key','none')),
  models_endpoint       TEXT NOT NULL DEFAULT '/models',
  extra_headers         JSONB NOT NULL DEFAULT '{}',
  base_url_overridable  BOOLEAN NOT NULL DEFAULT false,
  models_requires_auth  BOOLEAN NOT NULL DEFAULT true,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  hint                  TEXT,
  display_order         INTEGER NOT NULL DEFAULT 100,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lecture publique (anonymous role) pour le frontend (ces données ne sont pas secrètes)
ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "llm_providers_public_read" ON llm_providers FOR SELECT TO anon, authenticated
  USING (enabled = true);

-- Seed des 10 providers actuels (ordre d'affichage dans Settings)
INSERT INTO llm_providers (id, label, default_base_url, auth_scheme, extra_headers, base_url_overridable, models_requires_auth, hint, display_order) VALUES
  ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'bearer', '{}'::jsonb, false, true, 'Proxy multi-LLM (Claude, GPT, Gemini, Llama, Kimi, etc.) — markup ~5%', 10),
  ('moonshot', 'Moonshot (Kimi)', 'https://api.moonshot.ai/v1', 'bearer', '{}'::jsonb, false, true, 'Modèles Kimi (k2-0711, K1.5) — fenêtre contexte 128k+', 20),
  ('anthropic', 'Anthropic (Claude)', 'https://api.anthropic.com/v1', 'x-api-key', '{"anthropic-version": "2023-06-01"}'::jsonb, false, true, 'Claude Opus / Sonnet / Haiku — accès direct sans proxy', 30),
  ('openai', 'OpenAI', 'https://api.openai.com/v1', 'bearer', '{}'::jsonb, false, true, 'GPT-5, GPT-4o, o1 — accès direct', 40),
  ('google', 'Google (Gemini)', 'https://generativelanguage.googleapis.com/v1beta/openai', 'bearer', '{}'::jsonb, false, true, 'Gemini 2.x — endpoint OpenAI-compatible', 50),
  ('mistral', 'Mistral', 'https://api.mistral.ai/v1', 'bearer', '{}'::jsonb, false, true, 'Mistral Large / Small / Codestral', 60),
  ('groq', 'Groq', 'https://api.groq.com/openai/v1', 'bearer', '{}'::jsonb, false, true, 'Inférence ultra-rapide (LPU)', 70),
  ('together', 'Together AI', 'https://api.together.xyz/v1', 'bearer', '{}'::jsonb, false, true, 'Inférence open-source à l''échelle', 80),
  ('deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'bearer', '{}'::jsonb, false, true, 'DeepSeek-R1, V3 — reasoning low-cost', 90),
  ('ollama', 'Ollama (self-hosted)', 'http://localhost:11434/v1', 'none', '{}'::jsonb, true, false, 'Modèles locaux — base URL configurable', 100);

-- FK soft : provider_id sur user_api_keys + provider_models pour cohérence
-- (pas de hard FK pour permettre la rétrocompat avec les valeurs déjà insérées)
CREATE INDEX idx_llm_providers_enabled_order ON llm_providers(enabled, display_order);

COMMENT ON TABLE llm_providers IS 'Single source of truth pour la config BYOK des providers LLM. Lu par frontend et edge functions.';
