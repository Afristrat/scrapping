-- Migration : Profils nommés de configuration
-- Permet à chaque utilisateur de sauvegarder plusieurs snapshots de ses paramètres
-- et de basculer entre eux sans tout reconfigurer.

CREATE TABLE IF NOT EXISTS settings_profiles (
  id           uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text          NOT NULL CHECK (length(name) > 0 AND length(name) <= 80),
  config_snapshot jsonb      NOT NULL,
  created_at   timestamptz   DEFAULT now() NOT NULL
);

ALTER TABLE settings_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profiles"
  ON settings_profiles
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index pour accélérer les lectures par user_id (typique : liste des profils)
CREATE INDEX IF NOT EXISTS settings_profiles_user_id_idx
  ON settings_profiles (user_id, created_at DESC);
