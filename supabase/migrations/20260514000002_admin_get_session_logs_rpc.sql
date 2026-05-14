-- =============================================================================
-- Observabilité API Inbound — RPC pour lire les logs liés à une session
--
-- La table `logs` a une policy RLS user-scoped (`own_logs`) — chaque user
-- voit uniquement les rows où `user_id = auth.uid()`. Or les logs du
-- pipeline research-from-seed sont écrits avec `user_id = proxy_user_id`
-- (le founder Kairos), pas avec l'admin connecté.
--
-- Résultat : un .eq('user_id', proxy_user_id) côté frontend retournait
-- toujours 0 rows pour un admin différent du proxy user — la section
-- "Logs liés" du drawer /admin/api-inbound était systématiquement vide.
--
-- Solution : RPC SECURITY DEFINER qui by-passe RLS mais gate explicitement
-- sur public.is_app_admin(). Périmètre contrôlé : on retourne uniquement
-- les logs liés à une session existante (jointure par proxy_user_id +
-- fenêtre temporelle [created_at, completed_at]).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_session_logs(p_session_id UUID)
RETURNS TABLE (
  id           BIGINT,
  user_id      UUID,
  action       TEXT,
  payload      JSONB,
  status       TEXT,
  ts           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proxy_user_id UUID;
  v_created_at    TIMESTAMPTZ;
  v_upper_bound   TIMESTAMPTZ;
BEGIN
  -- Gate : seuls les app_admins peuvent lire les logs cross-user.
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Récupère la fenêtre temporelle + le proxy user de la session ciblée.
  SELECT s.proxy_user_id, s.created_at, COALESCE(s.completed_at, now())
    INTO v_proxy_user_id, v_created_at, v_upper_bound
  FROM research_sessions s
  WHERE s.id = p_session_id;

  IF v_proxy_user_id IS NULL THEN
    RETURN; -- session inconnue ou sans proxy → 0 rows.
  END IF;

  RETURN QUERY
  SELECT l.id, l.user_id, l.action, l.payload, l.status, l.ts
  FROM logs l
  WHERE l.user_id = v_proxy_user_id
    AND l.ts BETWEEN v_created_at AND v_upper_bound
    AND l.action LIKE ANY (ARRAY[
      'research-strategist%',
      'rubric-architect%',
      'scraper-x%',
      'scraper-reddit%',
      'scraper-arxiv%',
      'llm-score-batch%',
      'signal-synthesizer%',
      'quality-auditor%'
    ])
  ORDER BY l.ts ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_session_logs(UUID) IS
  'Retourne les logs du pipeline research-from-seed liés à une session. Gate is_app_admin(). SECURITY DEFINER pour by-passer la RLS own_logs.';

GRANT EXECUTE ON FUNCTION public.get_session_logs(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
