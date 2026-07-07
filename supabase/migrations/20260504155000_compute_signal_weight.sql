-- =============================================================================
-- Wave 10C — Story S-10C.5 — Compute weight composite signal
-- Fonction PL/pgSQL + triggers pour calculer le poids composite d'un signal.
--
-- Formule :
--   weight = importance * 0.4 + frequency * 0.2 + utility * 0.3 + reputation * 0.1
--
-- Composantes :
--   importance  = scores.score / 100.0 pour ce signal (via org → user le plus récent)
--   utility     = même valeur qu'importance (simplification Wave 10C)
--   frequency   = ratio d'entités du signal ayant ≥ 3 signaux dans les 7 derniers jours
--   reputation  = moyenne des metadata->>'reputation_score' des entités liées
-- =============================================================================
-- Depends on :
--   * 20260430000001_init.sql          (signals, scores)
--   * 20260502000002_org_id_columns.sql (scores.org_id)
--   * 20260503210003_entities.sql       (entities, metadata->>'reputation_score')
--   * 20260503210004_signal_enrichment_links.sql (signal_entities)
-- =============================================================================

-- =============================================================================
-- 1. Modifier la colonne signals.weight pour NUMERIC(5,4) DEFAULT 0
--    (était NUMERIC(4,3) sans DEFAULT ajouté par migration 20260503210004)
--
-- La vue signals_enriched utilise SELECT * FROM signals, ce qui la rend
-- dépendante du type de weight. On la supprime et la recrée après l'ALTER.
-- =============================================================================

-- Sauvegarder les grants de la vue avant de la supprimer
DROP VIEW IF EXISTS signals_enriched CASCADE;

-- Modifier le type + ajouter DEFAULT 0
ALTER TABLE signals
  ALTER COLUMN weight TYPE NUMERIC(5,4) USING weight::NUMERIC(5,4),
  ALTER COLUMN weight SET DEFAULT 0;

COMMENT ON COLUMN signals.weight IS 'Poids composite 0.0000–1.0000 : importance×0.4 + frequency×0.2 + utility×0.3 + reputation×0.1.';

-- Recréer la vue signals_enriched (identique à 20260503210004 — SELECT * inclut weight NUMERIC(5,4))
-- security_invoker=on : la vue applique la RLS de `signals` avec les droits de
-- l'appelant (org-scopée). Sans cela, la vue s'exécute avec les droits du
-- propriétaire (postgres) et expose les signaux de toutes les organisations.
CREATE OR REPLACE VIEW signals_enriched WITH (security_invoker = on) AS
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

COMMENT ON VIEW signals_enriched IS 'Vue enrichie : signals + topic_slugs[] + top_entities[] + top_personas[]. weight type mis à jour NUMERIC(5,4) — S-10C.5.';

-- Rétablir les grants
REVOKE ALL ON signals_enriched FROM PUBLIC;
GRANT SELECT ON signals_enriched TO authenticated;

-- =============================================================================
-- 2. Fonction compute_signal_weight
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_signal_weight(
  p_signal_id UUID,
  p_org_id    UUID
)
RETURNS NUMERIC(5,4)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_importance  NUMERIC := 0;
  v_utility     NUMERIC := 0;
  v_frequency   NUMERIC := 0;
  v_reputation  NUMERIC := 0;
  v_total_ents  INT := 0;
  v_freq_ents   INT := 0;
  v_weight      NUMERIC(5,4);
BEGIN
  -- --------------------------------------------------------------------
  -- importance + utility : score LLM le plus récent pour ce signal × org
  -- On prend le score du user ayant scoré le plus récemment dans l'org.
  -- --------------------------------------------------------------------
  SELECT COALESCE(sc.score / 100.0, 0)
    INTO v_importance
    FROM scores sc
   WHERE sc.signal_id = p_signal_id
     AND sc.org_id    = p_org_id
   ORDER BY sc.scored_at DESC
   LIMIT 1;

  -- utility = importance (simplification Wave 10C — critères détaillés en Wave 10D)
  v_utility := v_importance;

  -- --------------------------------------------------------------------
  -- frequency : nombre d'entités du signal ayant eu ≥ 3 signaux dans les
  -- 7 derniers jours / nombre total d'entités du signal (ratio 0-1).
  -- Une entité est "fréquente" si elle apparaît dans ≥ 3 signaux différents
  -- sur la fenêtre 7j pour la même org.
  -- --------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_total_ents
    FROM signal_entities se
   WHERE se.signal_id = p_signal_id
     AND se.org_id    = p_org_id;

  IF v_total_ents > 0 THEN
    SELECT COUNT(*)
      INTO v_freq_ents
      FROM signal_entities se
     WHERE se.signal_id = p_signal_id
       AND se.org_id    = p_org_id
       AND (
         -- Nombre de signaux distincts liés à cette entité dans les 7j ≥ 3
         SELECT COUNT(DISTINCT se2.signal_id)
           FROM signal_entities se2
           JOIN signals s2 ON s2.id = se2.signal_id
          WHERE se2.entity_id = se.entity_id
            AND se2.org_id    = p_org_id
            AND s2.scraped_at >= (now() - INTERVAL '7 days')
       ) >= 3;

    v_frequency := v_freq_ents::NUMERIC / v_total_ents::NUMERIC;
  END IF;

  -- --------------------------------------------------------------------
  -- reputation : moyenne des reputation_score des entités liées
  -- entities.metadata->>'reputation_score' est un float 0-1
  -- --------------------------------------------------------------------
  SELECT COALESCE(AVG((e.metadata->>'reputation_score')::NUMERIC), 0)
    INTO v_reputation
    FROM signal_entities se
    JOIN entities e ON e.id = se.entity_id
   WHERE se.signal_id = p_signal_id
     AND se.org_id    = p_org_id
     AND (e.metadata->>'reputation_score') IS NOT NULL;

  -- --------------------------------------------------------------------
  -- Formule composite (valeurs bornées à [0,1] par précaution)
  -- --------------------------------------------------------------------
  v_weight := LEAST(1.0,
    COALESCE(v_importance, 0) * 0.4
    + COALESCE(v_frequency,  0) * 0.2
    + COALESCE(v_utility,    0) * 0.3
    + COALESCE(v_reputation, 0) * 0.1
  );

  RETURN ROUND(v_weight, 4);
END;
$$;

COMMENT ON FUNCTION compute_signal_weight(UUID, UUID) IS
  'Calcule le poids composite d''un signal (0–1) : importance×0.4 + frequency×0.2 + utility×0.3 + reputation×0.1. '
  'importance = score/100 (dernier score LLM), utility = importance, '
  'frequency = ratio entités fréquentes (≥3 signaux/7j), reputation = avg reputation_score des entités.';

-- =============================================================================
-- 3. Trigger AFTER INSERT OR UPDATE ON scores → recalculer signals.weight
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_recompute_weight_on_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE signals
     SET weight = compute_signal_weight(NEW.signal_id, NEW.org_id)
   WHERE id     = NEW.signal_id
     AND org_id = NEW.org_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_recompute_weight_on_score() IS
  'Trigger function : recalcule signals.weight après chaque INSERT ou UPDATE sur scores.';

-- Idempotence : supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS trg_weight_on_score ON scores;

CREATE TRIGGER trg_weight_on_score
  AFTER INSERT OR UPDATE ON scores
  FOR EACH ROW
  EXECUTE FUNCTION trg_recompute_weight_on_score();

-- =============================================================================
-- 4. Trigger AFTER INSERT ON signal_entities → recalculer signals.weight
--    (une entité liée peut modifier frequency + reputation)
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_recompute_weight_on_entity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE signals
     SET weight = compute_signal_weight(NEW.signal_id, NEW.org_id)
   WHERE id     = NEW.signal_id
     AND org_id = NEW.org_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_recompute_weight_on_entity() IS
  'Trigger function : recalcule signals.weight après chaque INSERT sur signal_entities.';

-- Idempotence : supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS trg_weight_on_entity ON signal_entities;

CREATE TRIGGER trg_weight_on_entity
  AFTER INSERT ON signal_entities
  FOR EACH ROW
  EXECUTE FUNCTION trg_recompute_weight_on_entity();

-- (Bloc de test intégré S-10C.5 retiré le 2026-07-07 : une migration DDL ne doit pas muter les tables de prod — il insérait un signal sans external_id, cassant la rejouabilité du schéma. Correctif audit blindage. Le calcul compute_signal_weight reste couvert par la logique de la fonction elle-même.)

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
