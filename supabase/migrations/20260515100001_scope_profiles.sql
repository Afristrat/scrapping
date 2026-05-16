-- =============================================================================
-- F-Profile 2026-05-15 — Table scope_profiles
-- =============================================================================
-- Profils de coverage pré-curatés pour Bassira (et autres callers
-- research-from-seed). Permettent à un caller de référencer un set de
-- subreddits + X handles + ArXiv categories + RSS keywords spécialisés
-- (ex: 'morocco-tech', 'mena-business') sans avoir à les énumérer dans
-- chaque requête.
--
-- Lecture publique (is_public=TRUE) : la liste des profils standard est
-- exposée à tout authentifié pour qu'une UI puisse afficher un dropdown.
-- Lecture privée (is_public=FALSE) : restreinte au créateur ou à l'org.
-- Écriture : seul le créateur ou un admin de l'org.
-- =============================================================================

CREATE TABLE public.scope_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  x_handles TEXT[] NOT NULL DEFAULT '{}',
  reddit_subs TEXT[] NOT NULL DEFAULT '{}',
  arxiv_categories TEXT[] NOT NULL DEFAULT '{}',
  rss_keywords TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Cap defensif: éviter qu'un profil ne grossisse indéfiniment.
  CONSTRAINT scope_profiles_x_handles_cap CHECK (array_length(x_handles, 1) IS NULL OR array_length(x_handles, 1) <= 30),
  CONSTRAINT scope_profiles_reddit_subs_cap CHECK (array_length(reddit_subs, 1) IS NULL OR array_length(reddit_subs, 1) <= 30),
  CONSTRAINT scope_profiles_arxiv_categories_cap CHECK (array_length(arxiv_categories, 1) IS NULL OR array_length(arxiv_categories, 1) <= 15),
  CONSTRAINT scope_profiles_rss_keywords_cap CHECK (array_length(rss_keywords, 1) IS NULL OR array_length(rss_keywords, 1) <= 30),
  CONSTRAINT scope_profiles_name_format CHECK (name ~ '^[a-zA-Z0-9_-]+$' AND char_length(name) BETWEEN 1 AND 80)
);

CREATE INDEX scope_profiles_name_active_idx ON public.scope_profiles (name) WHERE active = TRUE;
CREATE INDEX scope_profiles_public_active_idx ON public.scope_profiles (is_public, active) WHERE is_public = TRUE AND active = TRUE;

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION public.scope_profiles_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_scope_profiles_updated_at
BEFORE UPDATE ON public.scope_profiles
FOR EACH ROW EXECUTE FUNCTION public.scope_profiles_updated_at();

-- RLS
ALTER TABLE public.scope_profiles ENABLE ROW LEVEL SECURITY;

-- Read : public profiles visibles par tout authentifié, privés par owner/org.
CREATE POLICY scope_profiles_read_public ON public.scope_profiles
  FOR SELECT TO authenticated
  USING (is_public = TRUE AND active = TRUE);

CREATE POLICY scope_profiles_read_owner ON public.scope_profiles
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Write : owner peut tout faire sur ses propres profils.
CREATE POLICY scope_profiles_write_owner ON public.scope_profiles
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- =============================================================================
-- Seed 2 profils publics (Maroc / MENA) pour démarrage Bassira
-- =============================================================================

INSERT INTO public.scope_profiles (name, description, reddit_subs, arxiv_categories, rss_keywords, is_public, active)
VALUES
  (
    'morocco-tech',
    'Tech / IA / startup Maroc — subreddits Africa-Tech + categories ArXiv IA + keywords FR/EN ciblés Maroc.',
    ARRAY['Morocco', 'AfricanTech', 'StartUps', 'africanbusiness', 'developpez', 'webdev'],
    ARRAY['cs.AI', 'cs.LG', 'cs.CY'],
    ARRAY[
      'Maroc IA', 'Morocco AI', 'Casablanca tech startup', 'Rabat artificial intelligence',
      'PME marocaine numerique', 'fintech Maroc', 'agritech Morocco', 'transformation digitale Maroc'
    ],
    TRUE, TRUE
  ),
  (
    'mena-business',
    'Business / fintech / IA Moyen-Orient et Afrique du Nord (MENA) — sources GCC + Maghreb.',
    ARRAY['middleeast', 'arabworld', 'AfricanTech', 'fintech', 'StartUps', 'venturecapital'],
    ARRAY['cs.AI', 'cs.LG', 'cs.CY', 'cs.CL'],
    ARRAY[
      'MENA fintech', 'GCC AI adoption', 'Maghreb business', 'Africa AI adoption',
      'Saudi AI', 'UAE artificial intelligence', 'Egypt fintech', 'Tunisia startup'
    ],
    TRUE, TRUE
  );

COMMENT ON TABLE public.scope_profiles IS 'F-Profile (US-K11) — Profils coverage pré-curatés pour research-from-seed. Lookup par nom OR uuid. Lecture publique pour is_public=TRUE.';
