-- =============================================================================
-- HOTFIX 2026-05-02 — Fix infinite recursion sur RLS app_admins
-- =============================================================================
-- Bug : la policy "app_admins_select" (migration 20260502000009_admin_globals.sql)
-- fait un sous-select sur app_admins dans son USING. Récursion infinie identique
-- à celle qu'on a fixée sur organization_members.
--
--   USING (EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = auth.uid()));
--
-- Et la fonction helper public.is_app_admin() est SECURITY INVOKER, donc elle
-- subit aussi la policy → re-récursion.
--
-- Effets :
--   - SELECT * FROM app_admins → 500 PostgREST
--   - rpc('is_app_admin') → 500
--   - Toute policy ailleurs qui appelle is_app_admin() → 500
--
-- Fix :
--   1. Drop policy récursive
--   2. Recrée policy non-récursive : user voit sa propre row d'admin (s'il en a)
--   3. Bascule is_app_admin() en SECURITY DEFINER (bypass RLS proprement)
--   4. Ajoute RPC list_app_admins() SECURITY DEFINER pour le cockpit
-- =============================================================================

-- =============================================================================
-- 1. Drop policies récursives
-- =============================================================================

DROP POLICY IF EXISTS "app_admins_select" ON public.app_admins;
DROP POLICY IF EXISTS "app_admins_insert" ON public.app_admins;

-- =============================================================================
-- 2. Policy SELECT non-récursive : un user voit sa propre row d'admin
-- =============================================================================

CREATE POLICY "app_admins_self_select"
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 3. Policy INSERT non-récursive : seul un app_admin existant peut promouvoir
--    On utilise la fonction is_app_admin() qui sera maintenant SECURITY DEFINER
--    (donc pas de récursion).
-- =============================================================================

CREATE POLICY "app_admins_insert_by_admin"
  ON public.app_admins
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_admin());

-- =============================================================================
-- 4. Bascule is_app_admin() en SECURITY DEFINER pour bypass RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_app_admin() IS
  'Renvoie TRUE si l''utilisateur courant est app_admin. SECURITY DEFINER pour '
  'bypass la RLS de app_admins (sinon récursion infinie).';

GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- =============================================================================
-- 5. RPC list_app_admins() SECURITY DEFINER pour le cockpit /admin
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_app_admins()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  granted_at TIMESTAMPTZ,
  notes TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    a.user_id,
    u.email::TEXT,
    a.granted_at,
    a.notes
  FROM public.app_admins a
  JOIN auth.users u ON u.id = a.user_id
  WHERE public.is_app_admin()  -- gate : seuls les admins peuvent lister
  ORDER BY a.granted_at;
$$;

COMMENT ON FUNCTION public.list_app_admins() IS
  'Liste tous les app_admins. Bypass RLS via SECURITY DEFINER. '
  'Refuse silencieusement (0 rows) si le caller n''est pas lui-même admin.';

GRANT EXECUTE ON FUNCTION public.list_app_admins() TO authenticated;

-- =============================================================================
-- 6. Refresh PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
