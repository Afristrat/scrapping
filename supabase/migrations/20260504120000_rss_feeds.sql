-- =============================================================================
-- Wave 11 — RSS Feeds
-- Création de la table rss_feeds pour les flux RSS/Atom et Google Alerts.
-- =============================================================================

CREATE TABLE rss_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  active          BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  last_error      TEXT,
  error_count     INT DEFAULT 0,
  signal_count    INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, url)
);

ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_rss_feeds ON rss_feeds FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE INDEX idx_rss_feeds_org ON rss_feeds(org_id);

NOTIFY pgrst, 'reload schema';
