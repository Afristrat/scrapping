-- ============================================================================
-- Setup proxy user bassira-bot pour le pipeline research-from-seed (Option A bis)
-- ============================================================================
--
-- Prérequis :
--   1. User créé via Studio → Authentication → Users → Add user :
--      - Email : bassira-bot@internal.kairos.local
--      - Password : aléatoire NOTÉ (sera réutilisé en secret Edge Function)
--      - Auto Confirm User : oui
--      → copie l'UUID du user créé (sera <BASSIRA_BOT_USER_ID> ci-dessous)
--      → copie aussi le password noté (sera posé en secret KAIROS_PROXY_USER_PASSWORD)
--
--   2. Récupère ta clé OpenRouter (ou autre provider BYOK) :
--      https://openrouter.ai/settings/keys
--      → copie la valeur sk-or-v1-xxxxxx (sera <OPENROUTER_KEY> ci-dessous)
--
--   3. APRÈS avoir lancé ce script, pose le password proxy en secret Edge :
--      cd kairos
--      npx supabase secrets set KAIROS_PROXY_USER_PASSWORD='<le-password-du-user>'
--
-- Exécution :
--   - Soit Studio → SQL Editor → coller ce script → REPLACE les <PLACEHOLDERS>
--     → Run
--   - Soit CLI :
--       cd kairos
--       npx supabase db query --linked < scripts/setup-bassira-proxy.sql
--     (mais attention : npx supabase db query inline pas idéal pour multi-statement,
--      préférer Studio SQL Editor pour ce script)
--
-- ============================================================================

-- ⚠️ REMPLACE LES 2 PLACEHOLDERS CI-DESSOUS AVANT EXÉCUTION ⚠️
-- (placeholder du user_id sur la ligne suivante, et openrouter_key plus bas)

DO $$
DECLARE
  v_user_id UUID := '<BASSIRA_BOT_USER_ID>'::uuid;       -- ← REMPLACE
  v_openrouter_key TEXT := '<OPENROUTER_KEY>';           -- ← REMPLACE
  v_provider_choice TEXT := 'openrouter';                -- ou 'anthropic', 'openai', etc
  v_model_enrichment TEXT := 'openrouter/auto';          -- ou 'anthropic/claude-sonnet-4-6', etc
  v_model_scoring TEXT := 'openrouter/auto';             -- modèle plus rapide pour scoring si tu veux
  v_api_key_name TEXT := 'bassira-prod';                 -- nom dans public_api_keys
BEGIN
  -- Sanity checks
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'BASSIRA_BOT_USER_ID non fourni';
  END IF;
  IF v_openrouter_key = '<OPENROUTER_KEY>' OR v_openrouter_key = '' THEN
    RAISE EXCEPTION 'OPENROUTER_KEY non fournie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User % n''existe pas dans auth.users — crée-le d''abord via Studio', v_user_id;
  END IF;

  -- ── 1. settings : BYOK model_config par task ──────────────────────────
  -- Le trigger init_user_settings devrait déjà avoir créé une row par défaut.
  -- On UPSERT pour configurer model_config avec les tasks dont on a besoin.
  INSERT INTO settings (user_id, model_config, language)
  VALUES (
    v_user_id,
    jsonb_build_object(
      'enrichment', jsonb_build_object('provider', v_provider_choice, 'model', v_model_enrichment),
      'scoring', jsonb_build_object('provider', v_provider_choice, 'model', v_model_scoring)
    ),
    'fr'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    model_config = COALESCE(settings.model_config, '{}'::jsonb)
                   || jsonb_build_object(
                        'enrichment', jsonb_build_object('provider', v_provider_choice, 'model', v_model_enrichment),
                        'scoring', jsonb_build_object('provider', v_provider_choice, 'model', v_model_scoring)
                      );

  -- ── 2. user_api_keys : clé OpenRouter du proxy user ───────────────────
  -- Note : encrypted_key stocke en clair malgré le nom (legacy CLAUDE.md).
  INSERT INTO user_api_keys (user_id, provider, encrypted_key, masked_key)
  VALUES (
    v_user_id,
    v_provider_choice,
    v_openrouter_key,
    LEFT(v_openrouter_key, 8) || '...' || RIGHT(v_openrouter_key, 4)
  )
  ON CONFLICT (user_id, provider) DO UPDATE SET
    encrypted_key = EXCLUDED.encrypted_key,
    masked_key    = EXCLUDED.masked_key;

  -- ── 3. public_api_keys : lier la clé Bassira au proxy user ────────────
  UPDATE public_api_keys
  SET proxy_user_id = v_user_id
  WHERE name = v_api_key_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'public_api_keys.name = % introuvable. Crée d''abord la clé Bassira via INSERT.', v_api_key_name;
  END IF;

  -- ── 4. Verification ───────────────────────────────────────────────────
  RAISE NOTICE '✓ Settings configurés pour user %', v_user_id;
  RAISE NOTICE '✓ user_api_keys provider=% configuré', v_provider_choice;
  RAISE NOTICE '✓ public_api_keys (%) lié à proxy_user_id=%', v_api_key_name, v_user_id;
END $$;

-- ── 5. Verification finale (sortie SELECT pour relire) ──────────────────
SELECT
  pak.name                                    AS api_key_name,
  pak.key_prefix                              AS api_key_prefix,
  pak.proxy_user_id                           AS proxy_user_id,
  au.email                                    AS proxy_user_email,
  s.model_config -> 'enrichment'              AS enrichment_config,
  s.model_config -> 'scoring'                 AS scoring_config,
  uak.provider                                AS byok_provider,
  uak.masked_key                              AS byok_masked_key
FROM public_api_keys pak
LEFT JOIN auth.users   au  ON au.id  = pak.proxy_user_id
LEFT JOIN settings     s   ON s.user_id = pak.proxy_user_id
LEFT JOIN user_api_keys uak ON uak.user_id = pak.proxy_user_id
WHERE pak.name = 'bassira-prod';
