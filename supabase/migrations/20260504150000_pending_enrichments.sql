-- Table queue résiliente pour les 4 passes async d'enrichissement
CREATE TABLE pending_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pass_kind TEXT NOT NULL CHECK (pass_kind IN ('entities', 'reputation', 'clustering', 'neo4j_push')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index partiel sur les jobs à traiter
CREATE INDEX idx_pending_enrichments_pending
  ON pending_enrichments (scheduled_at ASC)
  WHERE status IN ('pending', 'failed');

-- Index pour lookup par signal
CREATE INDEX idx_pending_enrichments_signal ON pending_enrichments (signal_id);

-- RLS org-scoped
ALTER TABLE pending_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_pending_enrichments ON pending_enrichments
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Trigger : à chaque nouveau signal → créer les 4 jobs d'enrichissement automatiquement
CREATE OR REPLACE FUNCTION enqueue_signal_enrichments()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pending_enrichments (signal_id, org_id, pass_kind)
  VALUES
    (NEW.id, NEW.org_id, 'entities'),
    (NEW.id, NEW.org_id, 'reputation'),
    (NEW.id, NEW.org_id, 'clustering'),
    (NEW.id, NEW.org_id, 'neo4j_push')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enqueue_signal_enrichments
  AFTER INSERT ON signals
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_signal_enrichments();
