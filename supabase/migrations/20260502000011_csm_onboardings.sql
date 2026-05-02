-- =============================================================================
-- Wave 6 — Sub-wave 6.5 — Story S6-CSMOnboarding
-- Persistance de la checklist d'onboarding CSM (Customer Success Manager)
-- pour les contrats Enterprise (add-on `prod_addon_csm_onboarding` +999 €/an).
--
-- Source de vérité : docs/enterprise/csm-playbook.md
-- =============================================================================
-- Depends on:
--   20260502000001_orgs.sql           (organizations + organization_members)
--   20260502000009_admin_globals.sql  (app_admins + is_app_admin())
-- =============================================================================

-- =============================================================================
-- TABLE : csm_onboardings
--
-- Une ligne par organization en cours d'onboarding Enterprise. La PK est
-- `org_id` (1-1 avec organization), permettant un upsert idempotent par le
-- CSM via la page /admin/csm.
--
-- Tous les timestamps d'étapes sont nullable : `NULL` = étape pas encore
-- franchie. Le CSM les met à jour via toggle UI au fur et à mesure du
-- playbook (kickoff, training, check-in M1, QBR M3).
--
-- `nps_score` : entier signé [-100, +100], saisi au check-in M1.
-- `notes` : texte libre, pain points / observations / opportunités upsell.
-- =============================================================================

CREATE TABLE csm_onboardings (
  org_id              UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  csm_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  kickoff_done_at     TIMESTAMPTZ,
  training_done_at    TIMESTAMPTZ,
  month_1_check_at    TIMESTAMPTZ,
  qbr_done_at         TIMESTAMPTZ,
  nps_score           INTEGER CHECK (nps_score BETWEEN -100 AND 100),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE csm_onboardings IS
  'Suivi d''onboarding CSM par organization Enterprise. Géré uniquement par les app_admins (super-admins Kairos).';
COMMENT ON COLUMN csm_onboardings.csm_user_id IS
  'Super-admin Kairos assigné comme CSM principal de ce tenant. Nullable si non encore assigné.';
COMMENT ON COLUMN csm_onboardings.nps_score IS
  'NPS interne capturé au check-in M1 (J+30). Plage [-100, +100].';
COMMENT ON COLUMN csm_onboardings.notes IS
  'Notes CSM libres (pain points, opportunités d''upsell, blockers).';

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_csm_onboardings_csm_user ON csm_onboardings(csm_user_id);
CREATE INDEX idx_csm_onboardings_started  ON csm_onboardings(started_at DESC);

-- =============================================================================
-- TRIGGER updated_at (réutilise public.touch_updated_at de la migration init)
-- =============================================================================

CREATE TRIGGER csm_onboardings_touch_updated_at
  BEFORE UPDATE ON csm_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- RLS : ENABLE
-- =============================================================================

ALTER TABLE csm_onboardings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES — csm_onboardings
--
-- SELECT / INSERT / UPDATE / DELETE : app_admins UNIQUEMENT.
-- Les owners / admins de l'organization concernée n'y ont PAS accès — c'est
-- une vue interne CSM, pas une donnée client.
-- =============================================================================

CREATE POLICY "csm_onboardings_select_admin" ON csm_onboardings
  FOR SELECT TO authenticated
  USING (public.is_app_admin());

CREATE POLICY "csm_onboardings_insert_admin" ON csm_onboardings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

CREATE POLICY "csm_onboardings_update_admin" ON csm_onboardings
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY "csm_onboardings_delete_admin" ON csm_onboardings
  FOR DELETE TO authenticated
  USING (public.is_app_admin());

-- =============================================================================
-- Refresh PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
