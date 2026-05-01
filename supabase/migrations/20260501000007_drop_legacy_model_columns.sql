-- Drop legacy model_* columns now that model_config jsonb is the source of truth.
-- Backfill was done in 20260501000004_byok_multi_provider.sql for existing rows.

-- Sanity check : ensure all rows have model_config populated.
-- If any row has empty model_config but non-null legacy column, copy it now.
UPDATE settings SET model_config = jsonb_strip_nulls(jsonb_build_object(
  'scoring',     CASE WHEN model_scoring     IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_scoring)     END,
  'scraping',    CASE WHEN model_scraping    IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_scraping)    END,
  'monitoring',  CASE WHEN model_monitoring  IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_monitoring)  END,
  'digest',      CASE WHEN model_digest      IS NOT NULL THEN jsonb_build_object('provider','openrouter','model',model_digest)      END
))
WHERE model_config = '{}'::jsonb OR model_config IS NULL;

-- Drop columns
ALTER TABLE settings DROP COLUMN IF EXISTS model_scoring;
ALTER TABLE settings DROP COLUMN IF EXISTS model_scraping;
ALTER TABLE settings DROP COLUMN IF EXISTS model_monitoring;
ALTER TABLE settings DROP COLUMN IF EXISTS model_digest;
