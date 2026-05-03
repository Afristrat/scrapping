-- =============================================================================
-- Wave 10A — Story S-10A.1
-- Table topics_taxonomy : taxonomie hiérarchique de veille par organisation.
-- Supporte self-referencing (parent_id) pour les catégories/sous-catégories.
-- =============================================================================
-- Depends on: 20260502000001_orgs.sql (organizations)
--             20260502000015_fix_orgm_recursion.sql (orgm_self_select policy)
-- =============================================================================

CREATE TABLE topics_taxonomy (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES topics_taxonomy(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  is_seeded   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX idx_topics_taxonomy_org    ON topics_taxonomy(org_id);
CREATE INDEX idx_topics_taxonomy_parent ON topics_taxonomy(parent_id);

COMMENT ON TABLE topics_taxonomy IS 'Taxonomie hiérarchique de topics de veille par organisation. Les topics is_seeded sont insérés par migration seed.';
COMMENT ON COLUMN topics_taxonomy.slug IS 'Identifiant URL-safe unique par org. Ex: llm, agents-ia, rag.';
COMMENT ON COLUMN topics_taxonomy.is_seeded IS 'true si inséré par la migration seed Wave 10A. false si créé par l''utilisateur.';

ALTER TABLE topics_taxonomy ENABLE ROW LEVEL SECURITY;

-- SELECT : membres de l'org
CREATE POLICY own_topics_taxonomy_select ON topics_taxonomy
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- INSERT : membres de l'org
CREATE POLICY own_topics_taxonomy_insert ON topics_taxonomy
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- UPDATE : membres de l'org
CREATE POLICY own_topics_taxonomy_update ON topics_taxonomy
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- DELETE : membres de l'org
CREATE POLICY own_topics_taxonomy_delete ON topics_taxonomy
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
