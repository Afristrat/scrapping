-- Péage argent unique (ADR 0010) — llm_costs.task : ENUM llm_task → TEXT.
--
-- Cause racine P1-010 (« coûts non écrits ») : l'enum llm_task ne connaît que
-- (scraping, scoring, monitoring) alors que les fonctions écrivaient des labels
-- libres ('digest', 'enrich:topic', 'admin_prompt:<kind>', 'suggest:personas',
-- 'quality-auditor') → violation d'enum silencieuse sur chaque insert →
-- llm_costs vide (0 ligne vérifiée live sur db.saqr.ma le 2026-07-07).
--
-- Le péage unique dans dispatch-llm écrit désormais des labels hiérarchiques
-- libres : TEXT + CHECK de longueur, et l'enum est purgé (aucun autre usage :
-- seule costs_by_day le référençait, recréée ci-dessous).

-- 1. costs_by_day référence llm_task dans son type de retour → drop avant l'ALTER.
DROP FUNCTION IF EXISTS public.costs_by_day(INT);

-- 2. Colonne task en TEXT (l'index expression idx_llm_costs_user_task_day est
--    rebâti automatiquement par l'ALTER).
ALTER TABLE public.llm_costs
  ALTER COLUMN task TYPE TEXT USING task::text;

ALTER TABLE public.llm_costs
  ADD CONSTRAINT llm_costs_task_len CHECK (char_length(task) BETWEEN 1 AND 64);

-- 3. Purge de l'enum (plus aucune dépendance).
DROP TYPE IF EXISTS public.llm_task;

-- 4. Recréation de costs_by_day avec task TEXT (même corps, + search_path épinglé).
CREATE OR REPLACE FUNCTION public.costs_by_day(days INT DEFAULT 7)
RETURNS TABLE(day DATE, task TEXT, total_cost NUMERIC)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    date_trunc('day', ts)::date AS day,
    task,
    SUM(cost) AS total_cost
  FROM public.llm_costs
  WHERE user_id = auth.uid()
    AND ts >= now() - (days || ' days')::interval
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.costs_by_day IS
  'Aggregate LLM costs by day/task for the calling user.';

COMMENT ON COLUMN public.llm_costs.task IS
  'Label libre hiérarchique (scoring, digest, enrich:topic, admin_prompt:<kind>, …) — écrit uniquement par dispatch-llm (péage unique, ADR 0010).';
