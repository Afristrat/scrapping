ALTER TABLE settings ADD COLUMN IF NOT EXISTS consensus_models text[] DEFAULT ARRAY[]::text[];
