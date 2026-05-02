-- =============================================================================
-- Wave 6 — Sub-wave 6.1 — Story 3 (S6-Backfill)
-- Backfill : créer 1 organization par user existant + populate org_id sur
-- toutes les tables tenant. Trigger auto-create org pour nouveaux signups.
-- =============================================================================
-- Depends on:
--   20260502000001_orgs.sql (organizations + organization_members)
--   20260502000002_org_id_columns.sql (colonne org_id partout)
-- =============================================================================

-- =============================================================================
-- Backfill : créer 1 org pour chaque user existant + propager org_id
-- =============================================================================

DO $$
DECLARE
  u RECORD;
  new_org_id UUID;
  email_local TEXT;
  slug_base TEXT;
  slug_attempt TEXT;
  counter INTEGER;
BEGIN
  FOR u IN SELECT id, email FROM auth.users LOOP
    -- Skip si l user a déjà une org (idempotence si re-run)
    IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = u.id) THEN
      CONTINUE;
    END IF;

    -- Slug à partir du local-part de l email (ASCII slug-safe)
    email_local := split_part(coalesce(u.email, 'user'), '@', 1);
    slug_base := lower(regexp_replace(email_local, '[^a-z0-9]+', '-', 'g'));
    slug_base := regexp_replace(slug_base, '^-+|-+$', '', 'g');
    IF slug_base = '' OR slug_base IS NULL THEN
      slug_base := 'user';
    END IF;

    -- Garantir l unicité (suffixe -1, -2, ...)
    slug_attempt := slug_base;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = slug_attempt) LOOP
      slug_attempt := slug_base || '-' || counter;
      counter := counter + 1;
    END LOOP;

    INSERT INTO organizations (name, slug, segment, billing_email, plan, billing_mode)
    VALUES (
      coalesce(email_local, 'My Organization'),
      slug_attempt,
      'solo',
      u.email,
      'solo',
      'maison'
    )
    RETURNING id INTO new_org_id;

    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (new_org_id, u.id, 'owner');

    -- Backfill org_id sur les 15 tables tenant
    UPDATE signals              SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE scores               SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE logs                 SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE llm_costs            SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE settings             SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE user_api_keys        SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE scoring_rubrics      SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE digests              SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE topics               SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE topic_runs           SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE topic_signals        SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE pending_minio_writes SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE admin_prompts        SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE admin_prompt_runs    SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE provider_models      SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
  END LOOP;
END $$;

-- =============================================================================
-- Trigger : auto-création d une organization à chaque nouveau signup
-- L ordre des triggers AFTER INSERT sur auth.users est alphabétique :
--   1. on_auth_user_created             (init_user_settings)
--   2. on_auth_user_created_create_org  (create_default_org_for_user)  ← NOUVEAU
--   3. trg_seed_admin_prompts_on_user_creation
-- Ces triggers ne dépendent pas de l org_id (qui est nullable à ce stade), la
-- valeur sera renseignée par le frontend / edge fn la première fois.
--
-- Pour les flows futurs : la création d un user via signup standard insèrera
-- automatiquement une org "solo" + membership owner.
-- Les flows multi-tenant (invitation) doivent supprimer cette org auto-créée
-- via edge fn accept-invitation (sous-vague 6.3) si l invité ne souhaite pas
-- garder son org perso.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_default_org_for_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  new_org_id UUID;
  email_local TEXT;
  slug_base TEXT;
  slug_attempt TEXT;
  counter INTEGER;
BEGIN
  email_local := split_part(coalesce(NEW.email, 'user'), '@', 1);
  slug_base := lower(regexp_replace(email_local, '[^a-z0-9]+', '-', 'g'));
  slug_base := regexp_replace(slug_base, '^-+|-+$', '', 'g');
  IF slug_base = '' OR slug_base IS NULL THEN
    slug_base := 'user';
  END IF;

  slug_attempt := slug_base;
  counter := 1;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = slug_attempt) LOOP
    slug_attempt := slug_base || '-' || counter;
    counter := counter + 1;
  END LOOP;

  INSERT INTO organizations (name, slug, segment, billing_email, plan, billing_mode)
  VALUES (
    coalesce(email_local, 'My Organization'),
    slug_attempt,
    'solo',
    NEW.email,
    'solo',
    'maison'
  )
  RETURNING id INTO new_org_id;

  INSERT INTO organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_create_org ON auth.users;

CREATE TRIGGER on_auth_user_created_create_org
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_org_for_user();

COMMENT ON FUNCTION public.create_default_org_for_user IS
  'Wave 6 : crée automatiquement 1 organization (segment solo, plan solo, mode maison) + membership owner pour chaque nouveau user.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
