-- =============================================================================
-- Wave 8.B — Story S8B-AppSettings
-- Table `app_settings` : configuration globale de l'application gérée par les
-- super-admins Kairos (`is_app_admin()`). Pas de scoping org / user — ces
-- valeurs sont communes à toute la plateforme (domaine de contact public,
-- nom de marque par défaut, etc.).
--
-- Lecture publique (anon + authenticated) : ces paramètres servent à
-- construire les pages publiques (landing, pricing, footer, etc.) avant
-- toute authentification.
--
-- Écriture : strictement réservée aux app_admins.
-- =============================================================================
-- Depends on:
--   20260502000009_admin_globals.sql  (app_admins + public.is_app_admin())
--   init migration : public.touch_updated_at() trigger function
-- =============================================================================

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE app_settings IS
  'Paramètres globaux de l''application Kairos. Lecture publique, écriture app_admins uniquement.';
COMMENT ON COLUMN app_settings.key IS
  'Clé unique du paramètre (ex : app_domain, app_brand_name).';
COMMENT ON COLUMN app_settings.value IS
  'Valeur textuelle du paramètre. Sérialiser en JSON si type complexe.';
COMMENT ON COLUMN app_settings.updated_by IS
  'Dernier app_admin ayant modifié la valeur (audit trail léger).';

-- =============================================================================
-- TRIGGER updated_at
-- =============================================================================

CREATE TRIGGER app_settings_touch_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- RLS : ENABLE
-- =============================================================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES — app_settings
--
-- SELECT : public (anon + authenticated). Les valeurs servent à rendre les
--   pages publiques (footer, mailto:, brand name, etc.) avant toute auth.
-- INSERT / UPDATE / DELETE : app_admins uniquement.
-- =============================================================================

CREATE POLICY "app_settings_select" ON app_settings
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "app_settings_insert_admin" ON app_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

CREATE POLICY "app_settings_update_admin" ON app_settings
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY "app_settings_delete_admin" ON app_settings
  FOR DELETE TO authenticated
  USING (public.is_app_admin());

-- =============================================================================
-- SEED initial — domaine + nom de marque par défaut.
-- ON CONFLICT DO NOTHING pour idempotence (la migration peut être rejouée
-- sans écraser une valeur déjà personnalisée par un app_admin).
-- =============================================================================

INSERT INTO app_settings (key, value, description) VALUES
  (
    'app_domain',
    'kairos.ai-mpower.com',
    'Nom de domaine principal de l''application. Utilisé pour générer l''email de contact public (labs@<app_domain>).'
  ),
  (
    'app_brand_name',
    'Kairos',
    'Nom de la marque affiché par défaut sur les pages publiques.'
  )
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Refresh PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
