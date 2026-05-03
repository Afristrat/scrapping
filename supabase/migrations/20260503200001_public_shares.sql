-- =============================================================================
-- Wave 11 — Lien public partageable pour briefs digest (sans authentification)
-- =============================================================================
-- Permet à un user authentifié de générer un slug court (8 chars) qui pointe
-- vers son digest. La route publique `/share/:slug` est accessible sans login,
-- pour partage facile sur réseaux sociaux et médias.
--
-- Sécurité :
--   - RLS sur public_shares : user voit ses propres shares + insert
--   - La fonction SECURITY DEFINER `read_public_digest(slug)` bypass RLS pour
--     permettre la lecture publique sans auth
--   - Expiration auto via expires_at, refusé après cette date
--   - View count pour analytics basique
--
-- Anti-abuse : un user ne peut créer plus de N shares actifs (à enforcer côté
-- edge fn `create-public-share`, pas DB).
-- =============================================================================

CREATE TABLE public.public_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  digest_id       UUID NOT NULL REFERENCES public.digests(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  view_count      INT NOT NULL DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_shares_slug ON public.public_shares(slug);
CREATE INDEX idx_public_shares_digest_id ON public.public_shares(digest_id);
CREATE INDEX idx_public_shares_org_id ON public.public_shares(org_id);

-- =============================================================================
-- RLS — user ne voit que les shares qu il a créés (mais TOUS les membres org
-- peuvent en créer pour les digests org-shared)
-- =============================================================================

ALTER TABLE public.public_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_shares_select_own ON public.public_shares
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY public_shares_insert_own ON public.public_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY public_shares_delete_own ON public.public_shares
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- Function SECURITY DEFINER pour la lecture publique sans auth
--
-- Retourne le digest content + minimal meta si le slug existe et n est pas
-- expiré. Bypass RLS via SECURITY DEFINER. Increment view_count atomiquement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.read_public_digest(p_slug TEXT)
RETURNS TABLE (
  digest_id UUID,
  content TEXT,
  language TEXT,
  signal_count INT,
  window_hours INT,
  min_score INT,
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  org_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share record;
BEGIN
  SELECT ps.*, d.content, d.language, d.signal_count, d.window_hours, d.min_score,
         d.generated_at, o.name AS org_name
    INTO v_share
  FROM public.public_shares ps
  JOIN public.digests d ON d.id = ps.digest_id
  JOIN public.organizations o ON o.id = ps.org_id
  WHERE ps.slug = p_slug
    AND ps.expires_at > now();

  IF v_share IS NULL THEN
    RAISE EXCEPTION 'share_not_found_or_expired' USING ERRCODE = 'P0002';
  END IF;

  -- Increment view count + last_viewed_at (best-effort, ne casse pas la lecture
  -- en cas d echec)
  BEGIN
    UPDATE public.public_shares
    SET view_count = view_count + 1, last_viewed_at = now()
    WHERE id = v_share.id;
  EXCEPTION WHEN OTHERS THEN
    -- noop : on tolere un increment manque
    NULL;
  END;

  RETURN QUERY SELECT
    v_share.digest_id,
    v_share.content::TEXT,
    v_share.language::TEXT,
    v_share.signal_count,
    v_share.window_hours,
    v_share.min_score,
    v_share.generated_at,
    v_share.expires_at,
    v_share.org_name::TEXT;
END;
$$;

COMMENT ON FUNCTION public.read_public_digest(TEXT) IS
  'Wave 11 — lecture publique d un digest via slug. SECURITY DEFINER bypass RLS. '
  'Refuse si expiré. Increment view_count.';

GRANT EXECUTE ON FUNCTION public.read_public_digest(TEXT) TO anon, authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
