-- =============================================================================
-- Wave 10.C — Story S-10C.4 — signal_clusters + signal_cluster_members
-- Table pour le clustering cross-source de signaux via embeddings.
-- =============================================================================
-- Depends on :
--   * 20260504150000_pending_enrichments.sql  (pending_enrichments, signals)
--   * 20260502000001_orgs.sql                 (organizations)
-- =============================================================================

-- Table des clusters de signaux
CREATE TABLE signal_clusters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  centroid_title  TEXT,
  signal_count    INT DEFAULT 1,
  sources         TEXT[],
  first_seen_at   TIMESTAMPTZ DEFAULT now(),
  last_seen_at    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index pour lookup rapide par org + fenêtre temporelle (filtre 48h)
CREATE INDEX idx_signal_clusters_org_last_seen
  ON signal_clusters (org_id, last_seen_at DESC);

-- Table des membres d'un cluster (N:M signal ↔ cluster)
CREATE TABLE signal_cluster_members (
  cluster_id  UUID NOT NULL REFERENCES signal_clusters(id) ON DELETE CASCADE,
  signal_id   UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL,
  similarity  NUMERIC(4,3),
  PRIMARY KEY (cluster_id, signal_id)
);

-- Index pour lookup inverse (signal → ses clusters)
CREATE INDEX idx_signal_cluster_members_signal ON signal_cluster_members (signal_id);

-- RLS
ALTER TABLE signal_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_signal_clusters ON signal_clusters
  FOR ALL
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

ALTER TABLE signal_cluster_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_cluster_members ON signal_cluster_members
  FOR ALL
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
