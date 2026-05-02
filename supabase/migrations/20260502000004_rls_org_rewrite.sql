-- =============================================================================
-- Wave 6 — Sub-wave 6.1 — Story 4 (S6-RLSRewrite)
-- Réécriture des policies RLS pour scope org_id (au lieu de user_id direct).
-- Drop des policies "own_*" + create des policies "org_*" + SET NOT NULL.
-- =============================================================================
-- Depends on:
--   20260502000001_orgs.sql           (organization_members table)
--   20260502000002_org_id_columns.sql (colonne org_id partout)
--   20260502000003_backfill_orgs.sql  (rows backfillées avec org_id)
-- =============================================================================
--
-- IMPORTANT — Backward compatibility :
-- Comme chaque user existant a 1 org et 1 seul, la policy
--    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
-- retourne le même set de rows que l ancienne
--    user_id = auth.uid()
-- Le frontend peut continuer à filtrer par user_id sans casse côté tests.
--
-- Les hooks frontend qui consommeront org_id seront ajoutés dans la sous-vague 6.3.
-- =============================================================================

-- =============================================================================
-- HELPER : user_default_org_id()
-- Retourne la première org du user authentifié. Utilisé comme DEFAULT côté
-- colonnes org_id pour permettre aux inserts existants (frontend non encore
-- refactoré) de continuer à fonctionner sans casser le NOT NULL.
-- En sous-vague 6.3, le frontend passera org_id explicitement et ce default
-- restera comme filet de sécurité.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_default_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT org_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.user_default_org_id IS
  'Wave 6 : retourne l org primaire du user courant. Utilisé comme DEFAULT sur les colonnes org_id pour rétro-compat des inserts existants.';

-- =============================================================================
-- TABLE : signals
-- =============================================================================

DROP POLICY IF EXISTS "own_signals" ON signals;

ALTER TABLE signals ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE signals ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_signals_select" ON signals FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_signals_insert" ON signals FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_signals_update" ON signals FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_signals_delete" ON signals FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : scores
-- =============================================================================

DROP POLICY IF EXISTS "own_scores" ON scores;

ALTER TABLE scores ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE scores ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_scores_select" ON scores FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_scores_insert" ON scores FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_scores_update" ON scores FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_scores_delete" ON scores FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : logs
-- (Original schema permet user_id NULL. On garde org_id NOT NULL — on tolère
-- pas de log "orphelin" en multi-tenant. Si besoin de logs system futurs,
-- créer une org "system" dédiée et y rattacher les rows.)
-- =============================================================================

DROP POLICY IF EXISTS "own_logs" ON logs;

ALTER TABLE logs ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE logs ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_logs_select" ON logs FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_logs_insert" ON logs FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_logs_update" ON logs FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_logs_delete" ON logs FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : llm_costs
-- =============================================================================

DROP POLICY IF EXISTS "own_llm_costs" ON llm_costs;

ALTER TABLE llm_costs ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE llm_costs ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_llm_costs_select" ON llm_costs FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_llm_costs_insert" ON llm_costs FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_llm_costs_update" ON llm_costs FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_llm_costs_delete" ON llm_costs FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : settings
-- =============================================================================

DROP POLICY IF EXISTS "own_settings" ON settings;

ALTER TABLE settings ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE settings ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_settings_select" ON settings FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_settings_insert" ON settings FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_settings_update" ON settings FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_settings_delete" ON settings FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : user_api_keys
-- =============================================================================

DROP POLICY IF EXISTS "own_api_keys_read_masked" ON user_api_keys;
DROP POLICY IF EXISTS "own_api_keys_modify" ON user_api_keys;
DROP POLICY IF EXISTS "own_api_keys_update" ON user_api_keys;
DROP POLICY IF EXISTS "own_api_keys_delete" ON user_api_keys;

ALTER TABLE user_api_keys ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE user_api_keys ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_user_api_keys_select" ON user_api_keys FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_user_api_keys_insert" ON user_api_keys FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_user_api_keys_update" ON user_api_keys FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_user_api_keys_delete" ON user_api_keys FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : scoring_rubrics
-- =============================================================================

DROP POLICY IF EXISTS "own_rubrics" ON scoring_rubrics;

ALTER TABLE scoring_rubrics ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE scoring_rubrics ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_scoring_rubrics_select" ON scoring_rubrics FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_scoring_rubrics_insert" ON scoring_rubrics FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_scoring_rubrics_update" ON scoring_rubrics FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_scoring_rubrics_delete" ON scoring_rubrics FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : digests
-- (Original schema : pas de policy UPDATE — on conserve.)
-- =============================================================================

DROP POLICY IF EXISTS "own_digests_select" ON digests;
DROP POLICY IF EXISTS "own_digests_insert" ON digests;
DROP POLICY IF EXISTS "own_digests_delete" ON digests;

ALTER TABLE digests ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE digests ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_digests_select" ON digests FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_digests_insert" ON digests FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_digests_delete" ON digests FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : topics
-- =============================================================================

DROP POLICY IF EXISTS "own_topics_select" ON topics;
DROP POLICY IF EXISTS "own_topics_insert" ON topics;
DROP POLICY IF EXISTS "own_topics_update" ON topics;
DROP POLICY IF EXISTS "own_topics_delete" ON topics;

ALTER TABLE topics ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE topics ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_topics_select" ON topics FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topics_insert" ON topics FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topics_update" ON topics FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topics_delete" ON topics FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : topic_runs
-- =============================================================================

DROP POLICY IF EXISTS "own_topic_runs_select" ON topic_runs;
DROP POLICY IF EXISTS "own_topic_runs_insert" ON topic_runs;
DROP POLICY IF EXISTS "own_topic_runs_update" ON topic_runs;
DROP POLICY IF EXISTS "own_topic_runs_delete" ON topic_runs;

ALTER TABLE topic_runs ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE topic_runs ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_topic_runs_select" ON topic_runs FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topic_runs_insert" ON topic_runs FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topic_runs_update" ON topic_runs FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topic_runs_delete" ON topic_runs FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : topic_signals
-- (Original schema : pas de policy UPDATE — on conserve.)
-- =============================================================================

DROP POLICY IF EXISTS "own_topic_signals_select" ON topic_signals;
DROP POLICY IF EXISTS "own_topic_signals_insert" ON topic_signals;
DROP POLICY IF EXISTS "own_topic_signals_delete" ON topic_signals;

ALTER TABLE topic_signals ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE topic_signals ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_topic_signals_select" ON topic_signals FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topic_signals_insert" ON topic_signals FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_topic_signals_delete" ON topic_signals FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : pending_minio_writes
-- =============================================================================

DROP POLICY IF EXISTS "own_pending_select" ON pending_minio_writes;
DROP POLICY IF EXISTS "own_pending_insert" ON pending_minio_writes;
DROP POLICY IF EXISTS "own_pending_update" ON pending_minio_writes;
DROP POLICY IF EXISTS "own_pending_delete" ON pending_minio_writes;

ALTER TABLE pending_minio_writes ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE pending_minio_writes ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_pending_minio_writes_select" ON pending_minio_writes FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_pending_minio_writes_insert" ON pending_minio_writes FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_pending_minio_writes_update" ON pending_minio_writes FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_pending_minio_writes_delete" ON pending_minio_writes FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : provider_models
-- =============================================================================

DROP POLICY IF EXISTS "own_provider_models_select" ON provider_models;
DROP POLICY IF EXISTS "own_provider_models_insert" ON provider_models;
DROP POLICY IF EXISTS "own_provider_models_update" ON provider_models;
DROP POLICY IF EXISTS "own_provider_models_delete" ON provider_models;

ALTER TABLE provider_models ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE provider_models ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_provider_models_select" ON provider_models FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_provider_models_insert" ON provider_models FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_provider_models_update" ON provider_models FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_provider_models_delete" ON provider_models FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TABLE : admin_prompts
-- (Original delete policy ajoutait `is_seed = false` → conservé.)
-- =============================================================================

DROP POLICY IF EXISTS "own_admin_prompts_select" ON admin_prompts;
DROP POLICY IF EXISTS "own_admin_prompts_insert" ON admin_prompts;
DROP POLICY IF EXISTS "own_admin_prompts_update" ON admin_prompts;
DROP POLICY IF EXISTS "own_admin_prompts_delete" ON admin_prompts;

ALTER TABLE admin_prompts ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE admin_prompts ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_admin_prompts_select" ON admin_prompts FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_admin_prompts_insert" ON admin_prompts FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_admin_prompts_update" ON admin_prompts FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_admin_prompts_delete" ON admin_prompts FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    AND is_seed = false
  );

-- =============================================================================
-- TABLE : admin_prompt_runs
-- (Original schema : pas de policy UPDATE — on conserve.)
-- =============================================================================

DROP POLICY IF EXISTS "own_admin_prompt_runs_select" ON admin_prompt_runs;
DROP POLICY IF EXISTS "own_admin_prompt_runs_insert" ON admin_prompt_runs;
DROP POLICY IF EXISTS "own_admin_prompt_runs_delete" ON admin_prompt_runs;

ALTER TABLE admin_prompt_runs ALTER COLUMN org_id SET DEFAULT public.user_default_org_id();
ALTER TABLE admin_prompt_runs ALTER COLUMN org_id SET NOT NULL;

CREATE POLICY "org_admin_prompt_runs_select" ON admin_prompt_runs FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_admin_prompt_runs_insert" ON admin_prompt_runs FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_admin_prompt_runs_delete" ON admin_prompt_runs FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- llm_providers : table de lookup publique non-tenant — aucune modification.
-- =============================================================================

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
