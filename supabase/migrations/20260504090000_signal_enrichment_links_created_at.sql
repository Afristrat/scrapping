-- Ajout created_at sur les tables de liens signaux (manquant lors de Wave 10A)
ALTER TABLE signal_topics   ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE signal_entities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE signal_personas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
