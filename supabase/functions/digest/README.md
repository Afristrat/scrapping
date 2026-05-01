# digest

Edge Function Deno — Génère un brief 80/20 markdown à partir des signaux scorés.

Agrège les top signaux scorés sur une fenêtre temporelle, construit un prompt
système multilangue (fr/en/es) basé sur `settings.language`, appelle
`dispatch-llm` avec `task: 'digest'`, persiste le résultat dans la table
`digests` (RLS-protected) et logge le coût dans `llm_costs`.

## Usage

```bash
POST /functions/v1/digest
Authorization: Bearer <user JWT>
Content-Type: application/json

{
  "window_hours": 24,   // optionnel, défaut 24, range [1, 720]
  "min_score": 60        // optionnel, défaut 60, range [0, 100]
}
```

## Réponse (succès)

```json
{
  "ok": true,
  "digest_id": "uuid",
  "content": "## Highlights critiques\n- ...",
  "signal_count": 18,
  "window_hours": 24,
  "min_score": 60,
  "language": "fr",
  "model_used": "anthropic/claude-haiku-4.5",
  "provider_used": "openrouter",
  "cost": 0.00042,
  "generated_at": "2026-05-01T10:23:00.000Z"
}
```

## Réponse (erreur)

```json
{ "ok": false, "error": "<code>", "detail": "<message>" }
```

Codes possibles :
- `missing_authorization`, `invalid_token`, `invalid_json`, `method_not_allowed`
- `supabase_env_missing`, `settings_not_found`
- `scores_fetch_failed`, `signals_fetch_failed`
- `no_signals` (aucun signal au-dessus du seuil ou hors fenêtre)
- `dispatch_unreachable`, `llm_failed`
- `db_write_failed`

## Pipeline interne

1. Auth JWT → `supabase.auth.getUser()`
2. Lit `settings.language` (fr | en | es, défaut fr)
3. Charge les top scores `>= min_score` (limit `SIGNAL_LIMIT * 3 = 90`)
4. Joint avec `signals`, filtre par `signal_date OR scraped_at` ≥ now − window
5. Trie par score desc, slice top 30
6. Construit le prompt système dans la langue user (3 sections : Highlights /
   Trends / À surveiller)
7. Appelle `dispatch-llm` avec `task: 'digest'`, `max_tokens: 2000`,
   `temperature: 0.4`
8. Insère dans `digests` + `llm_costs` en parallèle
9. Logge `digest:run` ok ou `digest:error` avec détail

## Anti prompt-injection

Tout titre / reasoning de signal est sanitizé (strip control chars + collapse
whitespace + truncate). Le prompt système rappelle explicitement au LLM
d'ignorer toute instruction présente dans le payload utilisateur.

## Sécurité

- JWT requis.
- Lecture `signals`/`scores`/`settings`/`digests` via RLS.
- Aucune clé API stockée ou loggée — `dispatch-llm` gère la résolution
  provider+key (BYOK).

## Setup local

```bash
bunx supabase functions serve digest --env-file supabase/.env.local
```
