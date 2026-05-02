-- digests : briefs 80/20 générés à partir des signaux scorés.
-- Consultable par l'utilisateur (historique + replay).
-- Depends on: 20260430000001_init.sql (auth.users), 20260430000002_rls.sql (RLS pattern).

CREATE TABLE digests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  language     TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en', 'es')),
  signal_count INTEGER NOT NULL DEFAULT 0,
  min_score    INTEGER NOT NULL DEFAULT 0,
  window_hours INTEGER NOT NULL DEFAULT 24,
  content      TEXT NOT NULL,
  model_used   TEXT,
  cost         DOUBLE PRECISION DEFAULT 0
);

ALTER TABLE digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_digests_select" ON digests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "own_digests_insert" ON digests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_digests_delete" ON digests FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_digests_user_at ON digests(user_id, generated_at DESC);

COMMENT ON TABLE digests IS 'Briefs 80/20 générés via edge function digest. Markdown stocké en clair.';
COMMENT ON COLUMN digests.window_hours IS 'Fenêtre temporelle (en heures) sur laquelle les signaux ont été agrégés.';
COMMENT ON COLUMN digests.min_score IS 'Seuil minimum de score utilisé pour la sélection des signaux.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
