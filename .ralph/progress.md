# Progress Log — zlatan-scrap

## Codebase Patterns (à respecter par tous les agents)

### Frontend (React + Vite + TypeScript)

- Path alias : `@/` → `src/`
- Forms : `react-hook-form` + `zodResolver` + `@hookform/resolvers/zod`
- Data : `@tanstack/react-query` (hooks `useX`, `useUpsertX`, `useDeleteX`)
- UI : shadcn/ui (`Card`, `Tabs`, `Select`, `Button`, `Input`, `Label`)
- Auth : `useAuthStore` (Zustand) + Supabase Auth
- Toasts : `sonner`
- Tests : `vitest` + `@testing-library/react` + jsdom env
- Strict TS : pas de `any` non justifié, pas de `!` non-null assertion
- Cast through `unknown` quand mismatch type Supabase Generated → app types

### Backend (Supabase Edge Functions Deno)

- Imports : `jsr:@supabase/supabase-js@2`, `npm:openai@4`
- Pattern auth : header `Authorization` → `supabase.auth.getUser()` → 401 si pas user
- CORS prefix systématique
- Helpers `_shared/` partagés (api-keys, retry, errors, providers, welford, minio)
- Logging : `supabase.from('logs').insert(...)` avec `action`, `status`, `payload`
- Réponse uniforme : `function json(body, status)` à la fin

### Database (Postgres + RLS Supabase)

- RLS partout, policies `own_<table>_<op>`
- Migrations : `supabase/migrations/YYYYMMDDHHMMSS_description.sql`, une intention par fichier
- Tables critiques : `signals`, `scores`, `topics`, `topic_runs`, `topic_signals`, `pending_minio_writes`, `provider_models`, `user_api_keys`, `settings`, `scoring_rubrics`

### BYOK pattern (post-S-A refactor)

- Tasks : `scoring`, `scraping`, `monitoring`, `digest`
- `settings.model_config[task]` = `{ provider, model } | null`
- Fallback chain : `model_config[task]` → legacy `settings.model_<task>` (à dropper) → `'openrouter/auto'`
- Provider config via `getProviderConfig(providerId)` retourne `baseURL`, `extraHeaders`, etc.

### Validation (avant marquer story passes=true)

- `npm run typecheck` → 0 erreur
- `npx vitest run` → 100% pass (sauf tests désactivés explicitement)
- `npm run lint` → 0 erreur, 0 warning (max-warnings 0)
- `npm run build` → succès

## Run History

### 2026-05-01T16:30:00Z — PRD bootstrap

- Detected existing project, no `.ralph/` → CAS C (CLAUDE.md ÉTAPE 0)
- Reverse-engineered 9 stories from current state (4 already done implicitly via earlier conversation, 9 remaining)
- Wave 1 (independent) : S-A, S-B, S-Lint, S-Husky, S-Split, S-CI
- Wave 2 (dependent on S-A) : S-Digest, S-DropLegacy, S-DeadCode

### 2026-05-01T16:35:00Z — Wave 1 dispatch

- 6 agents lancés en parallèle (S-A, S-B, S-Lint, S-Husky, S-Split, S-CI)
- Chacun avec scope strict (`files_scope`) pour éviter conflits cross-agent

### 2026-05-01T17:00:00Z — Wave 4 ouverte (PRD admin durcissement)

- 2 stories : S-AdminTests (tests Deno template engine) + S-AdminCompose (cascade {{run:<kind>}})
- Dépendance : S-AdminCompose ⇨ S-AdminTests (mais scopes de fichiers disjoints, dispatch parallèle possible)

### 2026-05-01T17:30:00Z — S-AdminTests ✓ (`4d763ce`)

- Agent général-purpose, background, sans worktree (scope unique : `template.test.ts`)
- 24 `Deno.test` en français accents inclus, helpers `makeContext` + `makeSignal` factorisés
- Couvre les 7 variables substituables, edge cases (signal sans titre, troncature 30k, ordre run:<kind> vs autres, idempotence, non-mutation), regex de `extractComposedRunKinds` (dédup, `:`/`-`/`_`, refus majuscules)
- Validation : `deno test --allow-env --node-modules-dir=auto template.test.ts` → 24/24 ok (35 ms)
- Aucun bug détecté dans `template.ts`
- **Pattern à reproduire pour futures edge fns** : tests Deno isolés dans `<func>/<module>.test.ts` à côté du module testé, imports `jsr:@std/assert@1`, exec via `--node-modules-dir=auto`. Side-effect : crée `node_modules/.deno/` (cache Deno). Nettoyer après pour éviter conflit `@types/react` lors d'un `tsc -b` ; `bun install` restaure ensuite.

### 2026-05-01T17:35:00Z — S-AdminCompose ✓ (`56d45f8`)

- Agent général-purpose, background, sans worktree (scope : `index.ts` + `compose.ts` + `useAdminPrompts.ts` + `AdminPromptsConfig.tsx`)
- Architecture cascade : `executePromptOnce(prompt, depth, visited)` réutilisable récursivement, `resolveComposedRuns` extrait dans `compose.ts` (injection de dépendance pour éviter cycle d'import)
- Body étendu : `compose_chain: false` (default), `max_age_hours: 6`, `max_depth: 3` (hard 5)
- Sources d'une chaîne : `cached` (run récent < max_age_hours) / `cascade` (exécuté à la volée) / `missing` (pas de prompt parent) / `cycle` / `depth_limit`
- Persistance : chaque cascade insère normalement `admin_prompt_runs` + `llm_costs` (visible dans History UI)
- `override_filter` non transmis aux cascades (chaque prompt cascadé garde son `source_filter` natif — sinon mutation sémantique des dépendances)
- UI : `RunComposeOptionsDialog` avant exécution si template référence `{{run:<kind>}}`, `ComposedChainSummary` avec badges après run
- Cost Guard préservé prioritaire (déclenché AVANT le compose dialog)
- Validation : typecheck 0 err · lint 0 new warning · vitest 44/44 (✨ `bun install` réparé les 19 jest-dom matchers cassés cette session) · deno test 24/24 · build 1.72 s
- **Pattern cascade réutilisable** : pour ajouter d'autres types de prompts dépendants, étendre `compose.ts:resolveComposedRuns` plutôt que dupliquer la logique dans `index.ts`
- **Piège résolu** : `node_modules/.deno/` créé par `deno test` casse temporairement `tsc -b` (conflit `@types/react`). Workaround durant validation : `bun install` réintègre proprement
