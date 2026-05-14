-- =============================================================================
-- Observabilité API Inbound — fix jointure public_api_keys
--
-- La migration 20260513000001 a ouvert SELECT sur research_sessions pour les
-- app_admins, mais la page /admin/api-inbound joint aussi public_api_keys
-- pour afficher le préfixe et le nom de la clé caller. Or public_api_keys
-- était strictement service_role only — donc la jointure retournait null
-- côté frontend en JWT user (colonne "Clé" toujours vide).
--
-- Ajoute la même policy SELECT app_admin. Mutations restent service_role.
-- =============================================================================
-- Depends on:
--   - 20260508000002_public_api_keys.sql      (table public_api_keys + RLS)
--   - 20260502000009_admin_globals.sql        (function public.is_app_admin)
-- =============================================================================

DROP POLICY IF EXISTS "app_admin_select_public_api_keys" ON public_api_keys;

CREATE POLICY "app_admin_select_public_api_keys"
  ON public_api_keys
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

COMMENT ON POLICY "app_admin_select_public_api_keys" ON public_api_keys IS
  'Lecture seule pour les app_admins (jointure depuis /admin/api-inbound). Les mutations restent strictement service_role (rotation/admin Kairos).';

NOTIFY pgrst, 'reload schema';
