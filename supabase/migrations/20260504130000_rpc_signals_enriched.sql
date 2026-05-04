-- =============================================================================
-- Wave 10B — Story S-10B.1
-- RPC enriched_signals : signaux enrichis avec filtres multi-axes
-- (topics, personas, sources, score min, fenêtre temporelle, cursor-based)
-- =============================================================================
-- Depends on:
--   20260503210001_topics_taxonomy.sql (topics_taxonomy)
--   20260503210002_personas.sql (personas)
--   20260503210003_entities.sql (entities)
--   20260503210004_signal_enrichment_links.sql (signal_topics, signal_personas, signal_entities)
-- =============================================================================

CREATE OR REPLACE FUNCTION enriched_signals(
  p_org_id       UUID,
  p_topic_slugs  TEXT[]    DEFAULT NULL,
  p_persona_keys TEXT[]    DEFAULT NULL,
  p_sources      TEXT[]    DEFAULT NULL,
  p_min_score    INT       DEFAULT NULL,
  p_window_hours INT       DEFAULT NULL,
  p_cursor       TIMESTAMPTZ DEFAULT NULL,
  p_limit        INT       DEFAULT 50
)
RETURNS TABLE (
  id             UUID,
  org_id         UUID,
  user_id        UUID,
  source         TEXT,
  external_id    TEXT,
  url            TEXT,
  title          TEXT,
  raw_payload    JSONB,
  scraped_at     TIMESTAMPTZ,
  enriched_at    TIMESTAMPTZ,
  weight         NUMERIC,
  editorial_kind TEXT,
  topic_slugs    TEXT[],
  top_personas   TEXT[],
  top_entities   TEXT[],
  score          INT,
  reasoning      TEXT,
  model_used     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.id,
    s.org_id,
    s.user_id,
    s.source::TEXT,
    s.external_id,
    s.url,
    s.title,
    s.raw_payload,
    s.scraped_at,
    s.enriched_at,
    s.weight,
    s.editorial_kind,
    COALESCE(
      ARRAY(
        SELECT t.slug
        FROM signal_topics st
        JOIN topics_taxonomy t ON t.id = st.topic_id
        WHERE st.signal_id = s.id AND st.org_id = p_org_id
      ),
      '{}'::TEXT[]
    ) AS topic_slugs,
    COALESCE(
      ARRAY(
        SELECT p.key
        FROM signal_personas sp
        JOIN personas p ON p.id = sp.persona_id
        WHERE sp.signal_id = s.id AND sp.org_id = p_org_id
        ORDER BY sp.relevance_score DESC
        LIMIT 3
      ),
      '{}'::TEXT[]
    ) AS top_personas,
    COALESCE(
      ARRAY(
        SELECT e.canonical_name
        FROM signal_entities se
        JOIN entities e ON e.id = se.entity_id
        WHERE se.signal_id = s.id AND se.org_id = p_org_id
        ORDER BY se.confidence DESC
        LIMIT 5
      ),
      '{}'::TEXT[]
    ) AS top_entities,
    sc.score::INT,
    sc.reasoning,
    sc.model_used
  FROM signals s
  LEFT JOIN scores sc ON sc.signal_id = s.id AND sc.user_id = s.user_id
  WHERE
    s.org_id = p_org_id
    AND (p_sources IS NULL OR s.source::TEXT = ANY(p_sources))
    AND (p_window_hours IS NULL OR s.scraped_at >= NOW() - (p_window_hours || ' hours')::INTERVAL)
    AND (p_cursor IS NULL OR s.scraped_at < p_cursor)
    AND (p_min_score IS NULL OR sc.score >= p_min_score)
    AND (
      p_topic_slugs IS NULL OR
      EXISTS (
        SELECT 1 FROM signal_topics st
        JOIN topics_taxonomy t ON t.id = st.topic_id
        WHERE st.signal_id = s.id AND t.slug = ANY(p_topic_slugs)
      )
    )
    AND (
      p_persona_keys IS NULL OR
      EXISTS (
        SELECT 1 FROM signal_personas sp
        JOIN personas p ON p.id = sp.persona_id
        WHERE sp.signal_id = s.id AND p.key = ANY(p_persona_keys)
      )
    )
  ORDER BY s.scraped_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION enriched_signals TO authenticated;

COMMENT ON FUNCTION enriched_signals IS
  'RPC Wave 10B : retourne les signaux enrichis (topics + personas + entités + score) '
  'avec filtres dynamiques multi-axes et pagination cursor-based.';
