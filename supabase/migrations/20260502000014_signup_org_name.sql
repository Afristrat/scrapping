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
  custom_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'organization_name', '')), '');
  email_local := split_part(coalesce(NEW.email, 'user'), '@', 1);
  resolved_name := coalesce(custom_name, email_local, 'My Organization');

  slug_base := lower(regexp_replace(resolved_name, '[^a-zA-Z0-9]+', '-', 'g'));
  slug_base := regexp_replace(slug_base, '^-+|-+$', '', 'g');
  IF slug_base = '' OR slug_base IS NULL THEN
    slug_base := 'organisation';
  END IF;

  slug_attempt := slug_base;
  counter := 1;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = slug_attempt) LOOP
    slug_attempt := slug_base || '-' || counter;
    counter := counter + 1;
  END LOOP;

  INSERT INTO organizations (name, slug, segment, billing_email, plan, billing_mode)
  VALUES (resolved_name, slug_attempt, 'solo', NEW.email, 'solo', 'maison')
  RETURNING id INTO new_org_id;

  INSERT INTO organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
