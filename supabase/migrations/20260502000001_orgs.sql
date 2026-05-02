-- =============================================================================
-- Wave 6 — Sub-wave 6.1 — Story 1 (S6-Schema)
-- Création des tables de multi-tenant : organizations, organization_members,
-- subscriptions, subscription_seats, invitations, usage_records.
-- + ENUMs (org_segment, org_plan, billing_mode, org_role, subscription_status)
-- + Indexes pour les RLS subqueries
-- + Policies RLS owner/admin/member
-- + Trigger updated_at (réutilise public.touch_updated_at de la migration init)
-- =============================================================================
-- Depends on: 20260430000001_init.sql (touch_updated_at), auth.users
-- =============================================================================

-- =============================================================================
-- ENUMs
-- =============================================================================

CREATE TYPE org_segment AS ENUM ('vc_pe', 'legal', 'newsletter', 'brand', 'cto_sme', 'solo');
CREATE TYPE org_plan AS ENUM ('solo', 'pro', 'enterprise');
CREATE TYPE billing_mode AS ENUM ('maison', 'byok');
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'incomplete');

-- =============================================================================
-- organizations : tenant principal
-- =============================================================================

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  segment       org_segment NOT NULL DEFAULT 'solo',
  billing_email TEXT,
  plan          org_plan NOT NULL DEFAULT 'solo',
  billing_mode  billing_mode NOT NULL DEFAULT 'maison',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE organizations IS 'Tenant principal multi-utilisateur. Chaque user appartient à au moins une org.';
COMMENT ON COLUMN organizations.slug IS 'Identifiant URL-safe unique. Backfill = local-part de l email primaire.';

-- =============================================================================
-- organization_members : appartenance + rôle
-- =============================================================================

CREATE TABLE organization_members (
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      org_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

COMMENT ON TABLE organization_members IS 'Membership user→org avec rôle. Rôle owner ne peut être supprimé que par autre owner.';

-- =============================================================================
-- subscriptions : 1 abonnement Stripe par organization
-- =============================================================================

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id     TEXT,
  plan                   org_plan NOT NULL,
  billing_mode           billing_mode NOT NULL,
  seats                  INTEGER NOT NULL DEFAULT 1 CHECK (seats > 0),
  status                 subscription_status NOT NULL DEFAULT 'trialing',
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  trial_ends_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS 'Synchronisé via webhook Stripe (customer.subscription.{created,updated,deleted}).';

-- =============================================================================
-- subscription_seats : assignation d un user à un seat d un subscription
-- =============================================================================

CREATE TABLE subscription_seats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, user_id)
);

COMMENT ON TABLE subscription_seats IS 'Tracking seat-by-seat pour SKUs facturés per-seat (cto, brand, legal, vc).';

-- =============================================================================
-- invitations : lien d invitation par email + token
-- =============================================================================

CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        org_role NOT NULL DEFAULT 'member',
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invitations IS 'Invitations par email avec token signé. expires_at par défaut +7j (côté edge fn).';

-- =============================================================================
-- usage_records : compteur d usage par période pour Stripe metered billing
-- =============================================================================

CREATE TABLE usage_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  apify_cost_eur      NUMERIC(10, 4) NOT NULL DEFAULT 0,
  llm_cost_eur        NUMERIC(10, 4) NOT NULL DEFAULT 0,
  signals_count       INTEGER NOT NULL DEFAULT 0,
  reported_to_stripe  BOOLEAN NOT NULL DEFAULT false,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_start, period_end)
);

COMMENT ON TABLE usage_records IS 'Aggregat usage par org pour metered billing. Reporté vers Stripe via edge fn record-usage.';

-- =============================================================================
-- Indexes (importants pour les RLS subqueries fréquentes)
-- =============================================================================

CREATE INDEX idx_organization_members_user ON organization_members(user_id);
CREATE INDEX idx_organization_members_org  ON organization_members(org_id);
CREATE INDEX idx_subscriptions_org         ON subscriptions(org_id);
CREATE INDEX idx_invitations_email         ON invitations(email);
CREATE INDEX idx_invitations_token         ON invitations(token);
CREATE INDEX idx_usage_records_org_period  ON usage_records(org_id, period_start);

-- =============================================================================
-- RLS : ENABLE
-- =============================================================================

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_seats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records        ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES — organizations
-- Lecture par les membres ; update/delete par owner/admin (delete owner only) ;
-- insert ouvert (création via trigger create_default_org_for_user OU edge fn
-- create-checkout-session ; côté client la création se fait toujours en
-- service_role, donc on garde un WITH CHECK (true) pour ne pas bloquer mais
-- l accès anon-only est toujours interdit puisque RLS authentifié required).
-- =============================================================================

CREATE POLICY "org_select" ON organizations FOR SELECT TO authenticated
  USING (
    id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_update" ON organizations FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_insert" ON organizations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "org_delete" ON organizations FOR DELETE TO authenticated
  USING (
    id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- =============================================================================
-- POLICIES — organization_members
-- Visibles par les membres de la même org ; insert/delete owner/admin only.
-- =============================================================================

CREATE POLICY "orgm_select" ON organization_members FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "orgm_insert" ON organization_members FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "orgm_update" ON organization_members FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "orgm_delete" ON organization_members FOR DELETE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- =============================================================================
-- POLICIES — subscriptions
-- Lisible par tous les membres ; modif via service_role (Stripe webhook) only.
-- =============================================================================

CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- Aucune policy INSERT/UPDATE/DELETE pour authenticated : seul service_role
-- (Stripe webhook + scripts admin) peut écrire. RLS bloque tout le reste.

-- =============================================================================
-- POLICIES — subscription_seats
-- Visible par membres de l org du subscription parent.
-- =============================================================================

CREATE POLICY "seats_select" ON subscription_seats FOR SELECT TO authenticated
  USING (
    subscription_id IN (
      SELECT s.id FROM subscriptions s
      WHERE s.org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    )
  );

-- Insert/delete via edge fn (service_role) : owner/admin assigne un user.

-- =============================================================================
-- POLICIES — invitations
-- Visibles + insert + update par owner/admin de l org.
-- (L acceptance se fait via edge fn accept-invitation en service_role.)
-- =============================================================================

CREATE POLICY "inv_select" ON invitations FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "inv_insert" ON invitations FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "inv_update" ON invitations FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "inv_delete" ON invitations FOR DELETE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- POLICIES — usage_records
-- Lisible par tous les membres ; écriture via edge fn record-usage (service_role).
-- =============================================================================

CREATE POLICY "usage_select" ON usage_records FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================================================
-- TRIGGERS — updated_at via public.touch_updated_at (de 20260430000001_init.sql)
-- =============================================================================

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
