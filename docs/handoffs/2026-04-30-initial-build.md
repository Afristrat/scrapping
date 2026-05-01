# Handoff - 2026-04-30 - Build initial theresa-scrap

## État du projet

- Repo créé : https://github.com/meydeey/theresa-scrap (privé)
- Projet Supabase : `rratnmtiescwdvtnjbeq`
- Frontend déployable : `npm run build` passe (CSS 44KB, JS 391KB / 114KB gzip)
- Backend déployé : 7 edge functions ACTIVE, 10 migrations appliquées
- Tests : 20/20 passing dans le clone (côté working dir : duplications dues au scan multi-dir, pas critique)

## Changements de cette session

**Phase 1 - Setup initial** :

- Fork de zlatan-scrap vers theresa-scrap (clone original avec stack Vite + React + Supabase + OpenRouter)
- Remplacement des scrapers RSSHub/JSON par Apify (`apidojo/twitter-list-scraper` + `automation-lab/reddit-scraper`)
- 7 migrations appliquées (init, RLS, pg_cron, costs_by_day, unscored_signals, modular_config, seed_sources)
- 5 edge functions déployées
- Push initial commit `18b28c9`

**Phase 2 - Fixes UI** :

- Settings refactor en 5 onglets, 4ème modèle (digest), langue selector
- Modal SignalModal restructuré (sections + JSON debug repliable)
- Sidebar avec icônes, "Brief" entry
- Fix CSS critique : ajout variables shadcn dans `index.css` (`--popover`, `--foreground`, `--border`, etc.) qui étaient absentes → tous les dropdowns transparents et boutons outline avec texte invisible
- Fix `color-scheme: light` forcé pour empêcher le browser dark mode auto

**Phase 3 - Performance** :

- Migration 9 : `score_concurrency` configurable (default 20)
- run-pipeline v2 : retry/backoff sur 429
- Documentation OpenRouter rate limits ($1 = 1 RPS, max 500)

**Phase 4 - Demandes user finales** :

- Migration 10 : `signal_date TIMESTAMPTZ` + backfill complet (0/108 X, 124/124 ArXiv, 376/376 Reddit)
- Migration 10 : `score_batch_size` (default 20)
- Edge function `llm-score-batch` (1 appel = 1-30 signaux scorés)
- Edge function `purge` (scope signals ou all)
- run-pipeline v3 : utilise batch scoring, score TOUS les unscored (cap 1000)
- Scrapers v2/v3 : extraient `signal_date` (createdAt pour Apify, published pour ArXiv)
- Frontend : `usePurge` + `PurgeButton` avec confirmation modal, `SignalRow.signal_date` affiché
- Rubric default enrichie : 6 critères pondérés (innovation 0.25, actionable 0.20, crédibilité 0.15, récence 0.15, profondeur 0.15, builder-fit 0.10)

**Phase 5 - Documentation** :

- `docs/` complet : README, overview, architecture, architecture-map, commands, api, database, auth, deployment, security, conventions
- 4 ADRs : Vite-no-Next, Supabase-edge-functions, OpenRouter-batch, Apify-vs-official
- AGENTS.md (universal AI agent context)
- HANDOFF.md racine + ce fichier détaillé

## Architecture rapide

Stack : React 19 SPA + Vite + Supabase Edge Functions Deno + OpenRouter + Apify.

10 fichiers critiques :

1. `src/routes.tsx` — routing
2. `src/pages/Dashboard.tsx` — page principale
3. `src/pages/Settings.tsx` — config 5 onglets
4. `src/lib/schemas/settings-schema.ts` — source de vérité Zod
5. `src/hooks/useSettings.ts` + `useUpdateSettings.ts` — DB sync settings
6. `supabase/functions/run-pipeline/index.ts` — orchestrateur
7. `supabase/functions/llm-score-batch/index.ts` — scoring batchifié
8. `supabase/functions/_shared/api-keys.ts` — helper clés user
9. `supabase/migrations/20260430000010_signal_date_and_batching.sql` — dernière migration
10. `index.css` — theme shadcn (variables CSS critiques)

## Prochaines étapes

**Court terme (V1.1)** :

- Régénérer `src/types/database.ts` via Supabase CLI après le grand fix de migration → enlever les `as unknown as` casts dans `useApiKeys`, `useRubrics`, `useUpdateSettings`, `useDigest`
- Ajouter un sélecteur de tri dans Dashboard (par signal_date vs scraped_at vs score)
- Persistance localStorage des filtres Dashboard

**Moyen terme (V1.5)** :

- Dédup intelligente : embedding cosine via pgvector OU fuzzy titre Levenshtein
- Pipeline programmé : `pg_cron` qui call `run-pipeline` toutes les 6h
- Notifications : Slack webhook quand top signal score >90 apparaît

**Long terme (V2)** :

- Migration `user_api_keys.encrypted_key` vers Supabase Vault (chiffrement at-rest)
- CI GitHub Actions : typecheck + test sur PR + auto-deploy fonctions sur merge
- Multi-tenant team workspace (1 propriétaire + N members partageant settings)
- Export digest en PDF / email récurrent

## Contexte perdu si non documenté

### Pourquoi le scraper Reddit chunke par 6

Apify `automation-lab/reddit-scraper` accepte N URLs en 1 seul `run-sync`, mais le timeout Apify côté `run-sync-get-dataset-items` est de ~60s. Avec 18 subs × 25 posts à scraper, le run dépasse 60s et plante avec `Signal timed out`. Solution : chunker par 6 subs (3 runs parallèles, $0.003 chacun). Coût supplémentaire négligeable, latence acceptable.

### Pourquoi `run-pipeline` lit `score_concurrency` mais utilise `batch_concurrency`

`score_concurrency` = nombre total d'appels OpenRouter parallèles voulus (param user, $1 = 1 RPS). Avec batching, 1 batch = 20 signaux = 1 appel. Donc `batch_concurrency = score_concurrency / batch_size`. Si user veut 20 RPS et batch=20, on lance 1 batch parallèle (= 20 signaux scorés simultanément en 1 appel). Si batch=1 (legacy), 20 batches parallèles = 20 RPS comme prévu.

### Pourquoi le PostToolUse hook reformatte les fichiers

Un hook Prettier est probablement actif sur les Write/Edit. Pas critique, mais explique pourquoi parfois `Edit` échoue avec "stale-file error" sur les sections récemment écrites. Solution : Read avant Edit si le hook a tourné.

### Pourquoi Vitest fail dans le working dir mais pass dans le clone

L'user a fait un `git clone` dans `/Users/meydeey/Downloads/THERESA_SCRAP/theresa-scrap/`. Vitest scanne récursivement et trouve les `*.test.tsx` dans les 2 paths (working + clone), avec parfois des versions désync. Lancer les tests UNIQUEMENT depuis le clone (`cd theresa-scrap && npm test`) pour avoir le bon résultat.

### Pourquoi les clés API ont été partagées en clair dans la conversation

L'user a collé ses clés OpenRouter + Apify pour permettre la config de bout en bout. **Note pour la prochaine session : ces clés doivent être considérées compromises** (elles sont dans les logs de cette conversation). Si l'user n'a pas rotaté, le faire en priorité. Voir les logs Supabase et OpenRouter pour vérifier l'absence d'usage anormal.

### Backfill `signal_date` Reddit a fail au premier essai

La migration 10 essayait de backfill `signal_date` via `to_timestamp((raw_payload->>'created_utc')::numeric)` mais l'acteur `automation-lab/reddit-scraper` utilise `createdAt` (camelCase ISO string), pas `created_utc`. Backfill manuel via UPDATE séparé après inspection du payload. Le scraper updated v3 utilise désormais `createdAt` directement.
