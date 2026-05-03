-- =============================================================================
-- Wave 10A — Story S-10A.3
-- Table personas : profils PARA (Projects / Hats / Resources / Inbox)
-- par organisation. Peut être partagé au niveau org (user_id NULL)
-- ou privé à un utilisateur (user_id non NULL).
-- =============================================================================
-- Depends on: 20260502000001_orgs.sql (organizations)
--             20260502000015_fix_orgm_recursion.sql (orgm_self_select policy)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE persona_kind AS ENUM ('project', 'hat', 'resource', 'inbox');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE personas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        persona_kind NOT NULL,
  name        TEXT NOT NULL,
  key         TEXT NOT NULL,
  context_md  TEXT,
  date_start  DATE,
  date_end    DATE,
  is_archived BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE INDEX idx_personas_org     ON personas(org_id);
CREATE INDEX idx_personas_user    ON personas(user_id);
CREATE INDEX idx_personas_kind    ON personas(org_id, kind);

COMMENT ON TABLE personas IS 'Personas PARA (Projects/Hats/Resources/Inbox) par org. user_id NULL = partagé org ; user_id non NULL = privé utilisateur.';
COMMENT ON COLUMN personas.key IS 'Identifiant court unique par org (ex: cto-watch, fundraising-2026). Utilisé pour le routing enrichissement.';
COMMENT ON COLUMN personas.date_end IS 'NULL pour Hat et Resource (durée indéfinie). Renseigné pour Project (fin de projet).';

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

-- SELECT : membres de l'org + filtre sur ses propres personas OU les partagées
CREATE POLICY own_personas_select ON personas
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- INSERT : membres de l'org
CREATE POLICY own_personas_insert ON personas
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- UPDATE : membres de l'org + ses propres personas OU les partagées
CREATE POLICY own_personas_update ON personas
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- DELETE : membres de l'org + ses propres personas OU les partagées
CREATE POLICY own_personas_delete ON personas
  FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Trigger updated_at
CREATE TRIGGER trg_personas_updated_at
  BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
