-- Rename task_kind values from 'moat:X' to 'X' + remove "Moat" from seed names/descriptions/templates.
-- User feedback : ne veut pas voir le terme "Moat" dans l'UI ou les variables.

-- 1. Drop old CHECK then add new one
ALTER TABLE admin_prompts DROP CONSTRAINT IF EXISTS admin_prompts_task_kind_check;

UPDATE admin_prompts SET task_kind = 'reddit'    WHERE task_kind = 'moat:reddit';
UPDATE admin_prompts SET task_kind = 'arxiv'     WHERE task_kind = 'moat:arxiv';
UPDATE admin_prompts SET task_kind = 'x'         WHERE task_kind = 'moat:x';
UPDATE admin_prompts SET task_kind = 'synthesis' WHERE task_kind = 'moat:synthesis';

ALTER TABLE admin_prompts ADD CONSTRAINT admin_prompts_task_kind_check
  CHECK (task_kind IN ('reddit','arxiv','x','synthesis','custom'));

-- 2. Rename seed names + descriptions + replace {{run:moat:X}} → {{run:X}}
UPDATE admin_prompts SET
  name = 'Reddit frustrations',
  description = 'Extrait les frustrations brutes et workarounds maison de Reddit pour identifier des besoins non articulés.'
WHERE is_seed = true AND task_kind = 'reddit';

UPDATE admin_prompts SET
  name = 'arXiv mécanismes',
  description = 'Identifie les mécanismes scientifiques validés (papers arXiv) et propose des analogies industrielles non encore transposées en produit.'
WHERE is_seed = true AND task_kind = 'arxiv';

UPDATE admin_prompts SET
  name = 'X timing',
  description = 'Détecte les sujets en phase de montée sur X/Twitter et leur tension non résolue pour identifier le bon timing de marché.'
WHERE is_seed = true AND task_kind = 'x';

UPDATE admin_prompts SET
  name = 'Synthesis Score',
  description = 'Croise frustrations Reddit + mécanismes arXiv + timing X pour scorer des features prioritaires (Novelty / Feasibility / Moat potential).'
WHERE is_seed = true AND task_kind = 'synthesis';

-- Replace template references {{run:moat:X}} → {{run:X}}
UPDATE admin_prompts SET user_prompt_template = REPLACE(user_prompt_template, '{{run:moat:reddit}}', '{{run:reddit}}') WHERE user_prompt_template LIKE '%{{run:moat:reddit}}%';
UPDATE admin_prompts SET user_prompt_template = REPLACE(user_prompt_template, '{{run:moat:arxiv}}', '{{run:arxiv}}') WHERE user_prompt_template LIKE '%{{run:moat:arxiv}}%';
UPDATE admin_prompts SET user_prompt_template = REPLACE(user_prompt_template, '{{run:moat:x}}', '{{run:x}}') WHERE user_prompt_template LIKE '%{{run:moat:x}}%';
UPDATE admin_prompts SET user_prompt_template = REPLACE(user_prompt_template, '{{run:moat:synthesis}}', '{{run:synthesis}}') WHERE user_prompt_template LIKE '%{{run:moat:synthesis}}%';

-- Replace "Moat Hunter" mentions in system_prompt and user_prompt_template
UPDATE admin_prompts SET
  system_prompt = REPLACE(REPLACE(system_prompt, 'Moat Hunter', 'analyse stratégique'), 'analyste produit Moat Hunter', 'analyste produit')
WHERE is_seed = true;

-- 3. Update the seed trigger function to use new values
CREATE OR REPLACE FUNCTION seed_admin_prompts_on_user_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO admin_prompts (user_id, name, description, task_kind, system_prompt, user_prompt_template, source_filter, display_order, is_seed)
  SELECT NEW.id, name, description, task_kind, system_prompt, user_prompt_template, source_filter, display_order, true
  FROM admin_prompts
  WHERE is_seed = true
  GROUP BY name, description, task_kind, system_prompt, user_prompt_template, source_filter, display_order
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
