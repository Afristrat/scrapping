-- Topic tracking schema
-- Depends on: 20260430000001_init.sql, 20260430000002_rls.sql

CREATE TABLE topics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL,
  is_seed            BOOLEAN NOT NULL DEFAULT false,
  is_emerging        BOOLEAN NOT NULL DEFAULT false,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_signal_count INTEGER NOT NULL DEFAULT 0,
  -- Welford online algorithm state (sum-of-squared-deviations form):
  -- baseline_mean = running mean (μ)
  -- baseline_m2   = Σ(xᵢ − μ)²  ── NOT the std dev. Computed std at read time:
  --                                std = sqrt(baseline_m2 / (baseline_n - 1))
  -- baseline_n    = number of observations
  baseline_mean      DOUBLE PRECISION NOT NULL DEFAULT 0,
  baseline_m2        DOUBLE PRECISION NOT NULL DEFAULT 0,
  baseline_n         INTEGER NOT NULL DEFAULT 0,
  trend              TEXT NOT NULL DEFAULT 'warming_up'
                       CHECK (trend IN ('warming_up','emerging','stable','declining')),
  UNIQUE (user_id, slug)
);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_topics_select" ON topics FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_topics_insert" ON topics FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topics_update" ON topics FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topics_delete" ON topics FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_topics_user ON topics(user_id);
CREATE INDEX idx_topics_user_trend ON topics(user_id, trend);

CREATE TABLE topic_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id         UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  signal_count     INTEGER NOT NULL DEFAULT 0,
  sources          JSONB NOT NULL DEFAULT '{}',
  top_signal_title TEXT,
  top_signal_score DOUBLE PRECISION,
  minio_appended   BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE topic_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_topic_runs_select" ON topic_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_topic_runs_insert" ON topic_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topic_runs_update" ON topic_runs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topic_runs_delete" ON topic_runs FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_topic_runs_topic_at ON topic_runs(topic_id, run_at DESC);
CREATE INDEX idx_topic_runs_user_at ON topic_runs(user_id, run_at DESC);

CREATE TABLE topic_signals (
  topic_id  UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, signal_id)
);

ALTER TABLE topic_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_topic_signals_select" ON topic_signals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_topic_signals_insert" ON topic_signals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topic_signals_delete" ON topic_signals FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_topic_signals_signal ON topic_signals(signal_id);

CREATE TABLE pending_minio_writes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at      TIMESTAMPTZ NOT NULL,
  content     TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_minio_writes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_pending_select" ON pending_minio_writes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_pending_insert" ON pending_minio_writes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_pending_update" ON pending_minio_writes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_pending_delete" ON pending_minio_writes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_pending_active ON pending_minio_writes(user_id, created_at) WHERE attempts < 5;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS topic_seeds TEXT[] NOT NULL DEFAULT '{}';
