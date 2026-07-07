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

### 2026-05-02T00:50:00Z — Wave 5 fermée (5 stories ✓)

PRD ouverte 2026-05-01T18:00 par brief utilisateur ambitieux : delete inline/bulk Dashboard + fix bug score=0 + restructuration routing pour landing publique + skill moat-hunter + analyse business avocat du diable.

**Pivot mid-wave** : utilisateur a contesté la grille pricing initiale (« Solo 19€ laisse de l'argent sur la table »). Stop de S-LandingContent v1, rédaction d'un addendum analyse conjointe (8 attributs × 4 niveaux × 6 segments = utility coefficients) avec 12 SKUs (6 segments × Maison/BYOK). Redispatch de S-LandingContent v2.

**Logique pricing v2 actée** : BYOK > Maison en prix (signal de marché, pas COG). Solo = funnel SEO uniquement (utility 280/800, LTV < CAC). MRR cible an 1 = 132 k€/mois.

**Stories** :

- S-MoatHunter (skill + analyse business) : `docs/strategy/2026-05-02-moats-and-value-capture.md` (~600 lignes, top 5 moats scorés, analyse conjointe v2)
- S-DashDelete : SignalTable (delete inline + checkbox + bulk + AlertDialog), useSignals hooks, primitives shadcn (checkbox + alert-dialog), 4 tests Vitest. Sticky bar `top-0 z-10`.
- S-ScoreZero : root cause = JSON.parse silent catch + Number()||0 + placeholder DB. Fix = parser bracket-aware coerceScore retourne null + log parse_fail + skip-write si missed. ScoreCell HoverCard avec reasoning/modèle/rubric/distance temporelle FR. Bouton ↻ inline + bulk + flash bg-emerald 1.5s. 28 tests Deno.
- S-Landing : `/` Home publique (MarketingLayout), `/dashboard` ProtectedRoute (sanitizeNext open-redirect protection). Logout → `/`. Login redirect via `?next=`.
- S-LandingContent v2 : 7 composants `landing/*` modulaires. PricingTable avec toggle Maison/BYOK + slider seats Pro 5-25 dégressif (-15% / -10%). 6 personas. FAQ <details>. 51 l. Home orchestrateur.

**Validation globale Wave 5** : Deno test 28/28 (parse-score) · Typecheck 0 err · Lint 0 new warning (Settings.tsx:65 préexistant) · Vitest 48/48 · Build 712 ms.

**Pattern réutilisable** : pour les bug fixes critiques avec UX riche (S-ScoreZero), découpler le moteur (parse-score.ts isolé + tests) de l'intégration (index.ts) — permet à l'agent backend et l'agent UX de bosser en parallèle. Lors de re-écritures concurrentes, vérifier post-merge que le câblage est effectif (`grep` du nouveau import dans le caller — c'était écrasé silencieusement ici).

**Piège résolu (Wave 5)** : 3 agents concurrents sur `SignalTable.tsx` ont fait du « patching collaboratif » mais l'un d'eux a écrasé les modifs `index.ts` de S-ScoreZero sans les re-merger. Vérification post-validation OBLIGATOIRE : grep du module nouveau dans son consommateur. Le câblage a dû être refait manuellement.

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

### 2026-05-03T19:38:00Z — S-10B.5 + S-10B.6 ✓ (commits à venir)

**Fichiers modifiés** :

- `supabase/migrations/20260504140000_digests_scope_params.sql` — ajout `scope_params JSONB` sur `digests`
- `supabase/functions/digest/index.ts` — scope params complets + stratégie score/freshness + contexte persona + angle custom
- `supabase/functions/digest/scope.test.ts` — 13 tests Deno unitaires (buildUserPrompt, stratégies, déduplication)
- `src/types/database.ts` — régénéré (scope_params: Json | null dans Row/Insert/Update)

**Architecture S-10B.5** : `RequestBody` étendu avec `topic_ids[]`, `persona_ids[]`, `sources[]`, `custom_angle`, `prioritize`. Fonction `buildSignalQuery(sinceTs)` pour requêtes filtrées réutilisables. Jointure `signal_topics`/`signal_personas` pour filtrage topic/persona. Persistance `scope_params` dans `digests`.

**Architecture S-10B.6** : Extension fenêtre auto 7j si `prioritize='score'` et résultats < 30. Déduplication par Set d'IDs. Stratégie `freshness` → tri `scraped_at DESC` strict sans extension. Toggle UI déjà présent dans `DigestScopePanel.tsx` (S-10B.4), `useDigest.ts` transmet déjà `prioritize`.

**Déploiement** : `supabase db push` OK (20260504130000 + 20260504140000) · `supabase functions deploy digest` OK.

**Validation** : typecheck 0 err · lint 0 warning · vitest 205/213 (8 échecs pré-existants identiques avant/après).

**Pattern réutilisable** : `buildSignalQuery(sinceTs)` en closure capture les filtres scope et `candidateIds` — permet réutilisation propre pour l'extension de fenêtre sans duplication du code de jointure.

### 2026-05-03T22:45:00Z — S-10C.4 ✓ — cluster-signals (embeddings cross-source)

**Fichiers créés** :

- `supabase/migrations/20260504153000_signal_clusters.sql` — tables `signal_clusters` + `signal_cluster_members`, RLS, index.
- `supabase/migrations/20260504154000_cron_cluster_signals.sql` — pg_cron horaire (toutes les heures, min 0).
- `supabase/functions/cluster-signals/cluster.ts` — fonctions pures `cosineSimilarity` + `isSimilar` (TypeScript pur, 0 dépendances).
- `supabase/functions/cluster-signals/cluster.test.ts` — 12 tests Deno (vecteurs identiques → 1.0, orthogonaux → 0.0, opposés → -1.0, nul → 0, vides → 0, dimensions différentes → 0, isSimilar strict > 0.80).
- `supabase/functions/cluster-signals/index.ts` — edge fn principale : batch 30, embedding text-embedding-3-small 256 dims via OpenAI/OpenRouter, cosine > 0.80 fenêtre 48h, skip graceful si pas de clé.

**Bug fixé en collatéral** : `20260504151000_cron_enrich_entities.sql` avait une erreur de syntaxe SQL (délimiteurs `$$` imbriqués). Corrigé en `$outer$...$outer$` + `$cron$...$cron$` pour éviter la collision.

**Architecture** : embeddings calculés côté Deno en mémoire (pas de pg_vector requis). Pré-calcul batch des centroids existants pour O(1) lookup. Cache en mémoire des nouveaux clusters créés pendant le run pour éviter doublons intra-batch.

**Validation** : tsc 0 err · lint 0 warning · vitest 209/216 (7 échecs pré-existants, -1 par rapport au baseline grâce aux nouveaux types générés).

**Déploiement** : `supabase db push` OK (4 migrations) · `supabase functions deploy cluster-signals` OK.

**Pattern réutilisable** : pour les fonctions pures critiques (calculs mathématiques, parseurs), les extraire dans un module `.ts` séparé et les couvrir avec Deno tests — garantit testabilité sans mock Supabase.

### 2026-07-07 — Péage argent unique dispatch-llm (ADR 0010) ✓

**Converge 4 findings** : consensus factice (L99 A#1), coûts non écrits (P1-010), budget jamais appliqué (P0-004), auth mono-mode (P0-005 partiel).

**Cause racine P1-010 prouvée live** : `llm_costs.task` était l'ENUM `llm_task(scraping|scoring|monitoring)` alors que les callers écrivaient 'digest', 'enrich:topic', 'admin_prompt:<kind>'… → violation d'enum silencieuse sur chaque insert → **0 ligne dans llm_costs** (vérifié sur db.saqr.ma avant fix).

**Fichiers** :

- `supabase/migrations/20260511000001_llm_costs_task_text.sql` — task ENUM→TEXT + CHECK 1-64, DROP TYPE llm_task, costs_by_day recréée (task TEXT + search_path épinglé). **Appliquée live sur .11 et prouvée** (insert 'enrich:topic' OK).
- `supabase/functions/_shared/budget-check.ts` (+10 tests) — repêché du repo Saqr de l'associé (fail-open, skip à spent >= budget).
- `supabase/functions/dispatch-llm/resolve.ts` (+16 tests) — résolution pure override > model_config > défaut, validation couple d'overrides tout-ou-rien, sanitizeCostTask.
- `supabase/functions/dispatch-llm/index.ts` — resolveCaller dual-mode (ADR 0009), overrides honorés (consensus redevient réel), budget guard → 402 AVANT l'appel, org_id résolu explicitement (NOT NULL en service_role), écriture llm_costs unique + cost_recorded en réponse.
- 12 callers nettoyés : 9 inserts llm_costs supprimés (llm-score-batch ×2, digest, llm-score, enrich-signal ×2, enrich-entities, run-admin-prompt, suggest-personas, quality-auditor) + labels cost_task partout (enrich:topic/persona/entities, admin_prompt:<kind>, suggest:personas, quality-auditor, backtest:rubric, research:strategist, rubric:architect, synthesis, topic:classify, scoring:gates).
- `src/types/database.ts` patché à la main (précédent Wave 6.1 — pas de gen types câblé sur .11) : task string, enum llm_task purgé.
- ADR : `docs/architecture/adrs/0010-peage-argent-unique-dispatch-llm.md`. README dispatch-llm réécrit.

**Préexistants corrigés en passant (règle n°3)** : providers.ts (2 erreurs TS génériques never[]), enrich-signal/enrich-entities (typage client `ReturnType<typeof createClient>` → `SupabaseClient`, pattern llm-score-batch), run-admin-prompt (detail null→undefined), scope.test.ts digest (fixture bogué : filtre >=60 ne laissait passer que 11 candidats sur les 25 requis).

**Validation** : deno check 14/14 fonctions touchées · deno test **415/415** (dont 26 nouveaux) · typecheck 0 err · lint 0 warning · build OK · vitest ciblé 56/56 (suite pleine non collectable localement — flake OneDrive documenté, CI Linux = gate).

**Piège documenté** : le runner vitest local collecte parfois 0 ou 1 fichier de test (timeouts pool OneDrive) — ne JAMAIS conclure d'un run local pathologique, cibler des fichiers explicites ou lire la CI.

### 2026-07-07 — Anti-injection + délimiteurs + factorisation \_shared (L99 point 2) ✓

**Converge C#2 (scoring batch nu) + C#4 (gates silencieuses) + factorisation des duplications** (OWASP LLM01).

**Nouveaux modules `_shared/`** :

- `llm-json.ts` (+16 tests) — parse tolérant consolidé : strip CoT (<thinking> & co), BOM/zero-width, contrôles, fences, extraction du 1er bloc {} OU [] équilibré, erreurs typées LlmJsonError. Remplace 7 copies divergentes.
- `signal-text.ts` (+11 tests) — extraction canonique du texte signal (ordre unique summary→selftext→text→description→abstract→body ; avant : 6 ordres différents selon la fonction), sanitizeForPrompt (contrôles + anti-breakout <<</>>>), renderSignalBlock délimité (un titre malveillant ne peut PAS fermer le bloc — testé).
- `llm-guards.ts` — DATA_GUARD_FR (anti-injection, référence les délimiteurs), JSON_STRICT_GUARD_FR (anti-CoT), FRENCH_ACCENTS_GUARD_FR.

**Câblage** :

- `llm-score-batch` (cœur argent) : prompt scindé system (consignes+gardes) / user (signaux délimités sanitizés), temperature 0 sur les 3 sites dispatch (consensus, fallback, standard).
- Gates rubric-override : les 4 builders retournent {system, user} avec gardes + bloc délimité ; parseGateResponse expose parse_ok (gate illisible ≠ « non disqualifié » silencieux) ; scoring-engine propage gate_parse_failed jusqu'au log `llm:score-rubric-override` (status warning + compteur).
- scoring-engine : temperature 0 (scoring + gates = tâches déterministes).
- Migrations parseurs : enrich.ts, ner.ts, suggest.ts, auditor.ts → parseLlmJson ; research-strategist/lib.ts et rubric-architect gardent leurs APIs mais délèguent (ré-exports/wrappers).

**Validation** : deno check 7/7 fonctions touchées · deno test **441/441** (dont 26 nouveaux modules + 415 existants intacts — les tests des parseurs migrés passent sans modification) · tsc 0 · lint 0 · build OK.

**Piège Windows documenté** : les séquences \xNN/\uNNNN dans le contenu écrit par l'outil Write peuvent arriver en octets RÉELS (NUL littéral dans le source). Pour les tests avec caractères de contrôle → `String.fromCharCode(...)`, jamais de littéraux échappés.
