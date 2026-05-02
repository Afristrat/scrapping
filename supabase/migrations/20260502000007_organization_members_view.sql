-- =============================================================================
-- Wave 6 — Sub-wave 6.3 — S6-TeamPage
-- Vue exposée pour permettre au frontend d'afficher l'email des membres d'une
-- organisation sans donner accès direct à `auth.users`. Les RLS policies de
-- la table sous-jacente `organization_members` continuent de s'appliquer (la
-- vue est créée avec `security_invoker=on` sur Postgres 15+ ; côté Supabase,
-- une vue dans le schéma public est interrogée avec les droits du caller via
-- les policies de la table source).
--
-- Sécurité :
--  - SELECT only, aucune mutation possible (vue = lecture seule)
--  - GRANT SELECT TO authenticated (les anon ne peuvent rien lire)
--  - LEFT JOIN sur auth.users pour ne pas casser si un user a été supprimé
--    (le row reste visible avec email NULL)
-- =============================================================================
-- Depends on: 20260502000001_orgs.sql (organization_members), auth.users
-- =============================================================================

CREATE OR REPLACE VIEW public.organization_members_view
WITH (security_invoker = on) AS
SELECT
  om.org_id,
  om.user_id,
  om.role,
  om.joined_at,
  u.email
FROM public.organization_members om
LEFT JOIN auth.users u ON u.id = om.user_id;

COMMENT ON VIEW public.organization_members_view IS
  'Wave 6 — vue read-only pour /settings/team : expose l email auth.users en restant gated par les RLS de organization_members.';

REVOKE ALL ON public.organization_members_view FROM PUBLIC;
GRANT SELECT ON public.organization_members_view TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
