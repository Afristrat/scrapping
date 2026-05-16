-- =============================================================================
-- US-K11/K12 — topics_of_interest + topics_archive (Watchlist persistante)
-- =============================================================================
-- Pivot Bassira : le pipeline research-from-seed devient une base de connaissance
-- vivante au lieu d'un one-shot. L'utilisateur définit 1-15 sujets de veille
-- (topics_of_interest), chacun avec 1-5 seeds. Un cron horaire (watchlist-tick)
-- collecte automatiquement les nouveaux signaux/topics et persiste dans
-- topics_archive avec un TTL 30 jours.
--
-- Avant tout poll-live de Bassira, le client appelle topics-search :
--   - Compute embedding du seed user
--   - SELECT topics_of_interest avec cosine similarity > seuil
--   - Si match + fraîcheur OK → retourne directement topics_archive (1s)
--   - Sinon → propose collecte manuelle / création nouveau sujet
--
-- Embedding : Qwen3-Embedding-8B (256 dims via Matryoshka, multilingue FR/AR/EN)
-- avec fallback OpenAI text-embedding-3-small (256 dims).
-- =============================================================================

-- ─── Extension pgvector ─────────────────────────────────────────────────────
-- Whitelisted par Supabase. Idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Trigger helper updated_at (générique, partagé) ─────────────────────────
-- On crée une fonction utility si pas déjà présente. SECURITY INVOKER (défaut).
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Table topics_of_interest
-- =============================================================================

CREATE TABLE public.topics_of_interest (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identité métier
  name                 TEXT NOT NULL,
  -- 1-5 seeds qui définissent le sujet ; chacune contraintes Kairos (50-3000 chars)
  seeds                TEXT[] NOT NULL,

  -- Embedding moyen des seeds. 1024 dims via Matryoshka representation
  -- learning de Qwen3-Embedding-8B (native 4096, downscale au choix).
  -- 1024 = sweet spot qualité multilingue FR/AR/EN sans bloater HNSW.
  -- Indépendant des 256 dims de cluster-signals (autre usage, autre index).
  -- Calculé côté edge fn au create/update. NULL pendant la 1ʳᵉ collecte si
  -- l'embedding échoue (fallback : matching impossible mais collecte se fait).
  seeds_embedding      vector(1024),
  embedding_model      TEXT,  -- 'qwen3-embedding-8b' | 'text-embedding-3-small' | …

  lang                 TEXT NOT NULL CHECK (lang IN ('fr', 'en', 'ar')),
  sector_hint          TEXT,
  scope_profile        TEXT,
  hints_override       JSONB,  -- {x_handles?:[], reddit_subs?:[], arxiv_categories?:[], rss_keywords?:[]}

  -- Fréquence de collecte
  collect_cron         TEXT NOT NULL DEFAULT 'weekly'
    CHECK (collect_cron IN ('daily', 'weekly', 'monthly', 'paused')),

  -- Status courant — driver du worker watchlist-tick
  status               TEXT NOT NULL DEFAULT 'collecting'
    CHECK (status IN ('collecting', 'ready', 'error', 'paused')),

  -- Dates clés
  last_collected_at    TIMESTAMPTZ,
  next_collect_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error           JSONB,  -- {message, when, seed_idx, stage} si dernier collect a foiré

  -- Compteurs cumulés (mis à jour par watchlist-tick)
  signals_count        INTEGER NOT NULL DEFAULT 0,
  topics_count         INTEGER NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contraintes métier
  CONSTRAINT toi_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT toi_seeds_count CHECK (array_length(seeds, 1) BETWEEN 1 AND 5),
  -- On valide chaque seed via une fonction (PG ne supporte pas le check inline sur unnest).
  -- Pour rester simple, on valide en application via validateRequestBody côté edge fn.
  CONSTRAINT toi_sector_hint_length CHECK (sector_hint IS NULL OR char_length(sector_hint) <= 200),
  CONSTRAINT toi_scope_profile_format CHECK (
    scope_profile IS NULL OR scope_profile ~ '^[a-zA-Z0-9_-]{1,80}$'
  ),
  CONSTRAINT toi_signals_count_pos CHECK (signals_count >= 0),
  CONSTRAINT toi_topics_count_pos CHECK (topics_count >= 0)
);

-- Indexes
-- HNSW pour le matching sémantique seed → seeds_embedding. Cosine distance.
CREATE INDEX topics_of_interest_seeds_embedding_idx
  ON public.topics_of_interest
  USING hnsw (seeds_embedding vector_cosine_ops);

-- Owner lookup (frontend list)
CREATE INDEX topics_of_interest_owner_status_idx
  ON public.topics_of_interest (owner_user_id, status);

-- Cron worker pickup : on cherche les sujets dont la prochaine collecte est due.
CREATE INDEX topics_of_interest_next_collect_idx
  ON public.topics_of_interest (next_collect_at)
  WHERE status = 'collecting';

-- updated_at auto
CREATE TRIGGER trg_topics_of_interest_updated_at
BEFORE UPDATE ON public.topics_of_interest
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- RLS
ALTER TABLE public.topics_of_interest ENABLE ROW LEVEL SECURITY;

-- Owner peut lire ses sujets
CREATE POLICY toi_own_select ON public.topics_of_interest
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

-- Owner peut tout faire sur ses sujets (INSERT/UPDATE/DELETE)
CREATE POLICY toi_own_modify ON public.topics_of_interest
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Service_role bypass RLS automatiquement (utilisé par watchlist-tick + endpoints
-- avec proxy_user_id de Bassira).

-- =============================================================================
-- Table topics_archive
-- =============================================================================

CREATE TABLE public.topics_archive (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_of_interest_id     UUID NOT NULL REFERENCES public.topics_of_interest(id) ON DELETE CASCADE,

  -- Une collecte (watchlist-tick run) génère N topics, on les groupe par collect_run_id.
  -- Permet de filtrer "topics issus de la dernière collecte" facilement.
  collect_run_id           UUID NOT NULL,

  -- Champs hérités de signal-synthesizer (output Kairos)
  topic_label              TEXT NOT NULL,
  topic_summary            TEXT,
  topic_type               TEXT CHECK (topic_type IN ('regular', 'devil_advocate', 'emerging')),
  dominant_angle           TEXT,
  brief_variants           JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_signals              JSONB NOT NULL DEFAULT '[]'::jsonb,
  provenance               JSONB,
  cultural_warnings        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Embedding du topic pour dédup futur + recherche sémantique inter-topics.
  topic_embedding          vector(1024),
  embedding_model          TEXT,

  -- Provenance Kairos
  source_seed              TEXT NOT NULL,        -- quelle seed parmi seeds[] a généré ce topic
  source_seed_index        INTEGER,              -- 0-4, position dans seeds[]
  source_session_id        UUID,                 -- research_sessions.id originelle (TTL 24h DB)

  -- Audit Kairos
  audit_verdict            TEXT,                 -- pass | warn | fail | deepen | NULL si fallback
  quality_warning          TEXT,                 -- synthesizer_unavailable | … | NULL

  collected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TTL 30j par défaut. Au-delà, considéré périmé pour topics-search.
  expires_at               TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  CONSTRAINT ta_topic_label_length CHECK (char_length(topic_label) BETWEEN 1 AND 500)
);

-- Indexes
-- 1. Lookup par sujet + récence (page /topics/<id>)
CREATE INDEX topics_archive_toi_recent_idx
  ON public.topics_archive (topic_of_interest_id, collected_at DESC);

-- 2. Search rapide : que les non-expirés (90% des reads)
CREATE INDEX topics_archive_toi_active_idx
  ON public.topics_archive (topic_of_interest_id, collected_at DESC);

-- 3. Embedding cosine pour topics-search cross-sujet (V2)
CREATE INDEX topics_archive_embedding_idx
  ON public.topics_archive
  USING hnsw (topic_embedding vector_cosine_ops);

-- 4. Purge worker : delete WHERE expires_at < NOW()
CREATE INDEX topics_archive_expires_at_idx
  ON public.topics_archive (expires_at);

-- 5. collect_run filter (debug + diff entre collectes)
CREATE INDEX topics_archive_collect_run_idx
  ON public.topics_archive (collect_run_id);

-- RLS
ALTER TABLE public.topics_archive ENABLE ROW LEVEL SECURITY;

-- Owner read via JOIN sur topics_of_interest.
-- Pas d'INSERT/UPDATE/DELETE direct : seul le worker en service_role écrit.
CREATE POLICY ta_owner_select ON public.topics_archive
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.topics_of_interest toi
      WHERE toi.id = topics_archive.topic_of_interest_id
        AND toi.owner_user_id = auth.uid()
    )
  );

-- =============================================================================
-- Table topic_collect_runs : audit trail des collectes lancées par watchlist-tick
-- =============================================================================
-- Une collecte = 1 seed du sujet → research-from-seed → topics ingested in archive.
-- watchlist-tick a 2 phases qui consultent cette table :
--   * Phase START : SELECT topics_of_interest WHERE next_collect_at <= NOW
--     AND pas de run actif → lance research-from-seed, INSERT run avec status='running'
--   * Phase FINALIZE : SELECT runs WHERE status='running' AND started_at < NOW - 2min
--     → check research_sessions(session_id), si completed → ingest topics_archive +
--     UPDATE run status='completed' + UPDATE toi compteurs + next_collect_at
-- =============================================================================

CREATE TABLE public.topic_collect_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_of_interest_id     UUID NOT NULL REFERENCES public.topics_of_interest(id) ON DELETE CASCADE,
  session_id               UUID NOT NULL,                 -- research_sessions.id
  seed                     TEXT NOT NULL,
  seed_idx                 INTEGER NOT NULL,              -- 0-4, position dans seeds[]
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at              TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'timeout', 'abandoned')),
  topics_ingested          INTEGER NOT NULL DEFAULT 0,
  cost_usd                 NUMERIC(10,6) NOT NULL DEFAULT 0,
  error                    JSONB,
  trigger                  TEXT NOT NULL DEFAULT 'cron'
    CHECK (trigger IN ('cron', 'create', 'patch', 'manual'))
);

CREATE INDEX topic_collect_runs_toi_recent_idx
  ON public.topic_collect_runs (topic_of_interest_id, started_at DESC);

-- Worker pickup phase 2 (FINALIZE) : trouver les runs encore en cours après 2min.
CREATE INDEX topic_collect_runs_running_idx
  ON public.topic_collect_runs (started_at)
  WHERE status = 'running';

-- RLS — lecture owner via JOIN, write service_role only.
ALTER TABLE public.topic_collect_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tcr_owner_select ON public.topic_collect_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.topics_of_interest toi
      WHERE toi.id = topic_collect_runs.topic_of_interest_id
        AND toi.owner_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.topic_collect_runs IS
  'Audit trail des collectes watchlist-tick. Une row par appel research-from-seed. Status running → completed/failed. Permet diagnostiquer pourquoi un sujet n''a pas collecté ce mois-ci.';

-- =============================================================================
-- Cron watchlist-tick : toutes les heures
-- =============================================================================
-- Pré-requis : pg_cron + pg_net actives (déjà installées).
-- WATCHLIST_CRON_SECRET doit être configuré côté Supabase secrets pour authentifier
-- l'appel HTTP cron → watchlist-tick (sinon n'importe qui pourrait trigger).

-- Note : `app.settings.watchlist_cron_secret` doit être set au niveau base via
--    ALTER DATABASE postgres SET app.settings.watchlist_cron_secret = '<secret>';
-- (les Supabase function secrets `WATCHLIST_CRON_SECRET` sont lus côté edge fn ;
-- on duplique côté DB pour que le cron job puisse passer le header.)

SELECT cron.schedule(
  'watchlist_tick_hourly',
  '0 * * * *',  -- pile à chaque heure
  $$
  SELECT net.http_post(
    url := 'https://crplceoptyeslqyfcqvj.supabase.co/functions/v1/watchlist-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.watchlist_cron_secret', true)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- =============================================================================
-- RPC : topics-search matching sémantique
-- =============================================================================
-- Pour `topics-search` endpoint. Reçoit l'embedding du seed user + owner_uid
-- + threshold, retourne les topics_of_interest dont seeds_embedding matche au-dessus
-- du threshold (similarity = 1 - cosine_distance).
--
-- SECURITY DEFINER : exécution sous le user owner du schema, bypass RLS.
-- Filtre owner_uid en paramètre obligatoire — pas d'escalade de privilège.

CREATE OR REPLACE FUNCTION public.topics_of_interest_match(
  query_embedding vector(1024),
  owner_uid UUID,
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  seeds TEXT[],
  lang TEXT,
  sector_hint TEXT,
  scope_profile TEXT,
  status TEXT,
  similarity FLOAT,
  last_collected_at TIMESTAMPTZ,
  topics_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.name, t.seeds, t.lang, t.sector_hint, t.scope_profile, t.status,
    1 - (t.seeds_embedding <=> query_embedding) AS similarity,
    t.last_collected_at, t.topics_count
  FROM public.topics_of_interest t
  WHERE t.owner_user_id = owner_uid
    AND t.seeds_embedding IS NOT NULL
    AND (1 - (t.seeds_embedding <=> query_embedding)) >= match_threshold
  ORDER BY t.seeds_embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.topics_of_interest_match IS
  'US-K11 — Match sémantique cosine d''un embedding contre les seeds_embedding des sujets de veille de l''owner. Returns max match_count rows above threshold.';

-- =============================================================================
-- Purge des topics expirés — cron quotidien 4 h UTC (post-cleanup logs)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_expired_topics_archive()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.topics_archive WHERE expires_at < NOW() - INTERVAL '7 days';
  -- ↑ marge 7j pour permettre debug forensique avant suppression réelle.
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Pré-requis : pg_cron déjà actif (20260430000003).
SELECT cron.schedule(
  'purge_topics_archive_daily',
  '0 4 * * *',  -- tous les jours 4 h UTC
  $$SELECT public.purge_expired_topics_archive();$$
);

-- =============================================================================
-- COMMENTS pour exploration future + générateurs de doc auto
-- =============================================================================

COMMENT ON TABLE public.topics_of_interest IS
  'US-K11 — Sujets de veille permanents par utilisateur. Le worker watchlist-tick collecte automatiquement les nouveaux topics selon collect_cron et persiste dans topics_archive. Lookup sémantique via seeds_embedding (vector 256d, cosine).';

COMMENT ON TABLE public.topics_archive IS
  'US-K12 — Topics archivés produits par les collectes Kairos pour les topics_of_interest. TTL 30 jours par défaut, purge 7 jours après expiration via cron. topics-search retourne uniquement les non-expirés.';

COMMENT ON COLUMN public.topics_of_interest.seeds_embedding IS
  '1024-dim Matryoshka downscale de Qwen3-Embedding-8B native 4096-dim. Modèle tracé dans embedding_model. Provider via DashScope BYOK (default), fallback OpenAI text-embedding-3-small (qui ne peut PAS produire 1024d → 768d max + zero-pad). Si fallback obligatoire en V1, NoEmbeddingProviderError et la 1ʳᵉ collecte fail explicitement.';

COMMENT ON COLUMN public.topics_archive.collect_run_id IS
  'Groupe les topics issus de la même exécution watchlist-tick. Permet diff temporel entre collectes (drift, nouveaux topics, topics disparus).';
