-- =============================================================================
-- HOTFIX 2026-05-02 — Fix infinite recursion sur RLS organization_members
-- =============================================================================
-- Bug : la policy "orgm_select" (migration 20260502000001_orgs.sql) faisait
-- un sous-select sur organization_members dans son USING, ce qui déclenche
-- la récursion :
--   SELECT * FROM organization_members  → policy orgm_select
--   → SELECT org_id FROM organization_members WHERE user_id = auth.uid()
--   → re-déclenche orgm_select → ∞
--
-- PostgreSQL retourne :
--   42P17 — infinite recursion detected in policy for relation "organization_members"
--
-- Effet collatéral : TOUTES les autres policies (signals, scores, user_api_keys,
-- topics, digests, etc.) qui font le sous-select :
--     org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
-- déclenchent orgm_select → 500 sur la totalité de l'API REST authentifiée.
--
-- Fix :
--   1. Drop la policy récursive
--   2. Recrée une policy non-récursive :
--      - L'user voit ses propres rows de membership (user_id = auth.uid())
--      - Pour voir les AUTRES membres de la même org (TeamPage Wave 6.3),
--        on expose une SECURITY DEFINER function qui bypass RLS.
-- =============================================================================

-- =============================================================================
-- 1. Drop la policy fautive
-- =============================================================================

DROP POLICY IF EXISTS "orgm_select" ON public.organization_members;

-- =============================================================================
-- 2. Policy non-récursive : un user voit ses propres rows de membership
-- =============================================================================

CREATE POLICY "orgm_self_select"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 3. SECURITY DEFINER function pour la TeamPage : retourne tous les membres
-- d'une org dont l'utilisateur courant fait partie. Bypasse RLS proprement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_org_members(p_org_id UUID)
RETURNS TABLE (
  org_id UUID,
  user_id UUID,
  role public.org_role,
  joined_at TIMESTAMPTZ,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    om.org_id,
    om.user_id,
    om.role,
    om.joined_at,
    u.email::TEXT
  FROM public.organization_members om
  JOIN auth.users u ON u.id = om.user_id
  WHERE om.org_id = p_org_id
    AND EXISTS (
      SELECT 1 FROM public.organization_members me
      WHERE me.org_id = p_org_id AND me.user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.list_org_members(UUID) IS
  'Liste les membres d''une org. Bypass RLS via SECURITY DEFINER. '
  'Vérifie au préalable que le caller est lui-même membre de l''org demandée.';

GRANT EXECUTE ON FUNCTION public.list_org_members(UUID) TO authenticated;

-- =============================================================================
-- 4. Refresh PostgREST schema cache (pour que la RPC soit immédiatement appelable)
-- =============================================================================

NOTIFY pgrst, 'reload schema';
