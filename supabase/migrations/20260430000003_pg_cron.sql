-- Cron jobs (purge logs 24h).
-- Note : pg_cron requiert l'extension activée côté Supabase. Sur free tier
-- elle est dispo, mais si KO le fallback est de purger côté Edge Function
-- run-pipeline (best-effort).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Purge logs > 24h, toutes les heures
SELECT cron.schedule(
  'purge_logs_24h',
  '0 * * * *',
  $$ DELETE FROM public.logs WHERE ts < now() - interval '24 hours' $$
);

COMMENT ON EXTENSION pg_cron IS 'Used to purge logs > 24h hourly.';
