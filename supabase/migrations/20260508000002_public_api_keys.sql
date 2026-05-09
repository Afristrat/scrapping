-- Migration : Table public_api_keys + sliding-window rate limit (Kairos K06).
--
-- Authentifie les clients EXTERNES (Bassira et autres) qui appellent
-- `research-from-seed` SANS JWT user (pipeline orchestré).
--
-- Différent de `api_keys` (Wave 6 BYOK provider keys, user-scoped) : ici on
-- gère des clés d'INTÉGRATION inter-services émises manuellement par l'admin
-- Kairos pour Bassira-prod, Bassira-staging, etc.
--
-- Sécurité :
--   * Stockage hashé (sha256). La clé claire est jamais persistée côté
--     Kairos — seulement transmise à Bassira lors de la création.
--   * `key_prefix` (8 premiers chars) permet l'identification rapide pour
--     révocation/audit sans exposer la clé.
--   * RLS activé, AUCUNE policy user — accès strictement service_role.
--
-- Volumétrie cible : < 10 clés vivantes en parallèle, hits ~60 RPM par clé.

CREATE TABLE IF NOT EXISTS public_api_keys (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text           NOT NULL,
  key_hash             text           NOT NULL UNIQUE,
  key_prefix           text           NOT NULL,
  scopes               text[]         NOT NULL DEFAULT ARRAY['research-only'],
  rate_limit_per_min   integer        NOT NULL DEFAULT 60,
  daily_budget_usd     numeric(10,4),
  active               boolean        NOT NULL DEFAULT true,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  last_used_at         timestamptz,
  notes                text
);

CREATE INDEX IF NOT EXISTS idx_public_api_keys_key_hash
  ON public_api_keys (key_hash) WHERE active;

CREATE INDEX IF NOT EXISTS idx_public_api_keys_prefix
  ON public_api_keys (key_prefix);

ALTER TABLE public_api_keys ENABLE ROW LEVEL SECURITY;

-- Pas de policy user : table strictement admin-only via service_role.

COMMENT ON TABLE public_api_keys IS
  'Clés API d''intégration inter-services (ex: Bassira → Kairos research-from-seed). '
  'Hash sha256, accès service_role uniquement.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Sliding-window rate-limit hits
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public_api_rate_hits (
  api_key_id  uuid          NOT NULL REFERENCES public_api_keys(id) ON DELETE CASCADE,
  hit_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_api_rate_hits_key_time
  ON public_api_rate_hits (api_key_id, hit_at);

ALTER TABLE public_api_rate_hits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public_api_rate_hits IS
  'Hits par clé pour rate limit sliding-window (60s). Purge cron toutes les 15min.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron : purge hits > 1h (toutes les 15 minutes)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-public-api-rate-hits');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'purge-public-api-rate-hits',
  '*/15 * * * *',
  $$ DELETE FROM public.public_api_rate_hits WHERE hit_at < now() - interval '1 hour' $$
);
