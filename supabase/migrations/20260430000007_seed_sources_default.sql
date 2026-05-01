-- Seed sources defaults : VEILLE_IA_ZLATAN_CORE subreddits + arxiv categories
-- Updates column defaults AND backfills existing rows (only if still on original defaults).

-- =============================================================================
-- New column defaults
-- =============================================================================

ALTER TABLE settings ALTER COLUMN reddit_subs SET DEFAULT ARRAY[
  'MachineLearning',
  'LocalLLaMA',
  'AI_Agents',
  'ClaudeAI',
  'ClaudeCode',
  'ChatGPTCoding',
  'vibecoding',
  'OpenAI',
  'PromptEngineering',
  'StableDiffusion',
  'deeplearning',
  'LLMDevs',
  'MLOps',
  'artificial',
  'ArtificialIntelligence',
  'singularity',
  'hardware',
  'nvidia'
]::TEXT[];

ALTER TABLE settings ALTER COLUMN arxiv_categories SET DEFAULT ARRAY[
  'cs.AI',
  'cs.LG',
  'cs.CL',
  'cs.CV',
  'cs.MA',
  'stat.ML'
]::TEXT[];

-- x_queries reste vide par default (Apify utilise list IDs via apify_config.x_list_ids)

-- =============================================================================
-- Backfill existing rows that still have the original init defaults
-- =============================================================================

-- Reddit : backfill only if the user still has the original 3-sub default
UPDATE settings
SET reddit_subs = ARRAY[
  'MachineLearning',
  'LocalLLaMA',
  'AI_Agents',
  'ClaudeAI',
  'ClaudeCode',
  'ChatGPTCoding',
  'vibecoding',
  'OpenAI',
  'PromptEngineering',
  'StableDiffusion',
  'deeplearning',
  'LLMDevs',
  'MLOps',
  'artificial',
  'ArtificialIntelligence',
  'singularity',
  'hardware',
  'nvidia'
]::TEXT[]
WHERE reddit_subs = ARRAY['LocalLLaMA','MachineLearning','singularity']::TEXT[];

-- Arxiv : backfill only if still on original 2-category default
UPDATE settings
SET arxiv_categories = ARRAY[
  'cs.AI',
  'cs.LG',
  'cs.CL',
  'cs.CV',
  'cs.MA',
  'stat.ML'
]::TEXT[]
WHERE arxiv_categories = ARRAY['cs.AI','cs.CL']::TEXT[];

-- Branding : rename zlatan-scrap -> theresa-scrap for existing rows
UPDATE settings
SET branding = jsonb_set(branding, '{name}', '"theresa-scrap"')
WHERE branding->>'name' = 'zlatan-scrap';
