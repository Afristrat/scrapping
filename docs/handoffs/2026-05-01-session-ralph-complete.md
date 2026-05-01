# Récap session Ralph — 2026-05-01

> Session de ~10 h en mode Ralph Loop : bootstrap + topic-tracking + BYOK + auth + refactor 2 vagues + admin prompts + Wave 4 ouverte.
> Précédent handoff : `2026-04-30-bug-fixes-and-verbose-logging.md`.

---

## 1. Vue d'ensemble du projet

Dashboard de **veille IA personnelle** : agrège des signaux X / Reddit / arXiv, score 0-100 par LLM via OpenRouter (BYOK), produit des briefs 80/20 multi-langues (FR/EN/ES) et expose un suivi de topics émergents sur fenêtre 90 jours (MinIO + z-score Welford).

**Stack** : Vite + React 19 + TS strict · Tailwind v4 + shadcn/ui · Supabase (Postgres + Auth + 9 Edge Functions Deno + pg_cron) · OpenRouter SDK · Apify · Vitest + RTL.

**Modèle** : fork-per-user — chaque utilisateur exécute son propre projet Supabase, BYOK pour OpenRouter / Apify / providers LLM.

---

## 2. Sessions antérieures (rappel)

| Période          | Réalisation                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Avant 2026-04-30 | MVP fonctionnel : pipeline `run-pipeline` orchestrant scrape parallèle (X / Reddit via Apify, arXiv via API) → scoring batch (`llm-score-batch`) → tables `signals` + `scores`. Auth magic link. Pages Dashboard, Digest, Costs, Logs, Settings, Login.                                                                                          |
| 2026-04-30       | Bug-fixes critiques : (a) X posts non insérés à cause d'unpaired UTF-16 surrogates → `safeIsoDate` + sanitize Unicode dans `_shared/unicode.ts` ; (b) scoring 401 sur clé OpenRouter révoquée stockée en DB ; (c) helper `formatError` partagé pour exposer `code/message/details/hint/stack` ; (d) bouton « Copier » par log dans la page Logs. |

---

## 3. Session courante (Ralph Loop, 2026-05-01)

### 3.1 Bootstrap + infra

- `git init` + push GitHub `Afristrat/scrapping` (2 branches)
- Setup Supabase **fresh** : nouveau projet ref `crplceoptyeslqyfcqvj`, migrations + types regen
- Setup déploiement **Coolify** : Dockerfile multi-stage (`node:20-alpine` build → `nginx:alpine` serve `dist` + SPA fallback) ; 3 commits de fix (tsconfig exclude tests, vite `chunkSizeWarningLimit`, dep manquante `react-is`)
- **Cloudflare Tunnel** `nahda-tunnel` via `config.yml` + DNS CNAME automatisé via `cloudflared` CLI sur le serveur user ; ingress `scrap.ai-mpower.com` → `localhost:80`
- MinIO bucket `zlatan-scrap-topics` sur `cloud-station.io`

### 3.2 Feature `topic-tracking-minio` (20 stories)

- 4 nouvelles tables avec RLS : `topics`, `topic_runs`, `topic_signals`, `pending_minio_writes`
- Z-score **Welford** (algorithme en ligne) pour détecter les topics émergents
- **MinIO 90 j rolling** : rotation des entrées > 90 jours dans `archived/`, queue `pending_minio_writes` pour eventual consistency
- UI : widget `/dashboard` + page `/topics` redesignée en 4 sections trend (Émergents / Déclin / Stables / Calibrage) + help dialog + actions suggérées + tooltips z-score

### 3.3 BYOK multi-providers (4 phases)

- 10 providers supportés : OpenRouter, Moonshot, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Ollama
- Schéma : `settings.model_config[task]` (jsonb) avec fallback `'openrouter/auto'`
- 4 tasks supportées : `scoring`, `scraping`, `monitoring`, `digest`
- Cascade modèles par tâche dans Settings UI
- Edge fn `refresh-models` + auto-refresh à la sauvegarde des providers

### 3.4 Auth multi-méthodes

- Magic link + password + Google OAuth + page `/signup`

### 3.5 Refactor Wave 1 (6 agents Ralph en parallèle)

| Story   | But                                                                     | Commit    |
| ------- | ----------------------------------------------------------------------- | --------- |
| S-A     | Edge fn `dispatch-llm` unique (kill duplication 3 LLM clients)          | `41fdb8c` |
| S-B     | Migration : table `llm_providers` (single source of truth, drop dup TS) | `4eaeb92` |
| S-Lint  | Fix 3 lint errors préexistants                                          | `67842e9` |
| S-Husky | Skip hook si pas de `.git`                                              | `9e312a8` |
| S-Split | Vite `manualChunks` (1,2 MB → 5 chunks max ~350 KB)                     | `ecff577` |
| S-CI    | Workflow GitHub Actions                                                 | `11111fe` |

### 3.6 Wave 1.5

- **S-CascadeFix** (`7a1c89f`) : la cascade modèles lit le form state via `watch()` au lieu de `settings` DB

### 3.7 Refactor Wave 2

| Story        | But                                                                                                       | Commit    |
| ------------ | --------------------------------------------------------------------------------------------------------- | --------- |
| S-DeadCode   | Purge constantes mortes (no-op après S-A)                                                                 | —         |
| S-DropLegacy | Drop des colonnes legacy `model_*`                                                                        | `e1099b1` |
| S-Digest     | Table `digests` + edge fn complète + UI markdown + slider min_score + select fenêtre + erreur actionnable | `082cf38` |

### 3.8 Feature Admin prompts (PRD US-001 à US-004)

- Tables `admin_prompts` + `admin_prompt_runs` avec RLS
- Trigger `seed_admin_prompts_on_user_creation` AFTER INSERT auth.users → seed 4 prompts auto
- 4 prompts seed : Reddit, arXiv, X, Synthesis
- Edge fn `run-admin-prompt` avec **template engine isolé** (`template.ts`) supportant 7 variables : `{{signals}}`, `{{signals_block}}`, `{{language}}`, `{{date}}`, `{{topics_emerging}}`, `{{rubric}}`, `{{run:<task_kind>}}`
- Onglet Settings → Admin avec list / edit / run / history
- Hooks : `useAdminPrompts`, `useAdminPromptRuns`, `useAdminPromptRunsCount`, `useUpsertAdminPrompt`, `useDeleteAdminPrompt`, `useRunAdminPrompt`
- History button avec compteur + Live Preview vars dans Edit modal
- **Cost Guard** : `BudgetGuardDialog` avant chaque run, log `admin_prompt_budget_override` si forçage

### 3.9 Bug-fixes critiques de session

- `settings_not_found` : backfill missing rows + `dispatch-llm` défensif (`maybeSingle`)
- Cascade modèles inactive : lecture du form `watch` au lieu de DB
- Terme **« Moat »** purgé partout : enum `task_kind`, badges, seeds, descriptions, variables `{{run:reddit}}`

### 3.10 Pricing dynamique

- Tableau « Tarifs par modèle » dans `/costs`
- Fallback : `usage.cost` retourné par l'API → DB pricing → 0
- Limite connue : Anthropic / OpenAI / Groq / Together / DeepSeek n'exposent pas le pricing dans `/models` ; cost tracking dépend de `usage.cost` (OpenRouter only le retourne)

---

## 4. État au 2026-05-01 17:00 UTC

| Métrique                    | Valeur                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branche                     | `feat/topic-tracking-minio` (~50 commits, ahead origin 0)                                                                                                                                   |
| Live                        | `https://scrap.ai-mpower.com` (HTTP 200)                                                                                                                                                    |
| Bundle                      | 5 chunks max ~350 KB                                                                                                                                                                        |
| Typecheck                   | 0 erreur                                                                                                                                                                                    |
| Build                       | OK                                                                                                                                                                                          |
| Lint                        | 1 warning préexistant `Settings.tsx:65` (react-hook-form `watch`)                                                                                                                           |
| Tests Vitest                | 14 / 33 pass + 19 préexistants cassés (jest-dom matchers infra : `toBeInTheDocument` non chargé — incompatibilité `vitest@4.1.5` ↔ `@testing-library/jest-dom@6.9.1`)                       |
| Migrations                  | 17 appliquées                                                                                                                                                                               |
| Edge functions déployées    | `run-pipeline`, `scraper-x`, `scraper-reddit`, `scraper-arxiv`, `llm-score`, `llm-score-batch`, `topic-classifier`, `dispatch-llm`, `refresh-models`, `digest`, `run-admin-prompt`, `purge` |
| Stories Ralph `passes=true` | 10 / 12 (Wave 1 + 1.5 + 2 toutes vertes)                                                                                                                                                    |

---

## 5. Wave 4 (en cours)

PRD ouvert dans `.ralph/prd.json` (`completed_at: null`, `wave_4_opened_at: 2026-05-01T17:00:00Z`).

| Story              | But                                                                                                                                                                                                                                                                                                                          | Validation                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **S-AdminTests**   | Tests Deno (`template.test.ts`) couvrant `renderTemplate` (7 variables, edge cases : aucun signal, signal sans titre, troncature > 30k chars, ordre de substitution `run:<kind>` avant les autres) + `extractComposedRunKinds` (single, multi, dedup, regex chars autorisés). Pattern `minio.test.ts` (`jsr:@std/assert@1`). | `deno test --allow-env --node-modules-dir=auto supabase/functions/run-admin-prompt/template.test.ts` + `npm run typecheck` + `npm run lint` |
| **S-AdminCompose** | Vraie cascade `{{run:<kind>}}` : si un prompt synthesis référence `{{run:reddit}}` et que le dernier run est trop ancien (default 6 h), exécuter le prompt reddit en cascade. **Opt-in** via `compose_chain: true`, profondeur max 3, détection cycle, log de la chaîne `composed_chain: [{ kind, source: 'cached'           | 'cascade', run_id, age_hours }]`. UI : checkbox + warning coût N×.                                                                          | `deno test` + `npm run typecheck` + `npm run lint` + `npm test` + `npm run build` |

Les 2 stories sont dispatchées en agents parallèles (scopes de fichiers disjoints) :

- S-AdminTests : `template.test.ts` (nouveau)
- S-AdminCompose : `index.ts` (modif) + `compose.ts` (nouveau) + `useAdminPrompts.ts` (modif) + `AdminPromptsConfig.tsx` (modif)

---

## 6. Alertes critiques en file (action user)

1. **Credentials leakés en chat** à rotater impérativement : DB password Supabase (`wt2giXPxCYEMVhit`), anon key Supabase, Coolify token (`mZV3t49u058ar3Gaq8POCHzjZ2LU7x3lJlRIPCXW5700c32d`), MinIO root user (`fadbf15390f9465e`) + password (`bff19156b48a422583215a2a7f03e056`)
2. Provider tunnel `scrap-frontend` créé inutilement dans Cloudflare au début de session — à supprimer dans dashboard CF Networks → Connectors
3. 19 tests Vitest cassés préexistants — story dédiée upgrade `jest-dom` ou downgrade `vitest`
4. Coolify webhook GitHub auto-deploy à configurer (élimine deploy manuel via API)
5. `pg_cron` daily `refresh-models` à mettre en place

---

## 7. Mémos techniques utiles

- Project ref Supabase live = `crplceoptyeslqyfcqvj` (créé fresh cette session, pas l'ancien `rratnmtiescwdvtnjbeq`)
- Pattern BYOK : `settings.model_config[task]` (jsonb) → fallback `DEFAULT_PROVIDER='openrouter'` + `DEFAULT_MODEL='openrouter/auto'` dans `dispatch-llm`
- 4 tasks BYOK : `scoring | scraping | monitoring | digest`
- 5 task_kind admin : `reddit | arxiv | x | synthesis | custom`
- Trigger `seed_admin_prompts_on_user_creation` se déclenche AFTER INSERT auth.users → seed les 4 prompts auto
- MinIO endpoint = `MINIO_SERVER_URL` (PAS le `BROWSER_REDIRECT_URL`)
- `cloudflared` tunnel config = `/home/serveurai/.cloudflared/config-nahda.yml` (PID variable, `kill -HUP` pour reload)
- Coolify build = Dockerfile multi-stage (`node:20-alpine` build → `nginx:alpine` serve `dist` + `nginx.conf` SPA fallback)
- `npm install --legacy-peer-deps` requis (React 19 peer deps strict) — `.npmrc` le force
- Husky `prepare` = `"husky || true"` (skip si `.git` absent dans container)
- Vite v8 + rolldown : `manualChunks` DOIT être une fonction (Rollup-style objet refusé)
- Test infra : Vitest exclude `supabase/functions/**` (Deno tests via `deno test --node-modules-dir=auto`)
- Repo GitHub : `Afristrat/scrapping`, branche prod future = `main`, dev courant = `feat/topic-tracking-minio`
- Domain : `ai-mpower.com` via Cloudflare, app sur `scrap.ai-mpower.com`
