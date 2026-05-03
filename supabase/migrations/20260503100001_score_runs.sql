CREATE TABLE score_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL,
  provider text NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  reasoning text,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  cost numeric(10,6) DEFAULT 0,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_score_runs_signal_org ON score_runs(signal_id, org_id);
ALTER TABLE score_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_score_runs_select ON score_runs FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY org_score_runs_insert ON score_runs FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS score_consensus numeric(5,2),
  ADD COLUMN IF NOT EXISTS score_variance numeric(8,4),
  ADD COLUMN IF NOT EXISTS models_used text[];

-- Backfill : 1 row score_runs par scores existant
INSERT INTO score_runs (signal_id, org_id, user_id, model, provider, score, reasoning, cost, ts)
SELECT s.signal_id, s.org_id, s.user_id, COALESCE(s.model_used, 'unknown'), 'unknown', s.score, s.reasoning, COALESCE(s.cost, 0), s.scored_at
FROM scores s
WHERE s.org_id IS NOT NULL;
