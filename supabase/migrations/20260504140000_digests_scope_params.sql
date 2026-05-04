-- =============================================================================
-- Wave 10B — Story S-10B.5
-- Ajout colonne scope_params sur la table digests.
-- Stocke les paramètres de scope utilisés lors de la génération du brief :
--   topic_ids, persona_ids, sources, custom_angle, prioritize.
-- =============================================================================
-- Depends on: 20260501000006_digests_table.sql (digests)
-- =============================================================================

ALTER TABLE digests ADD COLUMN IF NOT EXISTS scope_params JSONB;

COMMENT ON COLUMN digests.scope_params IS 'Paramètres de scope utilisés lors de la génération : topic_ids, persona_ids, sources, custom_angle, prioritize.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
