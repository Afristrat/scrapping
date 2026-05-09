-- Option A — Proxy user mapping for public_api_keys (Kairos K09)
--
-- Chaque clé API publique (consommée par un client externe comme Bassira)
-- est associée à UN user Kairos qui agit comme tenant. Tous les appels
-- LLM orchestrés via research-from-seed sont attribués à ce user proxy :
-- ses settings.model_config[task] et ses user_api_keys déterminent
-- provider+model+credentials utilisés. Coûts trackés sur llm_costs.user_id
-- = proxy_user_id, ce qui permet le cost-per-tenant.

ALTER TABLE public_api_keys
  ADD COLUMN IF NOT EXISTS proxy_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_public_api_keys_proxy_user_id
  ON public_api_keys(proxy_user_id);

COMMENT ON COLUMN public_api_keys.proxy_user_id IS
  'User Kairos qui agit comme tenant pour cette clé API. Ses settings + user_api_keys sont utilisés pour les appels LLM orchestrés.';
