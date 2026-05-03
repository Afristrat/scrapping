-- =============================================================================
-- Wave 10A — Story S-10A.5
-- Table entities : entités nommées extraites des signaux (personnes, orgs,
-- technos, papers, produits). Déduplication par canonical_name + kind.
-- Trigger pour incrémenter signal_count depuis signal_entities (migration suivante).
-- =============================================================================
-- Depends on: 20260502000001_orgs.sql (organizations)
--             20260502000015_fix_orgm_recursion.sql (orgm_self_select policy)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE entity_kind AS ENUM ('person', 'organization', 'technology', 'paper', 'product');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE entities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind           entity_kind NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases        TEXT[],
  external_url   TEXT,
  metadata       JSONB,
  first_seen_at  TIMESTAMPTZ DEFAULT now(),
  last_seen_at   TIMESTAMPTZ DEFAULT now(),
  signal_count   INT DEFAULT 0,
  UNIQUE (org_id, kind, canonical_name)
);

CREATE INDEX idx_entities_org      ON entities(org_id);
CREATE INDEX idx_entities_kind     ON entities(org_id, kind);
CREATE INDEX idx_entities_name     ON entities(org_id, canonical_name);

COMMENT ON TABLE entities IS 'Entités nommées dédupliquées par org. signal_count incrémenté via trigger depuis signal_entities.';
COMMENT ON COLUMN entities.canonical_name IS 'Nom canonique normalisé (ex: "OpenAI", "Sam Altman"). Clé de déduplication.';
COMMENT ON COLUMN entities.aliases IS 'Autres formes rencontrées (ex: ["openai", "open-ai"]). Utilisé pour le matching.';
COMMENT ON COLUMN entities.signal_count IS 'Nombre de signaux mentionnant cette entité. Incrémenté automatiquement via trigger.';

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- SELECT : membres de l'org
CREATE POLICY own_entities_select ON entities
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- INSERT : membres de l'org
CREATE POLICY own_entities_insert ON entities
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- UPDATE : membres de l'org
CREATE POLICY own_entities_update ON entities
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- DELETE : membres de l'org
CREATE POLICY own_entities_delete ON entities
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- Fonction trigger pour incrémenter signal_count lors d'un ajout dans signal_entities
-- La table signal_entities est créée dans la migration suivante (20260503210004).
CREATE OR REPLACE FUNCTION increment_entity_signal_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE entities
  SET signal_count = signal_count + 1,
      last_seen_at = now()
  WHERE id = NEW.entity_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_entity_signal_count() IS 'Trigger AFTER INSERT sur signal_entities → incrémente entities.signal_count + met à jour last_seen_at.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
