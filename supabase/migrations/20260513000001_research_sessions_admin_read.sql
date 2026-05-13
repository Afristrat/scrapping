-- =============================================================================
-- Observabilité API Inbound (Bassira → Kairos research-from-seed)
--
-- 1) Ajoute la colonne `output_profile` sur research_sessions.
--    Introduite par les hotfixes K05+K06+K02 #4 (commit a7e8656, 13/05/2026)
--    côté edge fn signal-synthesizer mais jamais migrée. Valeurs possibles :
--    'light' (5 topics × 2 variants × brief 200-300) | 'full' (8 × 3 × 400)
--    NULL toléré pour les sessions antérieures à l'introduction de la
--    notion de profil.
--
-- 2) Ajoute une policy SELECT pour les super-admins Kairos (app_admins).
--    La migration initiale (20260512000001_research_sessions.sql) a activé
--    RLS sans aucune policy authenticated — seul le service_role pouvait
--    lire. La page d'observabilité /admin/api-inbound a besoin que les
--    app_admins voient les sessions depuis le frontend en JWT user.
-- =============================================================================
-- Depends on:
--   - 20260512000001_research_sessions.sql (table research_sessions + RLS)
--   - 20260502000009_admin_globals.sql      (function public.is_app_admin)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Colonne output_profile
-- ---------------------------------------------------------------------------

ALTER TABLE research_sessions
  ADD COLUMN IF NOT EXISTS output_profile TEXT;

COMMENT ON COLUMN research_sessions.output_profile IS
  'Profil de sortie demandé par le caller : ''light'' (5×2, brief 200-300) | ''full'' (8×3, brief 400). NULL pour les sessions pre-K02#4.';

-- Pas de CHECK constraint stricte : on tolère qu'un caller envoie une
-- valeur inconnue (le pipeline mappera vers light par défaut), pour ne
-- pas bloquer les sessions en INSERT côté edge fn.

-- ---------------------------------------------------------------------------
-- 2) Policy SELECT pour les super-admins Kairos
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "app_admin_select_research_sessions" ON research_sessions;

CREATE POLICY "app_admin_select_research_sessions"
  ON research_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

COMMENT ON POLICY "app_admin_select_research_sessions" ON research_sessions IS
  'Lecture seule pour les app_admins (page /admin/api-inbound). Les mutations restent strictement service_role (pipeline edge fn).';

-- ---------------------------------------------------------------------------
-- 3) Refresh PostgREST schema cache
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
