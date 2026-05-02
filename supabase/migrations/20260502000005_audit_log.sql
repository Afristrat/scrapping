-- =============================================================================
-- Wave 6 — Sub-wave 6.4 — Story S6-AuditLog
-- Journal d'audit append-only au niveau organization. Trace toutes les actions
-- sensibles (settings, rubrics, admin prompts, API keys, members, billing,
-- exports, etc.) avec contexte (acteur, IP, user-agent, diff before/after).
--
-- Append-only by design : aucune policy UPDATE / DELETE n'est définie pour les
-- rôles `authenticated` — seul `service_role` (côté edge fns avec privilèges
-- élevés) pourrait y toucher si nécessaire. Conformité RGPD : preuve
-- d'intégrité d'audit pour le segment Avocats (add-on `prod_addon_audit_log`).
--
-- Cible commerciale : add-on Avocats (399-699 €/seat) — pré-requis pour les
-- dossiers clients et les réclamations RGPD article 30 (registre des
-- traitements).
-- =============================================================================
-- Depends on:
--   20260502000001_orgs.sql           (organizations + organization_members)
--   20260502000004_rls_org_rewrite.sql (pattern RLS via organization_members)
-- =============================================================================

-- =============================================================================
-- ENUMs : audit_action + audit_severity
-- =============================================================================

CREATE TYPE audit_action AS ENUM (
  -- Settings & configuration
  'settings.update',
  -- Rubriques de scoring
  'rubric.create',
  'rubric.update',
  'rubric.delete',
  -- Admin prompts (cascade IA)
  'admin_prompt.create',
  'admin_prompt.update',
  'admin_prompt.delete',
  'admin_prompt.run',
  -- Clés API (BYOK)
  'api_key.create',
  'api_key.update',
  'api_key.delete',
  -- Gestion des membres
  'member.invite',
  'member.accept',
  'member.remove',
  'member.role_change',
  -- Organization & billing
  'org.update',
  'org.billing_change',
  -- Données / signaux
  'signal.delete',
  'signal.bulk_delete',
  -- Exports
  'digest.export',
  'audit.export',
  -- Pipeline
  'pipeline.run',
  'pipeline.purge'
);

CREATE TYPE audit_severity AS ENUM ('info', 'warning', 'critical');

-- =============================================================================
-- TABLE : audit_log
-- =============================================================================

CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- nullable car certaines actions système n'ont pas d'acteur user (cron, webhook)
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       audit_action NOT NULL,
  severity     audit_severity NOT NULL DEFAULT 'info',
  -- Contexte de l'action
  entity_type  TEXT,           -- 'rubric', 'admin_prompt', 'signal', 'organization', etc.
  entity_id    TEXT,           -- uuid ou identifiant lisible (texte libre)
  description  TEXT,           -- résumé human-readable « Suppression de la rubrique XYZ »
  diff         JSONB,          -- { before, after } pour les updates
  metadata     JSONB,          -- request-id, headers spécifiques, contexte additionnel
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_log IS
  'Append-only audit log par organization. Aucune policy UPDATE/DELETE — RGPD compliant. Add-on payant Avocats.';
COMMENT ON COLUMN audit_log.user_id IS
  'Acteur de l action (nullable si déclenché par système : cron, webhook Stripe, etc.).';
COMMENT ON COLUMN audit_log.diff IS
  'Format conventionnel : { "before": {...}, "after": {...} }. Pour create : before=null. Pour delete : after=null.';
COMMENT ON COLUMN audit_log.metadata IS
  'Champ libre pour contexte additionnel (request-id, version client, feature flags).';

-- =============================================================================
-- INDEXES
-- Optimisés pour les patterns de query du frontend :
--   1. Liste paginée par org triée DESC sur created_at (filtre principal)
--   2. Filter by action (badge / select UI)
--   3. Filter by severity (alertes critical)
--   4. Filter by user (audit d'un acteur spécifique)
-- =============================================================================

CREATE INDEX idx_audit_log_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_action      ON audit_log(action);
CREATE INDEX idx_audit_log_severity    ON audit_log(severity);
CREATE INDEX idx_audit_log_user        ON audit_log(user_id);

-- =============================================================================
-- RLS : ENABLE
-- =============================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES — audit_log
--
-- SELECT : owner / admin de l'org uniquement (lecture sensible).
-- INSERT : tout member de l'org peut écrire (pour les actions frontend type
--          export CSV qui se loggent elles-mêmes).
-- UPDATE / DELETE : aucune — append-only by design.
-- =============================================================================

CREATE POLICY "audit_log_select" ON audit_log FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- Pas de policy UPDATE/DELETE → append-only. Toute tentative est bloquée
-- même par les owners. Seul service_role bypasse RLS pour reconciliation
-- exceptionnelle.

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
