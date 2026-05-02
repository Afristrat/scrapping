-- =============================================================================
-- Wave 6 — Sub-wave 6.4 — Stories S6-TenantIsolated + S6-AdminCockpit
--
-- Création d'un système de super-admins Kairos (au-dessus du multi-tenant org).
-- Permet aux opérateurs de la plateforme (équipe Kairos) d'accéder au cockpit
-- /admin sans avoir besoin d'être membres des organisations clientes.
--
-- Différence clé avec organization_members :
--   - organization_members.role : rôle DANS une org cliente (owner/admin/...)
--   - app_admins                : super-admin de l'application Kairos elle-même
--
-- Sécurité : RLS active, seuls les app_admins peuvent voir / modifier la table.
-- Le 1er admin doit être inséré manuellement (bootstrap) via service_role.
-- =============================================================================
-- Depends on: 20260502000001_orgs.sql (organizations), auth.users
-- =============================================================================

-- =============================================================================
-- TABLE : app_admins
-- =============================================================================

CREATE TABLE app_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes      TEXT
);

COMMENT ON TABLE app_admins IS
  'Super-admins de l''application Kairos (cockpit /admin). Au-dessus du multi-tenant org.';
COMMENT ON COLUMN app_admins.granted_by IS
  'Auteur de la promotion. NULL pour le 1er admin (bootstrap manuel via service_role).';
COMMENT ON COLUMN app_admins.notes IS
  'Note libre — typiquement le rôle métier (« Founder », « CSM », « Support tier 2 »).';

-- =============================================================================
-- RLS : ENABLE
-- =============================================================================

ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES — app_admins
--
-- SELECT : seuls les app_admins peuvent voir la liste des autres app_admins.
-- INSERT : seul un app_admin existant peut promouvoir un nouvel admin.
-- UPDATE / DELETE : aucune policy authenticated → mutations via service_role
--                   uniquement (révocation = procédure exceptionnelle).
-- =============================================================================

CREATE POLICY "app_admins_select" ON app_admins FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = auth.uid())
  );

CREATE POLICY "app_admins_insert" ON app_admins FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = auth.uid())
  );

-- =============================================================================
-- HELPER FUNCTION : public.is_app_admin()
--
-- Renvoie TRUE si l'utilisateur courant est app_admin. Utilisée :
--   1. Côté frontend via supabase.rpc('is_app_admin')
--   2. Côté edge functions pour gater l'accès au cockpit (admin-metrics)
--
-- SECURITY INVOKER : la fonction respecte les RLS de l'appelant. Comme la
-- policy SELECT n'autorise que les app_admins à voir la table, un non-admin
-- recevra simplement FALSE (la sous-requête EXISTS sera filtrée par RLS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_admins WHERE user_id = auth.uid()
  )
$$;

COMMENT ON FUNCTION public.is_app_admin() IS
  'Renvoie TRUE si l''utilisateur courant est app_admin (super-admin Kairos).';

GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- =============================================================================
-- BOOTSTRAP DU 1er ADMIN
--
-- À exécuter manuellement post-migration via le SQL editor Supabase
-- (en service_role, qui bypasse RLS) :
--
--   INSERT INTO app_admins (user_id, notes)
--   VALUES ('<uuid_du_user>', 'Founder');
--
-- Récupération de l'uuid :
--   SELECT id, email FROM auth.users WHERE email = 'medamine.mansouriidrissi@gmail.com';
-- =============================================================================

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
