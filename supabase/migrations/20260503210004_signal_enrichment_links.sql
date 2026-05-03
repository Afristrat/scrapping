-- =============================================================================
-- Wave 10A — Story S-10A.4
-- Tables de liaison M2M pour l'enrichissement des signaux :
--   - signal_topics   : signal × topic (LLM ou manuel)
--   - signal_entities : signal × entité nommée
--   - signal_personas : signal × persona PARA avec score de pertinence
-- + Colonnes d'enrichissement sur signals
-- + Vue signals_enriched
-- + Trigger trg_entity_signal_count (utilise la fonction définie en migration 3)
-- =============================================================================
-- Depends on:
--   20260430000001_init.sql (signals)
--   20260503210001_topics_taxonomy.sql (topics_taxonomy)
--   20260503210002_personas.sql (personas)
--   20260503210003_entities.sql (entities, increment_entity_signal_count)
-- =============================================================================

-- =============================================================================
-- signal_topics : liaison signal ↔ topic avec score de confiance LLM
-- =============================================================================

CREATE TABLE signal_topics (
  signal_id  UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  topic_id   UUID NOT NULL REFERENCES topics_taxonomy(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source     TEXT NOT NULL DEFAULT 'llm',
  PRIMARY KEY (signal_id, topic_id)
);

CREATE INDEX idx_signal_topics_signal ON signal_topics(signal_id);
CREATE INDEX idx_signal_topics_topic  ON signal_topics(topic_id);
CREATE INDEX idx_signal_topics_org    ON signal_topics(org_id);

COMMENT ON TABLE signal_topics IS 'Liaison M2M signal ↔ topic avec confiance LLM. source = llm|manual.';

ALTER TABLE signal_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_signal_topics ON signal_topics
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- =============================================================================
-- signal_entities : liaison signal ↔ entité avec mention + contexte
-- =============================================================================

CREATE TABLE signal_entities (
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL,
  mention_text    TEXT,
  context_snippet TEXT,
  confidence      NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (signal_id, entity_id)
);

CREATE INDEX idx_signal_entities_signal ON signal_entities(signal_id);
CREATE INDEX idx_signal_entities_entity ON signal_entities(entity_id);
CREATE INDEX idx_signal_entities_org    ON signal_entities(org_id);

COMMENT ON TABLE signal_entities IS 'Liaison M2M signal ↔ entité nommée. mention_text = forme exacte dans le texte, context_snippet = phrase environnante.';

ALTER TABLE signal_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_signal_entities ON signal_entities
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- Trigger : incrémente entities.signal_count à chaque nouveau lien signal→entité
CREATE TRIGGER trg_entity_signal_count
  AFTER INSERT ON signal_entities
  FOR EACH ROW EXECUTE FUNCTION increment_entity_signal_count();

-- =============================================================================
-- signal_personas : liaison signal ↔ persona avec score de pertinence
-- =============================================================================

CREATE TABLE signal_personas (
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  persona_id      UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL,
  relevance_score NUMERIC(3,2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  reasoning       TEXT,
  PRIMARY KEY (signal_id, persona_id)
);

CREATE INDEX idx_signal_personas_signal  ON signal_personas(signal_id);
CREATE INDEX idx_signal_personas_persona ON signal_personas(persona_id);
CREATE INDEX idx_signal_personas_org     ON signal_personas(org_id);

COMMENT ON TABLE signal_personas IS 'Liaison M2M signal ↔ persona PARA. relevance_score = pertinence calculée par LLM pour ce persona.';

ALTER TABLE signal_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_signal_personas ON signal_personas
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- =============================================================================
-- Colonnes d'enrichissement sur signals
-- =============================================================================

-- weight : poids éditorial du signal (0.0 - 1.0), calculé lors de l'enrichissement
ALTER TABLE signals ADD COLUMN IF NOT EXISTS weight NUMERIC(4,3);

-- editorial_kind : classification éditoriale (news, research, opinion, job, etc.)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS editorial_kind TEXT;

-- enriched_at : timestamp du dernier enrichissement (topics + personas + entities)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN signals.weight IS 'Poids éditorial 0.0–1.0 calculé lors enrichissement LLM.';
COMMENT ON COLUMN signals.editorial_kind IS 'Classification éditoriale : news, research, opinion, funding, job, product, misc.';
COMMENT ON COLUMN signals.enriched_at IS 'Timestamp du dernier enrichissement (topics + personas + entités). NULL = non enrichi.';

-- =============================================================================
-- Vue signals_enriched : signals + agrégats d'enrichissement
-- =============================================================================

CREATE OR REPLACE VIEW signals_enriched AS
SELECT
  s.*,
  ARRAY(
    SELECT t.slug
    FROM signal_topics st
    JOIN topics_taxonomy t ON t.id = st.topic_id
    WHERE st.signal_id = s.id
  ) AS topic_slugs,
  ARRAY(
    SELECT p.key
    FROM signal_personas sp
    JOIN personas p ON p.id = sp.persona_id
    WHERE sp.signal_id = s.id
    ORDER BY sp.relevance_score DESC
    LIMIT 3
  ) AS top_personas,
  ARRAY(
    SELECT e.canonical_name
    FROM signal_entities se
    JOIN entities e ON e.id = se.entity_id
    WHERE se.signal_id = s.id
    ORDER BY se.confidence DESC
    LIMIT 5
  ) AS top_entities
FROM signals s;

COMMENT ON VIEW signals_enriched IS 'Vue enrichie : signals + topic_slugs[] + top_personas[] + top_entities[]. Lecture seule — mutations via les tables sources.';

-- Grants
REVOKE ALL ON signals_enriched FROM PUBLIC;
GRANT SELECT ON signals_enriched TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
