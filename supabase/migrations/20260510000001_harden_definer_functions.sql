-- Durcissement des fonctions SECURITY DEFINER sans search_path (audit blindage P2-018).
--
-- Une fonction SECURITY DEFINER sans `SET search_path` est vulnérable au
-- hijacking de résolution d'objet : un schéma malveillant dans le search_path de
-- l'appelant peut détourner une référence non qualifiée. On fige le search_path.
--
-- compute_signal_weight est la seule directement appelable (les autres sont des
-- fonctions de trigger, invoquées en contexte définisseur). Aucun call-site
-- applicatif → on la retire de PUBLIC (les triggers l'appellent en interne,
-- indépendamment de ce GRANT).

ALTER FUNCTION public.compute_signal_weight(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.enqueue_signal_enrichments() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_entity_signal_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_recompute_weight_on_entity() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_recompute_weight_on_score() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.compute_signal_weight(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_signal_weight(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
