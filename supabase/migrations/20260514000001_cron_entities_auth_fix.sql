-- =============================================================================
-- Migration : nettoyage cron entities/reputation/clustering cassés
--
-- Découverte en runtime (.11) : `enrich-entities-cron` échouait à CHAQUE run
-- (`unrecognized configuration parameter "app.supabase_url"` puis, après
-- correction du GUC, `invalid_token` — Bearer service_role seul rejeté par
-- enrich-entities/index.ts qui appelait supabase.auth.getUser()). Ce job est
-- de plus REDONDANT avec `process-pending-enrichments-30min` : les deux
-- tournent toutes les 30 min et dispatchent vers enrich-entities pour le
-- même pass_kind='entities'. process-pending-enrichments est l'orchestrateur
-- canonique (couvre aussi reputation + clustering) — enrich-entities-cron
-- est un résidu jamais nettoyé après son introduction (GUC jamais corrects,
-- jamais fonctionnel depuis sa création).
--
-- Le vrai fix (enrich-entities/compute-reputation acceptent désormais
-- x-cron-secret pour bypasser getUser() en mode system-wide, comme
-- cluster-signals) est côté code (cette session). Cette migration ne fait
-- que retirer le doublon cron mort.
-- =============================================================================

DO $outer$
BEGIN
  PERFORM cron.unschedule('enrich-entities-cron');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job déjà absent
END
$outer$;
