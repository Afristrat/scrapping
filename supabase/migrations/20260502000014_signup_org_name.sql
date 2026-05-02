-- =============================================================================
-- 20260502000014_signup_org_name.sql
--
-- Fix : permettre à l'utilisateur de choisir le nom de son organisation
-- au signup via raw_user_meta_data.organization_name. Le trigger
-- create_default_org_for_user lit cette valeur en priorité, fallback sur
-- l'email-based actuel.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_default_org_for_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  new_org_id UUID;
  email_local TEXT;
  custom_name TEXT;
  resolved_name TEXT;
  slug_base TEXT;
  slug_attempt TEXT;
  counter INTEGER;
BEGIN
  -- 1. Lire le nom custom depuis user_metadata (saisi au signup)
  custom_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'organization_name', '')), '');

  -- 2. Fallback : email-based si aucun nom fourni
  email_local := split_part(coalesce(NEW.email, 'user'), '@', 1);
  resolved_name := coalesce(custom_name, email_local, 'My Organization');

  -- 3. Slug à partir du nom résolu
  slug_base := lower(regexp_replace(resolved_name, '[^a-zA-Z0-9]+', '-', 'g'));
  slug_base := regexp_replace(slug_base, '^-+|-+$', '', 'g');
  IF slug_base = '' OR slug_base IS NULL THEN
    slug_base := 'organisation';
  END IF;

  -- 4. Garantir l'unicité du slug
  slug_attempt := slug_base;
  counter := 1;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = slug_attempt) LOOP
    slug_attempt := slug_base || '-' || counter;
    counter := counter + 1;
  END LOOP;

  -- 5. Créer l'org avec le nom résolu
  INSERT INTO organizations (name, slug, segment, billing_email, plan, billing_mode)
  VALUES (
    resolved_name,
    slug_attempt,
    'solo',
    NEW.email,
    'solo',
    'maison'
  )
  RETURNING id INTO new_org_id;

  -- 6. Membership owner
  INSERT INTO organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_default_org_for_user IS
  'Wave 6 + hotfix 2026-05-02 : crée auto 1 organization au signup. Utilise raw_user_meta_data.organization_name si fourni, sinon fallback sur email-based. Crée également le membership owner.';

NOTIFY pgrst, 'reload schema';
