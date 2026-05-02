-- =============================================================================
-- HOTFIX 2026-05-02 — UNIQUE constraint sur (org_id, provider) pour user_api_keys
-- =============================================================================
-- Bug : le frontend Wave 6.1 (src/hooks/useApiKeys.ts) fait :
--     .upsert(payload, { onConflict: 'org_id,provider' })
-- Mais la table user_api_keys n'a qu'une UNIQUE constraint historique sur
-- (user_id, provider) (migration 20260430000006_modular_config.sql, Wave 1).
-- La colonne org_id a été ajoutée Wave 6.1 (20260502000002_org_id_columns.sql)
-- sans nouvelle contrainte unique.
--
-- Résultat : PostgreSQL retourne 42P10 :
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- → impossible d'enregistrer ou de mettre à jour une clé API depuis l'UI.
--
-- Fix sémantique multi-tenant :
--   - En multi-tenant, une clé API est partagée par tous les membres
--     de l'org (concept de "BYOK org-scoped"). Le user_id reste comme
--     audit trail (qui a uploadé) mais ne fait plus partie de l'unicité.
--   - DROP UNIQUE (user_id, provider) (ancienne logique single-tenant)
--   - ADD UNIQUE (org_id, provider) (nouvelle logique org-scoped)
--
-- Vérifié au préalable via REST /user_api_keys : aucune violation
-- potentielle (3 rows existantes, toutes distinctes sur (org_id, provider)).
-- =============================================================================

-- =============================================================================
-- 1. Drop l'ancienne UNIQUE (user_id, provider)
-- =============================================================================

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_user_id_provider_key;

-- =============================================================================
-- 2. Add nouvelle UNIQUE (org_id, provider)
-- =============================================================================

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_org_id_provider_key
  UNIQUE (org_id, provider);

-- =============================================================================
-- 3. Refresh PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
