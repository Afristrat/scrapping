-- Proxy user mapping pour public_api_keys (ADR 0009 — auth interne K06).
--
-- Chaque clé API publique (consommée par un client externe, ex. Bassira) est
-- associée à UN user Kairos qui agit comme tenant. Tous les appels LLM
-- orchestrés via research-from-seed sont attribués à ce user proxy : ses
-- settings.model_config[task] et ses user_api_keys déterminent
-- provider+model+credentials. Les coûts sont trackés sur llm_costs.user_id =
-- proxy_user_id → cost-per-tenant natif.
--
-- Le proxy_user_id est autoritatif (mappé côté admin Kairos), jamais fourni par
-- le client externe. resolveCaller (_shared/internal-auth.ts) l'utilise comme
-- identité en mode internal.

ALTER TABLE public_api_keys
  ADD COLUMN IF NOT EXISTS proxy_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_public_api_keys_proxy_user_id
  ON public_api_keys(proxy_user_id);

COMMENT ON COLUMN public_api_keys.proxy_user_id IS
  'User Kairos tenant pour cette clé API. Ses settings + user_api_keys pilotent les appels LLM orchestrés (ADR 0009).';

NOTIFY pgrst, 'reload schema';
