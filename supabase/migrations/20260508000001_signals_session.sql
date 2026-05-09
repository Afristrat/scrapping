-- Migration : Table éphémère signals_session (Kairos K03).
--
-- Stocke les signaux scrapés à la volée pour une session unique
-- (pipeline `research-from-seed` Bassira→Kairos), SANS polluer la table
-- `signals` user-scoped existante.
--
-- Contraintes :
--   * Pas user-owned : pas de policy user, accès uniquement via service_role
--     (edge functions appelantes — scraper-x/reddit/arxiv/rss en mode session).
--   * TTL court (default 1h, configurable par caller via `ttl_hours` du body).
--   * Auto-purge horaire via pg_cron (toutes les 15 min, requête bornée par
--     l'index sur `expires_at`).
--   * `created_by_api_key` capture la clé externe (Bassira) pour traçabilité
--     multi-tenant — facultatif, NULL pour appels internes.
--
-- Volumétrie cible : 30-80 signaux × ~10 sessions/jour, purgés à T+1h.

CREATE TABLE IF NOT EXISTS signals_session (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid          NOT NULL,
  source              text          NOT NULL CHECK (source IN ('x', 'reddit', 'arxiv', 'rss', 'web')),
  external_id         text,
  url                 text,
  title               text,
  raw_payload         jsonb,
  scraped_at          timestamptz   NOT NULL DEFAULT now(),
  expires_at          timestamptz   NOT NULL DEFAULT now() + interval '1 hour',
  created_by_api_key  text
);

CREATE INDEX IF NOT EXISTS idx_signals_session_session_id
  ON signals_session (session_id);

CREATE INDEX IF NOT EXISTS idx_signals_session_expires_at
  ON signals_session (expires_at);

ALTER TABLE signals_session ENABLE ROW LEVEL SECURITY;

-- Pas de policy user : signals_session n'est pas user-owned.
-- Accès uniquement via service_role (qui bypass RLS) depuis les edge fns.
-- Toute lecture/écriture via JWT user normal sera donc refusée par défaut.

COMMENT ON TABLE signals_session IS
  'Signaux éphémères scrapés pour une session research-from-seed (Bassira→Kairos). '
  'Auto-purgés via pg_cron quand expires_at < now(). Accès service_role uniquement.';

-- Cron job : purge horaire (toutes les 15 minutes pour rester réactif sur les TTL courts)
DO $$
BEGIN
  -- Idempotence : si pg_cron pas encore activé, le CREATE EXTENSION suivant le
  -- mettra en place. Si la migration `20260430000003_pg_cron.sql` est déjà
  -- passée, c'est un no-op.
  CREATE EXTENSION IF NOT EXISTS pg_cron;
END $$;

-- cron.schedule renvoie un jobid ; idempotence assurée par cron.unschedule
-- défensif (ignore si le job n'existe pas encore).
DO $$
BEGIN
  PERFORM cron.unschedule('purge-signals-session-hourly');
EXCEPTION
  WHEN OTHERS THEN
    -- Le job n'existe pas encore — premier passage de la migration.
    NULL;
END $$;

SELECT cron.schedule(
  'purge-signals-session-hourly',
  '*/15 * * * *',
  $$ DELETE FROM public.signals_session WHERE expires_at < now() $$
);
