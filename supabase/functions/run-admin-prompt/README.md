# run-admin-prompt

Edge Function Deno — Exécute un prompt admin (template éditable) avec
composition de runs précédents et fetch dynamique des signaux selon
`source_filter`.

Charge un prompt depuis `admin_prompts`, fetch les signaux pertinents
(filtrés par sources/window/min_score), render les variables `{{...}}`
avec un template engine isolé (`template.ts`), appelle `dispatch-llm`
avec `task: 'monitoring'` (BYOK), persiste le run dans `admin_prompt_runs`
et logge le coût dans `llm_costs`.

## Usage

```bash
POST /functions/v1/run-admin-prompt
Authorization: Bearer <user JWT>
Content-Type: application/json

{
  "prompt_id": "uuid-du-prompt-admin",
  "override_filter": {            // optionnel — surcharge prompt.source_filter
    "sources": ["reddit"],         // optionnel
    "window_hours": 168,           // optionnel
    "min_score": 50,               // optionnel
    "max_count": 50                // optionnel, default 30, max 200
  }
}
```

## Réponse (succès)

```json
{
  "ok": true,
  "run_id": "uuid",
  "content": "## Frustrations détectées\n- ...",
  "model_used": "anthropic/claude-haiku-4.5",
  "provider_used": "openrouter",
  "cost": 0.00081,
  "signal_count": 24,
  "executed_at": "2026-05-01T10:23:00.000Z"
}
```

## Réponse (erreur)

```json
{ "ok": false, "error": "<code>", "detail": "<message>", "run_id": "<uuid|null>" }
```

Codes possibles :

- `missing_authorization`, `invalid_token`, `invalid_json`, `method_not_allowed`
- `supabase_env_missing`, `prompt_id_required`
- `prompt_not_found`, `settings_not_found`
- `signals_fetch_failed`, `scores_fetch_failed`
- `dispatch_unreachable`, `llm_failed`
- `db_write_failed`

## Variables supportées dans les templates

Le template engine (`template.ts`) substitue les marqueurs suivants dans
`system_prompt` ET `user_prompt_template` :

| Variable               | Contenu                                                     |
|------------------------|-------------------------------------------------------------|
| `{{run:<task_kind>}}`  | `output_markdown` du dernier run success de ce `task_kind` |
| `{{signals_block}}`    | Liste markdown lisible des signaux (titre, source, score) |
| `{{signals}}`          | JSON brut des signaux (tronqué à 30 000 chars)              |
| `{{topics_emerging}}`  | Noms (csv) des topics avec `trend = 'emerging'` (top 10)    |
| `{{language}}`         | `fr` \| `en` \| `es` (depuis `settings.language`)           |
| `{{date}}`             | Date du run au format `YYYY-MM-DD` (UTC)                    |
| `{{rubric}}`           | Prompt de la rubric active (ou placeholder si absente)      |

Si une variable `{{run:<kind>}}` n'a pas de run précédent en base, elle
est remplacée par `(aucun run précédent disponible)`. Idem pour les
autres variables (placeholder explicite plutôt que chaîne vide).

## Pipeline interne

1. Auth JWT → `supabase.auth.getUser()`
2. Charge `admin_prompts` (RLS — uniquement le user courant)
3. Charge `settings.language` + `settings.active_rubric_id`
4. Calcule le filter effectif : `{ ...prompt.source_filter, ...override_filter }`
5. Fetch signaux : sources → window_hours → min_score → tri par score desc → slice max_count
6. Fetch topics `trend='emerging'` (top 10 par `last_seen_at`)
7. Si `active_rubric_id` → fetch le prompt de la rubric
8. Pour chaque `{{run:<kind>}}` détecté dans le template, fetch le dernier run success
9. Render `system_prompt` + `user_prompt_template` via `renderTemplate(...)`
10. Appel `/functions/v1/dispatch-llm` avec `task: 'monitoring'`, `max_tokens: 2500`
11. Insert `admin_prompt_runs` (status `success`/`failed`) + `llm_costs` en parallèle
12. Logge `run-admin-prompt:run` (ok) ou `:error` (failed)

## Anti prompt-injection

Le contenu des signaux est traité comme données — chaque template système
seed rappelle au LLM d'ignorer toute instruction présente dans les
signaux. L'utilisateur peut éditer ses prompts mais reste responsable
du wording (les seeds incluent déjà le rappel).

## Sécurité

- JWT obligatoire ; toutes les lectures (`admin_prompts`, `signals`,
  `scores`, `topics`, `scoring_rubrics`, `settings`) passent par RLS
  utilisateur.
- Aucune clé API stockée ou loggée — `dispatch-llm` gère la résolution
  provider+key (BYOK via `user_api_keys`).
- Les runs failed sont persistés avec `error` (sans token JWT ni clé).

## Setup local

```bash
bunx supabase functions serve run-admin-prompt --env-file supabase/.env.local
```

## Tests

Le template engine (`template.ts`) est isolé et testable en pur Deno.
Les tests unitaires sont couverts par US-008.
