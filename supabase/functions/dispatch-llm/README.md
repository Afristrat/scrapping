# dispatch-llm

Edge Function Deno — **Péage unique LLM** (ADR 0010). Point d'entrée unique pour
toutes les requêtes LLM (BYOK).

Centralise :

1. **Auth dual-mode** (ADR 0009) : JWT user OU appel interne
   (`x-internal-secret` + `x-proxy-user-id`) via `_shared/internal-auth.ts`.
2. **Résolution provider/model** : overrides du body (consensus multi-modèles) >
   `settings.model_config[task]` > OpenRouter par défaut.
3. **Garde budget** (`_shared/budget-check.ts`, fail-open) : HTTP 402 si la
   dépense LLM du jour (UTC) atteint `settings.daily_budget_usd` — évaluée
   AVANT l'appel payant.
4. **Péage argent** : chaque complétion aboutie écrit UNE ligne `llm_costs`
   (label fin via `cost_task`). Les fonctions clientes n'écrivent JAMAIS
   `llm_costs` elles-mêmes.
5. Construction du client OpenAI-compatible + retry exponentiel.

Les fonctions clientes (`llm-score`, `llm-score-batch`, `topic-classifier`,
`digest`, `enrich-*`, `run-admin-prompt`, chaîne K06, ...) appellent
`dispatch-llm` au lieu de dupliquer cette logique.

## Usage

```bash
POST /functions/v1/dispatch-llm
Authorization: Bearer <user JWT>          # mode user
# OU (mode interne, hops service-to-service) :
# x-internal-secret: <INTERNAL_FN_SECRET>
# x-proxy-user-id: <uuid>
Content-Type: application/json

{
  "task": "scoring",
  "cost_task": "scoring:gates",
  "provider_override": "anthropic",
  "model_override": "claude-haiku-4-5",
  "messages": [
    { "role": "system", "content": "Tu es un scoreur..." },
    { "role": "user", "content": "Signal à scorer : ..." }
  ],
  "options": {
    "max_tokens": 200,
    "response_format": { "type": "json_object" },
    "temperature": 0.7
  }
}
```

### Champs

- `task` (requis) : `scoring` | `scraping` | `monitoring` | `digest` |
  `enrichment`. Sert à résoudre le couple `(provider, model)` depuis
  `settings.model_config[task]`.
- `messages` (requis) : tableau OpenAI standard `{ role, content }`.
- `provider_override` + `model_override` (optionnels, **couple obligatoire**) :
  court-circuitent `model_config` — utilisés par le mode consensus de
  `llm-score-batch` (un couple par modèle du panel).
- `cost_task` (optionnel) : label écrit dans `llm_costs.task` (TEXT, 1-64
  chars) pour l'attribution fine (`enrich:topic`, `admin_prompt:reddit`, ...).
  Défaut : `task`.
- `options` (optionnel) :
  - `max_tokens` : limite de tokens en sortie.
  - `response_format` : `{ type: 'json_object' | 'text' }`.
  - `temperature` : float (transmise telle quelle au provider).

## Réponse (succès)

```json
{
  "ok": true,
  "content": "<texte LLM>",
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "cost": 0 },
  "model_used": "anthropic/claude-haiku-4.5",
  "provider_used": "openrouter",
  "cost_recorded": true
}
```

`cost_recorded=false` signale un échec d'écriture du péage (loggé en
`dispatch-llm:cost_write_failed`) — la réponse LLM reste utilisable.

## Réponse (erreur)

```json
{ "ok": false, "error": "<code>", "detail": "<message>" }
```

Codes possibles : `missing_authorization`, `invalid_token`,
`internal_missing_proxy_header`, `internal_secret_misconfigured`,
`invalid_json`, `invalid_task`, `messages_required`, `invalid_message`,
`invalid_override`, `budget_exceeded` (402), `unknown_provider`,
`missing_api_key`, `llm_failed`.

## Résolution provider/model

1. `provider_override` + `model_override` du body (couple validé, tout-ou-rien).
2. `settings.model_config[task]` (BYOK multi-provider, source vérité).
3. Fallback final : `provider=openrouter`, `model=openrouter/auto`.

Logique pure dans `resolve.ts` (testée par `resolve.test.ts`).

## Péage argent (llm_costs)

- Une ligne par complétion aboutie : `user_id`, `org_id` (résolu explicitement
  — premier org rejoint, même sémantique que `user_default_org_id()`), `task`
  (= `cost_task`), `model`, tokens, `cost`.
- Coût : `usage.cost` du provider (OpenRouter) sinon calcul
  `provider_models.pricing_*` sinon 0.
- La colonne `llm_costs.task` est TEXT libre depuis la migration
  `20260511000001` (l'ancien ENUM rejetait silencieusement tous les labels
  hors scraping/scoring/monitoring → `llm_costs` restait vide).

## Sécurité

- Mode user : JWT requis, lectures sous RLS.
- Mode interne : `x-internal-secret` comparé en temps constant, identité =
  `x-proxy-user-id` (UUID), queries en service_role avec filtres `user_id`
  explicites (ADR 0009).
- Clé API utilisateur lue depuis `user_api_keys` via `_shared/api-keys.ts`
  (jamais logguée).
- La sanitisation du contenu (anti prompt injection) est de la responsabilité
  de l'appelant — `dispatch-llm` est volontairement générique.

## Secrets

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injectés)
- `INTERNAL_FN_SECRET` (mode interne)
- `OPENROUTER_API_KEY` (fallback si l'utilisateur n'a pas configuré sa clé)

## Tests

```bash
deno test --allow-env --node-modules-dir=auto supabase/functions/dispatch-llm/resolve.test.ts
deno test --allow-env --node-modules-dir=auto supabase/functions/_shared/budget-check.test.ts
```

## Setup local

```bash
bunx supabase functions serve dispatch-llm --env-file supabase/.env.local
```
