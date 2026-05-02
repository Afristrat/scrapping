-- =============================================================================
-- 20260502000006_admin_prompts_by_org.sql
--
-- Wave 6 (sous-vague 6.4 / fix edge case S6-OrgQueries) :
-- Bascule du seed automatique des admin_prompts du user-level → org-level.
--
-- Avant cette migration :
--   - Trigger AFTER INSERT auth.users (seed_admin_prompts_on_user_creation)
--     copiait les 4 prompts seed (Reddit / arXiv / X / Synthesis) pour chaque
--     nouveau user.
--   - Fonctionnait par accident dans le mode 1 user = 1 org auto-créée
--     (Wave 6.1 backfill), mais cassait dès qu'un user rejoignait une org B
--     via invitation : il n'avait PAS de seeds dans org B.
--
-- Après cette migration :
--   - Le trigger user-level est DROP.
--   - Un nouveau trigger AFTER INSERT organization_members WHERE role='owner'
--     déclenche le seed pour la nouvelle org (timing correct : membership
--     existe au moment du fire).
--   - Backfill : pour chaque org existante sans aucun prompt seed, on seed
--     en copiant depuis n'importe quelle org existante qui en a déjà
--     (DISTINCT ON name+task_kind, garde le 1er créé par stabilité).
--
-- L'admin_prompts.user_id (NOT NULL) reçoit l'id du owner de l'org cible.
-- Les prompts deviennent ainsi org-scoped dans le sens RLS (org_id) tout en
-- conservant un user_id propriétaire pour la rétrocompat.
-- =============================================================================

-- 1. Drop l'ancien trigger user-level (créé par 20260501000008 + 10)

DROP TRIGGER IF EXISTS trg_seed_admin_prompts_on_user_creation ON auth.users;
DROP FUNCTION IF EXISTS public.seed_admin_prompts_on_user_creation();

-- 2. Fonction utilitaire : seed les prompts pour une org cible

CREATE OR REPLACE FUNCTION public.seed_admin_prompts_for_org(target_org_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  owner_user_id UUID;
BEGIN
  -- Idempotence : si l'org a déjà des seeds, ne rien faire.
  IF EXISTS (
    SELECT 1 FROM admin_prompts
    WHERE org_id = target_org_id AND is_seed = true
  ) THEN
    RETURN;
  END IF;

  -- Trouver le owner pour user_id (NOT NULL côté admin_prompts).
  SELECT user_id INTO owner_user_id
  FROM organization_members
  WHERE org_id = target_org_id AND role = 'owner'
  ORDER BY joined_at ASC
  LIMIT 1;

  IF owner_user_id IS NULL THEN
    RAISE NOTICE 'No owner found for org %, skipping seed (will retry on first member insert)', target_org_id;
    RETURN;
  END IF;

  -- Copier 1 set complet de seeds (DISTINCT par name+task_kind).
  INSERT INTO admin_prompts (
    user_id, org_id, name, description, task_kind, system_prompt,
    user_prompt_template, source_filter, display_order, is_seed
  )
  SELECT DISTINCT ON (name, task_kind)
    owner_user_id, target_org_id, name, description, task_kind, system_prompt,
    user_prompt_template, source_filter, display_order, true
  FROM admin_prompts
  WHERE is_seed = true
  ORDER BY name, task_kind, created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.seed_admin_prompts_for_org IS
  'Wave 6.4 : copie les 4 prompts seed (Reddit/arXiv/X/Synthesis) vers une org cible. Idempotent : ne fait rien si l org a déjà ses seeds. Skip si pas de owner (re-déclenché à l ajout du 1er owner).';

-- 3. Trigger AFTER INSERT organization_members WHERE role='owner'
--    Le trigger fire APRÈS l'insert du owner, ce qui garantit que la fonction
--    trouve bien un owner_user_id à utiliser comme user_id.

CREATE OR REPLACE FUNCTION public.on_org_owner_added_seed_prompts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    PERFORM public.seed_admin_prompts_for_org(NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_admin_prompts_on_member_added ON organization_members;

CREATE TRIGGER trg_seed_admin_prompts_on_member_added
  AFTER INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION public.on_org_owner_added_seed_prompts();

COMMENT ON FUNCTION public.on_org_owner_added_seed_prompts IS
  'Wave 6.4 : déclenche seed_admin_prompts_for_org dès qu un owner est ajouté à une org (signup ou invitation). Idempotent.';

-- 4. Backfill : seed pour les orgs existantes qui n'ont pas leurs seeds
--    (tous les orgs auto-créés par Wave 6.1 ont leur owner mais peut-être pas
--    leurs prompts seeds si le trigger user-level a fired AVANT que l'org
--    existe — au moment du backfill orgs en migration 3, les prompts existaient
--    déjà sous user_id avec org_id = NULL, puis ont été assignés à l'org auto
--    via le UPDATE backfill. Donc les seeds existent. Mais on garde le
--    backfill pour défensif.)

DO $$
DECLARE
  org_rec RECORD;
BEGIN
  FOR org_rec IN SELECT id FROM organizations LOOP
    PERFORM public.seed_admin_prompts_for_org(org_rec.id);
  END LOOP;
END $$;

-- 5. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
