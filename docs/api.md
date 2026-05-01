# API & Edge Functions

7 edge functions Deno hébergées sur Supabase. Toutes nécessitent un JWT user dans `Authorization: Bearer <token>`. RLS s'applique automatiquement (le JWT identifie le user, les queries sont filtrées par `user_id = auth.uid()`).

URL de base : `https://<project-ref>.supabase.co/functions/v1/`

## `run-pipeline`

Orchestre le pipeline complet : scrape parallèle des 3 sources + scoring batch des signaux non scorés.

- **Body** : `{}` (rien, lit la config depuis `settings`)
- **Réponse** : `{ scrape: [...], scored: number, batches: number, batches_ok: number, batches_failed: number, rate_limited: number, total: number, batch_size: number, batch_concurrency: number, duration_ms: number }`
- **Logs** : `pipeline:run` (start, ok, degraded, error)

## `scraper-x`

Scrape via Apify `apidojo/twitter-list-scraper`.

- **Body** : `{ listIds?: string[] }` (fallback `settings.apify_config.x_list_ids`)
- **Réponse** : `{ fetched: number, inserted: number, errors: [...] }`
- **Logs** : `scrape:x`

Lit la clé Apify depuis `user_api_keys` (provider='apify') ; fallback env `APIFY_TOKEN`.

## `scraper-reddit`

Scrape via Apify `automation-lab/reddit-scraper`. Chunké en batches de 6 subs max (timeout 90s/chunk) pour éviter les timeouts Apify.

- **Body** : `{ subs?: string[] }` (fallback `settings.reddit_subs`)
- **Réponse** : `{ fetched, inserted, errors }`
- **Logs** : `scrape:reddit`

## `scraper-arxiv`

Appelle l'API Atom XML officielle ArXiv. Rate limit 1 req / 3s entre catégories.

- **Body** : `{ categories: string[] }` (obligatoire)
- **Réponse** : `{ fetched, inserted, errors }`
- **Logs** : `scrape:arxiv`

## `llm-score-batch`

Score 1 à 30 signaux en 1 seul appel OpenRouter. Le prompt regroupe les N signaux et demande un JSON array de `{id, score, reasoning}`.

- **Body** : `{ signal_ids: string[] }` (max 30 par appel)
- **Réponse** : `{ batch_size: number, scored: number, cost: number }`
- **Logs** : `llm:score-batch`

Lit la clé OpenRouter depuis `user_api_keys` (provider='openrouter') ; fallback env `OPENROUTER_API_KEY`. Utilise `settings.active_rubric_id` pour résoudre la grille de scoring (prompt + critères pondérés).

## `digest`

Génère une synthèse 80/20 cross-sources des top 50 signaux scorés sur 1/7/30 jours, dans la langue de l'user.

- **Body** : `{ period_days?: 1 | 7 | 30 }` (default 7)
- **Réponse** : `{ digest: { id, content, ... }, signals_count: number, cost: number }`
- **Logs** : `llm:digest`

Format de sortie en Markdown structuré : `## Top 5 percées techniques`, `## Outils à essayer`, `## Tendances`, `## À garder à l'œil`. Cite les sources `[Reddit] [ArXiv] [X]` avec liens.

## `purge`

Supprime les données de l'user. Toujours protégé par RLS.

- **Body** : `{ confirm: true, scope?: 'signals' | 'all' }`
  - `scope='signals'` (défaut) : supprime `signals` (cascade `scores`)
  - `scope='all'` : ajoute `logs`, `llm_costs`, `digests`
- **Réponse** : `{ scope, counts: { signals, logs?, llm_costs?, digests? } }`
- **Logs** : `purge`

Les paramètres et clés API sont **toujours conservés**.

## Format d'erreur standard

Toutes les fonctions retournent `{ error: "code_machine", detail?: "human message" }` avec le statut HTTP approprié :

- `400` : input invalide
- `401` : JWT manquant ou invalide
- `404` : ressource introuvable (settings, signal)
- `500` : erreur serveur (DB write fail, secret manquant)
- `502` : provider externe down (OpenRouter, Apify)

## Helper interne `_shared/api-keys.ts`

```ts
export async function getUserApiKey(supabase, userId, provider): Promise<string | null>
```

Lit la clé chiffrée de `user_api_keys`, fallback sur env. Utilisé par `scraper-x`, `scraper-reddit`, `llm-score-batch`, `digest`. Le scraper-arxiv n'a pas besoin de clé.
