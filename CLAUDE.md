# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Repo : dashboard de veille IA (X + Reddit + ArXiv) scoré par LLM via OpenRouter, configurable par utilisateur.

## Stack

- React 19 + Vite 8 + TypeScript strict
- Tailwind v4 + shadcn/ui (Radix UI primitives)
- Supabase : Postgres + Auth magic link + Edge Functions Deno + Storage + pg_cron
- OpenRouter (proxy multi-LLM)
- Apify : `apidojo/twitter-list-scraper` (X) + `automation-lab/reddit-scraper` (Reddit)
- ArXiv : API officielle directe (gratuite)
- TanStack Query · Zustand · react-hook-form + zod · Recharts

## Commandes

```bash
npm run dev            # Vite dev server, http://localhost:5173
npm run build          # tsc -b + vite build (CI gate — doit passer 0 erreurs)
npm run typecheck      # tsc -b --noEmit
npm run lint           # ESLint max-warnings 0
npm run format         # Prettier write
npm test               # Vitest run unique
npm run test:watch     # Vitest watch
npx vitest run src/pages/Dashboard.test.tsx   # Test d'un seul fichier
```

### Supabase CLI

```bash
npx supabase link --project-ref <ref>                                          # Lier au projet cloud
npx supabase db push                                                           # Appliquer les migrations sur le projet lié
npx supabase functions deploy                                                  # Déployer toutes les edge functions
npx supabase functions deploy <name>                                           # Déployer une seule fonction
npx supabase secrets set KEY=VALUE                                             # Setter un secret pour les edge functions
npx supabase gen types typescript --project-id <id> > src/types/database.ts   # Régénérer les types depuis le schéma DB
npx supabase functions logs <name>                                             # Tail des logs d'une fonction
```

Projet Supabase ref : `rratnmtiescwdvtnjbeq`. Repo GitHub : `meydeey/theresa-scrap`.

## Architecture du pipeline

```
[Run pipeline button / pg_cron]
        │
        ▼
run-pipeline (edge fn) ──phase 1 : scrape parallèle──┐
        │                                              │
   scraper-x   scraper-reddit   scraper-arxiv          │
   (Apify)      (Apify)        (API directe)           │
        │                                              │
        └─────────────────┬────────────────────────────┘
                          ▼
                   table signals
                          │
                          ▼
           llm-score × N — phase 3 : background via EdgeRuntime.waitUntil
           (concurrency 8, limit 50 par run)
           lit active_rubric + clé OpenRouter user
                          │
                          ▼
               tables scores + llm_costs
                          │
                          ▼
                   Dashboard React
```

Le scoring s'exécute en background (`EdgeRuntime.waitUntil`) : le bouton revient immédiatement (HTTP 202), les scores apparaissent progressivement dans le dashboard via refresh.

## Tables principales

- `signals(id, user_id, source, external_id, url, title, raw_payload jsonb, scraped_at)` UNIQUE(user_id, source, external_id)
- `scores(signal_id, user_id, score 0-100, reasoning, model_used, cost, scored_at)` PK(signal_id, user_id)
- `logs(id, user_id, action, payload jsonb, status, ts)` purgés < 24h via pg_cron
- `llm_costs(id, user_id, task, model, prompt_tokens, completion_tokens, cost, ts)`
- `settings(user_id PK, model_*, prompt_scoring, reddit_subs[], arxiv_categories[], x_queries[], branding jsonb, daily_budget_usd, source_priority jsonb, apify_config jsonb, active_rubric_id)`
- `user_api_keys(id, user_id, provider, encrypted_key, masked_key)` UNIQUE(user_id, provider)
- `scoring_rubrics(id, user_id, name, prompt, criteria jsonb, is_default)`

RPC : `unscored_signals(lim int)` — retourne les signaux sans score pour l'utilisateur courant.

## Architecture frontend

```
src/
  pages/          # Dashboard, Digest, Costs, Logs, Settings, Login
  components/
    auth/         # ProtectedRoute, AuthListener
    layout/       # AppLayout, Sidebar, BrandedHeader
    features/     # Composants métier (SignalTable, RubricsManager, etc.)
    ui/           # Primitives shadcn/ui
  hooks/          # useSignals, useSettings, useRunPipeline, useRealtimeSignals, etc.
  stores/         # auth.ts (Zustand) — session + user + signOut
  lib/
    supabase.ts         # Client Supabase typé (Database)
    source-meta.ts      # Métadonnées des sources de veille
    openrouter-models.ts
    schemas/            # Schémas zod partagés
  types/database.ts     # Généré — NE PAS éditer manuellement
```

Alias path : `@/` → `src/`.

## Edge Functions Deno

Toutes dans `supabase/functions/`. Schéma commun :
1. CORS preflight sur `OPTIONS`
2. Auth via `supabase.auth.getUser()` avec le header `Authorization` du caller
3. Lecture des clés API via `_shared/api-keys.ts` (user key → fallback env var)

Helpers partagés dans `_shared/` :
- `api-keys.ts` — résout la clé OpenRouter ou Apify (user DB → env fallback)
- `errors.ts` — `formatError` pour logs verbeux (`code`, `message`, `details`, `hint`, `stack`)
- `retry.ts` — `retryWithBackoff`
- `filter.ts`, `unicode.ts` — nettoyage des données Apify

## Conventions

- **RLS partout** : toute nouvelle table DOIT activer `ROW LEVEL SECURITY` dans la même migration et avoir une policy `own_*`.
- **Clés API user-side** : ne jamais hardcoder. Stockées dans `user_api_keys`, lues uniquement par les Edge Functions via `_shared/api-keys.ts`.
- **Migrations versionnées** : `supabase/migrations/YYYYMMDDHHMMSS_description.sql`. Une migration = une intention.
- **Pas de Next.js** : volontaire. Vite + SPA, edge logic dans Supabase Edge Functions Deno.

## Pièges connus

- `user_api_keys.encrypted_key` stocke la clé **en clair** malgré le nom du champ (legacy — ne pas changer sans migration).
- Après toute migration, régénérer `src/types/database.ts` via `npx supabase gen types typescript ...`.
- Le repo local peut être désynchronisé du déployé : toujours déployer ET mettre à jour le local simultanément.
- `propager formatError` reste à faire dans `scraper-reddit` et `scraper-arxiv`.
- Sandbox Claude Code bloque `npm run dev` (EPERM listen) — utiliser `dangerouslyDisableSandbox` si nécessaire.

## Secrets

Set via `npx supabase secrets set` (fallbacks si user n'a pas configuré sa clé via UI) :

- `OPENROUTER_API_KEY`
- `APIFY_TOKEN`

`SUPABASE_URL` et `SUPABASE_ANON_KEY` sont auto-injectés par Supabase.

## Sources de veille

Référence complète : `specs/SOURCES.md` (192 handles X + 35 subreddits + 8 catégories ArXiv).

## Docs

Index complet : `docs/README.md`. Architecture détaillée : `docs/architecture.md`. Dernier handoff : `HANDOFF.md`.
