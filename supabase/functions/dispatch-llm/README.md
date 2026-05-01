# dispatch-llm

Edge Function Deno — Point d'entrée unique pour toutes les requêtes LLM (BYOK).

Centralise la logique d'authentification utilisateur, la résolution provider/model
depuis `settings.model_config`, la construction du client OpenAI-compatible, et
le retry exponentiel. Les fonctions clientes (`llm-score`, `llm-score-batch`,
`topic-classifier`, ...) appellent `dispatch-llm` au lieu de dupliquer cette
logique.

## Usage

```bash
POST /functions/v1/dispatch-llm
Authorization: Bearer <user JWT>
Content-Type: application/json

{
  "task": "scoring",
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

- `task` (requis) : `scoring` | `scraping` | `monitoring` | `digest`. Sert à
  résoudre le couple `(provider, model)` depuis `settings.model_config[task]`.
- `messages` (requis) : tableau OpenAI standard `{ role, content }`.
- `options` (optionnel) :
  - `max_tokens` : limite de tokens en sortie.
  - `response_format` : `{ type: 'json_object' | 'text' }`.
  - `temperature` : float.

## Réponse (succès)

```json
{
  "ok": true,
  "content": "<texte LLM>",
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "cost": 0 },
  "model_used": "anthropic/claude-haiku-4.5",
  "provider_used": "openrouter"
}
```

## Réponse (erreur)

```json
{ "ok": false, "error": "<code>", "detail": "<message>" }
```

Codes possibles : `missing_authorization`, `invalid_token`, `invalid_json`,
`invalid_task`, `messages_required`, `invalid_message`, `settings_not_found`,
`unknown_provider`, `missing_api_key`, `llm_failed`.

## Résolution provider/model

1. `settings.model_config[task]` (BYOK multi-provider, source vérité).
2. `settings.model_<task>` (legacy single-column).
3. Fallback final : `provider=openrouter`, `model=openrouter/auto`.

OpenRouter reste le citoyen first-class par défaut quand l'utilisateur n'a rien
configuré.

## Sécurité

- JWT requis (header `Authorization`).
- Lecture de `settings` via RLS (utilisateur ne peut lire que ses propres
  settings).
- Clé API utilisateur lue depuis `user_api_keys` via le helper
  `_shared/api-keys.ts` (RLS-protected, jamais loggué).
- La sanitisation du contenu (anti prompt injection) est de la responsabilité
  de l'appelant — `dispatch-llm` est volontairement générique.

## Secrets

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (auto-injectés)
- `OPENROUTER_API_KEY` (fallback si l'utilisateur n'a pas configuré sa clé)

## Setup local

```bash
bunx supabase functions serve dispatch-llm --env-file supabase/.env.local
```
