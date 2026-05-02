-- =============================================================================
-- Wave 6 — Sub-wave 6.1 — Story 2 (S6-OrgIdColumn)
-- Ajout colonne org_id (nullable initialement) sur toutes les tables tenant.
-- La contrainte NOT NULL sera posée après backfill (migration 4).
-- =============================================================================
-- Depends on: 20260502000001_orgs.sql (table organizations)
-- =============================================================================
--
-- Tables visées (15) — toutes celles qui ont user_id et RLS scoped user :
--   signals, scores, logs, llm_costs, settings, user_api_keys, scoring_rubrics,
--   digests, topics, topic_runs, topic_signals, pending_minio_writes,
--   admin_prompts, admin_prompt_runs, provider_models
--
-- Note : llm_providers est exclu (lookup public, pas de user_id).
-- =============================================================================

ALTER TABLE signals              ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE scores               ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE logs                 ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE llm_costs            ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE settings             ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE user_api_keys        ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE scoring_rubrics      ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE digests              ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE topics               ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE topic_runs           ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE topic_signals        ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE pending_minio_writes ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE admin_prompts        ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE admin_prompt_runs    ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE provider_models      ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- =============================================================================
-- Indexes pour les RLS subqueries (org_id IN (SELECT ... FROM organization_members))
-- =============================================================================

CREATE INDEX idx_signals_org              ON signals(org_id);
CREATE INDEX idx_scores_org               ON scores(org_id);
CREATE INDEX idx_logs_org                 ON logs(org_id);
CREATE INDEX idx_llm_costs_org            ON llm_costs(org_id);
CREATE INDEX idx_settings_org             ON settings(org_id);
CREATE INDEX idx_user_api_keys_org        ON user_api_keys(org_id);
CREATE INDEX idx_scoring_rubrics_org      ON scoring_rubrics(org_id);
CREATE INDEX idx_digests_org              ON digests(org_id);
CREATE INDEX idx_topics_org               ON topics(org_id);
CREATE INDEX idx_topic_runs_org           ON topic_runs(org_id);
CREATE INDEX idx_topic_signals_org        ON topic_signals(org_id);
CREATE INDEX idx_pending_minio_writes_org ON pending_minio_writes(org_id);
CREATE INDEX idx_admin_prompts_org        ON admin_prompts(org_id);
CREATE INDEX idx_admin_prompt_runs_org    ON admin_prompt_runs(org_id);
CREATE INDEX idx_provider_models_org      ON provider_models(org_id);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
