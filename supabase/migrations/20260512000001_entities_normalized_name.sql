-- =============================================================================
-- Migration : entities.normalized_name — canonicalisation + fusion des doublons
-- (L99 axe déterminisme, A#3)
--
-- Problème : UNIQUE (org_id, kind, canonical_name) est un exact-match →
-- « OpenAI » / « Open AI » / « openai » créent 3 entités distinctes et
-- polluent compute-reputation, top_entities et signal_count.
--
-- Fix :
--   1. Colonne normalized_name (minuscules, sans accents, [a-z0-9] uniquement)
--   2. Fusion des doublons existants (on garde la plus ancienne, on absorbe
--      les autres formes en aliases, on repointe signal_entities)
--   3. Trigger BEFORE INSERT/UPDATE = SEULE autorité de normalisation
--      (le miroir TS canonicalizeEntityName — enrich-entities/ner.ts — ne sert
--      qu'aux lookups et DOIT rester aligné sur cette expression)
--   4. Index UNIQUE (org_id, kind, normalized_name) ; l'ancienne contrainte
--      exact-match, strictement plus faible, est supprimée
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Colonne + backfill
ALTER TABLE entities ADD COLUMN IF NOT EXISTS normalized_name TEXT;

UPDATE entities
SET normalized_name = regexp_replace(lower(unaccent(canonical_name)), '[^a-z0-9]', '', 'g');

-- 2. Fusion des doublons : la plus ancienne entité de chaque groupe survit
DO $mig$
DECLARE
  grp RECORD;
BEGIN
  FOR grp IN
    SELECT org_id, kind, normalized_name,
           (array_agg(id ORDER BY first_seen_at ASC, id ASC))[1] AS keep_id,
           array_agg(id ORDER BY first_seen_at ASC, id ASC)      AS all_ids,
           array_agg(DISTINCT canonical_name)                    AS names
    FROM entities
    GROUP BY org_id, kind, normalized_name
    HAVING count(*) > 1
  LOOP
    -- Repointer les liaisons ; PK (signal_id, entity_id) → ignorer les collisions
    UPDATE signal_entities se
    SET entity_id = grp.keep_id
    WHERE se.entity_id = ANY (grp.all_ids)
      AND se.entity_id <> grp.keep_id
      AND NOT EXISTS (
        SELECT 1 FROM signal_entities se2
        WHERE se2.signal_id = se.signal_id AND se2.entity_id = grp.keep_id
      );
    DELETE FROM signal_entities
    WHERE entity_id = ANY (grp.all_ids) AND entity_id <> grp.keep_id;

    -- Absorber les formes des doublons dans les alias du survivant
    UPDATE entities
    SET aliases = (
      SELECT array_agg(DISTINCT a)
      FROM unnest(coalesce(aliases, '{}') || grp.names) AS a
      WHERE a <> canonical_name
    )
    WHERE id = grp.keep_id;

    DELETE FROM entities WHERE id = ANY (grp.all_ids) AND id <> grp.keep_id;

    -- Recaler le compteur du survivant (le trigger n'incrémente qu'à l'INSERT)
    UPDATE entities e
    SET signal_count = (SELECT count(*) FROM signal_entities se WHERE se.entity_id = e.id)
    WHERE e.id = grp.keep_id;
  END LOOP;
END;
$mig$;

-- 3. Trigger d'autorité : normalized_name calculé côté DB, aucune divergence possible
CREATE OR REPLACE FUNCTION entities_set_normalized_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.normalized_name := regexp_replace(lower(unaccent(NEW.canonical_name)), '[^a-z0-9]', '', 'g');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION entities_set_normalized_name() IS
  'Autorité unique de normalisation des noms d''entités. Miroir TS : canonicalizeEntityName (enrich-entities/ner.ts).';

DROP TRIGGER IF EXISTS trg_entities_normalized_name ON entities;
CREATE TRIGGER trg_entities_normalized_name
  BEFORE INSERT OR UPDATE OF canonical_name ON entities
  FOR EACH ROW EXECUTE FUNCTION entities_set_normalized_name();

-- DEFAULT '' : jamais persisté (le trigger BEFORE écrase toujours), mais
-- permet aux inserts d'omettre la colonne (et à gen types de la marquer optionnelle)
ALTER TABLE entities ALTER COLUMN normalized_name SET DEFAULT '';
ALTER TABLE entities ALTER COLUMN normalized_name SET NOT NULL;

-- 4. Unicité sur la forme normalisée ; l'exact-match historique devient redondant
CREATE UNIQUE INDEX IF NOT EXISTS uq_entities_org_kind_normalized
  ON entities(org_id, kind, normalized_name);

ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_org_id_kind_canonical_name_key;

COMMENT ON COLUMN entities.normalized_name IS
  'Clé de déduplication : lower + unaccent + [a-z0-9] seul. Calculée par trigger — ne jamais écrire directement.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
