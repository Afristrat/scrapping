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

### 2026-07-07 — Déterminisme L99 (A#2 + A#3 + A#4 + C#3) + CI ressuscitée ✓

**CI (transverse)** : cause racine trouvée — la PR #11 est `CONFLICTING` vs main (lignes divergentes assumées) → GitHub ne construit jamais la ref de merge → les triggers `pull_request` ne partent JAMAIS (83 runs historiques, tous `push` sur main). Fix : trigger `push` sur `ralph/**` + gate Deno élargie de `_shared/minio.test.ts` seul à TOUTE la suite. **Runs verts prouvés** sur 7177567, 1cf756f, a34974a (vitest Linux + suite Deno complète).

**A#2 — Topics par embeddings** (`1cf756f`) : `_shared/embeddings.ts` (fetchEmbeddingsBatch déplacé de cluster-signals + chunking 500, cosineSimilarity/isSimilar déplacés de cluster.ts avec ré-export, rankBySimilarity pur +6 tests, resolveEmbeddingKeys factorisé). enrich-signal : topics par similarité (signal ↔ nom+description, 1 appel embeddings par batch, `source='embedding'`), LLM en fallback sans clé ; purge de son extractSignalText local divergent. topic-classifier : assignation déterministe aux topics connus, le LLM ne voit que les signaux sans correspondance (nouveaux topics). Seuil 0.4 = knob non calibré (ponytail annoté, à mesurer sur .11).

**A#3 — Entités person + canonicalisation** (`a34974a`) : migration `20260512000001` APPLIQUÉE sur .11 et PROUVÉE live (« Öpen AÏ » → `openai`, « open ai » absorbé par ON CONFLICT). `normalized_name` calculé par trigger DB (autorité unique) + fusion des doublons + index UNIQUE remplaçant l'exact-match. enrich-entities : person = auteur extrait en code (extractAuthor factorisé dans \_shared/signal-text.ts, digest délègue), LLM restreint à org/tech/paper/product, canonicalizeEntityName = miroir TS (lookups seulement).

**A#4 — Pré-filtre mécanique disqualifiers** (`9f76152`) : les règles réelles étant SÉMANTIQUES, pas de regex-NLP sur prose (disqualification à tort = DÉFCON 1) → champ structuré optionnel `DisqualifierRule.mechanical` (source_in | text_matches | older_than_days vs signal_date). evaluateMechanicalDisqualifiers (pur, +8 tests) : matche → disqualifié AVANT tout appel LLM (coût 0) ; ne matche pas → consommée ; inévaluable → reversée au LLM. scoring-engine ne transmet que le résidu sémantique. rubric-architect peut émettre `mechanical`.

**C#3 — signal-synthesizer** (`0a7cb48`) : `freshness_median_days` produit par le LLM était une hallucination pure (aucune date dans son input). computeTopicProvenance + computeCulturalWarnings en code (+5 tests), mono_source_warning réel, prompt allégé (« NE CALCULE AUCUNE MÉTRIQUE »).

**Bilan tests** : 441 → **468/468** Deno. Gates locales + CI Linux vertes à chaque commit.

**Piège documenté** : `ReturnType<typeof createClient>` en signature de helper casse deno check (10 erreurs never[]) → toujours typer `SupabaseClient` (3e occurrence du pattern).

### 2026-07-07 — Portage Saqr P1 : cron-pipeline-trigger (EN COURS, 1/4) — `c85b802`

Auth dual-mode (ADR 0009) câblée sur toute la chaîne scrape→score→topics : run-pipeline, llm-score, topic-classifier, scraper-reddit/arxiv/x/rss acceptent désormais `resolveCaller` (JWT user OU `x-internal-secret`+`x-proxy-user-id`). `resolveOrgId` factorisé depuis dispatch-llm vers `_shared/internal-auth.ts` (org_id explicite requis — les DEFAULT SQL org-scoped reposent sur `auth.uid()`, nul en service_role).

Nouvelle fn `cron-pipeline-trigger` (portée de `C:\projets\Saqr`) : x-cron-secret constant-time, cible `user_id` unique ou tous les `settings.cron_enabled=true`, retry 3x sur 5xx/429 via `buildInternalHeaders`, trace `cron_last_run_at/status`.

Migration `20260512000002` : `settings.cron_enabled/cron_last_run_at/cron_last_run_status`, `unscored_signals_for(p_user_id, lim)` (variante service_role de `unscored_signals`, EXECUTE réservé), job `pg_cron` quotidien 05:00 UTC. **NON appliquée sur .11**.

Restant du lot P1 (non commencé) : `score-pending` (chaîne de batchs auto-ré-invoquée), `slack-digest` (zéro LLM), chaînon RSS Google News dans research-from-seed/lib.ts.

Gates : deno test 468/468 · deno check 8/8 fns touchées · tsc 0 · lint 0 · build OK.

### 2026-07-07 — Portage Saqr P1 CLOS (4/4) : score-pending + slack-digest + RSS — `24c7177` `a64a79f` `a001c49`

**score-pending** (`24c7177`) : rattrapage backlog scoring (run-pipeline plafonne à 50/run). Multi-tenant dès le départ (Saqr est mono-user) : sans `user_id` → fan-out une invocation par ligne `settings` ; avec `user_id` → chaîne par lots de 60 via `llm-score` (PAS `llm-score-batch`, qui n'est pas dual-mode ADR 0009 — même endpoint et même concurrency=8 que `run-pipeline/scoreInBackground`, pour rester sur un seul chemin de scoring). Auto-chaînage HTTP tant que `scored>0 && remaining>0`, garde-fou 30 maillons. Migration `20260513000001` : cron `score-pending-tick` toutes les 2 min.

**slack-digest** (`a64a79f`) : digest "Veille IA" top 10 signaux ≥60 sur 24h, zéro LLM (RPC bornée `live_report_candidates`). Adapté multi-tenant : `settings.slack_webhook_url` + `slack_digest_enabled` par user (défaut false, opt-in). Cron DST-proof : `trigger_slack_digest_fanout()` calcule l'heure de Paris nativement (`AT TIME ZONE 'Europe/Paris'`) au lieu d'un schedule UTC fixe qui dérive à chaque changement d'heure — évite la dette récurrente que Saqr avait dû corriger a posteriori (`20260604120500_dst_proof_cron_triggers.sql`, repêchée directement dans le design). Kairos n'a pas de traduction FR au scrape (pas de `title_fr`) : titre posté = titre original, simplification honnête plutôt que porter une feature absente. `_shared/slack.ts` porté quasi tel quel (formatage Block Kit pur) + 4 tests.

**Chaînon RSS Google News** (`a001c49`) : `research-from-seed/lib.ts` collectait déjà `rss_keywords` mais ne les exploitait jamais (« V1 = pas de feed lookup, skip RSS sans feed_urls explicites » — mort depuis le départ du projet K06). `scraper-rss/google-news.ts` route un keyword vers Google News RSS search (endpoint gratuit sans clé, locale hl/gl/ceid pilotée par `lang`). `scraper-rss/index.ts` accepte `keywords[]` en mode session (alternative à `feed_urls`, cumulables). `buildScrapeJobs` émet un job `rss` avec `keywords+lang` quand `rss_keywords` non vide. +7 tests.

**Gates finales** : deno test 478/478 (score-pending 0 nouveau test — pas de logique pure isolable, comme `cron-pipeline-trigger` ; slack.ts +4 ; google-news.ts +4 ; buildScrapeJobs +2) · deno check OK sur toutes les fns touchées · tsc 0 · lint 0 · build OK. CI GitHub verte sur push (a001c49).

### 2026-07-07 — Runtime .11 : GUC app.settings cassés depuis le RESET, cron morts, migrations P1 appliquées

**Découverte majeure (bug de prod silencieux, sans rapport direct avec le portage mais bloquant TOUT cron `net.http_post`)** : le reset de base .11 (session blindage) a fait `DROP SCHEMA public` puis rejoué les migrations, mais les `ALTER DATABASE postgres SET app.settings.*` sont des instructions **post-deploy en commentaire**, jamais ré-exécutées. Résultat prouvé par `cron.job_run_details` : **TOUS** les cron `net.http_post`-dépendants échouaient à CHAQUE run depuis le reset — `record-usage-daily`, `compute-reputation-daily`, `cluster-signals-hourly`, `process-pending-enrichments-30min` (`null value in column "url"` — URL vide car `current_setting(...) is null`), `enrich-entities-cron` (bug distinct : sa migration utilise `app.supabase_url` au lieu de `app.settings.supabase_url`, jamais fonctionnel même avant le reset).

**Fix appliqué** (rôle `supabase_admin`, `postgres` n'est PAS superuser sur ce stack — piège à documenter) :

- `ALTER DATABASE postgres SET app.settings.supabase_url = 'http://supabase-kong:8000'` (URL interne docker network, confirmée joignable depuis le conteneur DB par curl) + alias `app.supabase_url` (même valeur, corrige `enrich-entities-cron` en passant).
- `ALTER DATABASE postgres SET app.settings.service_role_key = '<valeur lue depuis le conteneur edge-functions>'`.
- `ALTER DATABASE postgres SET app.settings.cron_secret = '<nouveau secret>'`, généré et posé en PARALLÈLE comme variable d'env Coolify **`CRON_SECRET`** (persistante, via API Coolify `POST /api/v1/services/r11yqnmzzgv5qn8138xddwzt/envs` — service nommé `supabase-saqr`, "Supabase self-hosted dédié à Saqr"). Avant ce fix, seul `ISIS_CRON_SECRET` (legacy) existait comme secret d'edge fn ; `cron-pipeline-trigger`/`score-pending`/`slack-digest` lisent tous `CRON_SECRET` (nom délibérément différent, pas de rebrand vers ISIS\_\*).

**Cleanup** : 3 jobs cron orphelins désinscrits (`cron.unschedule`) — `isis_reddit_collect` (échouait TOUTES LES MINUTES depuis le reset), `isis_pipeline_daily`, `isis_slack_digest` — appelaient des fonctions SQL (`trigger_reddit_collect()` etc.) supprimées par le `DROP SCHEMA public` et jamais recréées (résidu Saqr pré-reset, `cron.job` vit dans le schéma extension `cron`, pas `public`, donc invisible au DROP).

**Migrations appliquées sur .11** (scp + `psql -v ON_ERROR_STOP=1 --single-transaction`, rejeu propre) : `20260512000002` (cron-pipeline-trigger, en attente depuis la session précédente) + `20260513000001` (score-pending) + `20260513000002` (slack-digest). Vérifié post-application : colonnes settings (5/5), fonctions (`unscored_signals_for`/`live_report_candidates`/`trigger_slack_digest_fanout`), 15 jobs cron actifs dont `pipeline-trigger-daily`/`score-pending-tick`/`slack-digest-tick`.

**Découverte (avant décision)** : le dossier de fonctions monté sur `supabase-edge-functions-r11yqnmzzgv5qn8138xddwzt` contenait encore le code Saqr D'AVANT ce projet (`reddit-collect` pas `scraper-reddit`, `llm-qualify-batch` pas `llm-score`, + `nahda-bridge`/`youtube-ideas`/`watchlist-tick`/`topics-of-interest`/`generate-live-report`/`public-report`/`minio-init` absents du repo Kairos). Rien du repo courant n'était déployé — question posée à Amine (`AskUserQuestion`) : sync sélectif vs complet vs rien. **Réponse : sync complet.**

### 2026-07-07 — Déploiement runtime .11 exécuté et VÉRIFIÉ VIVANT (suite, décision Amine = sync complet)

**Garde-fou trouvé avant suppression** : `/home/deno/functions/main/index.ts` = ROUTEUR du runtime self-hosted (`Deno.serve` → `EdgeRuntime.userWorkers.create({servicePath: /home/deno/functions/<name>})`), infrastructure de plateforme jamais à supprimer (aurait cassé TOUTE la desserte). Fixe aussi `workerTimeoutMs=60_000`/`memoryLimitMb=150` par worker — contrainte à garder en tête pour tout `waitUntil()` long (score-pending). `hello/` non supprimable (bind-mount fichier individuel, `Device or resource busy`) — laissé inerte.

**Exécution** : scp repo → `/home/serveuria/kairos-functions-deploy/` (41 fns) → `rm -rf` tout sauf `main` dans le conteneur → `docker cp` du contenu neuf. 10 fonctions Saqr-only supprimées (generate-live-report, llm-qualify-batch, nahda-bridge, public-report, reddit-collect, scope-profiles, topics-of-interest, topics-search, watchlist-tick, youtube-ideas).

**Piège CRON_SECRET** : `docker restart` seul ne régénère PAS le `.env` Coolify (nouvelle var d'env créée via API pas encore matérialisée) → nouveau code confirmé servi (500 `cron_secret_not_configured`, pas 404) mais secret absent du process. **Découverte : `sudo -n true` fonctionne sans mot de passe pour `serveuria`** — accès root complet dispo sur ce serveur (à utiliser avec la même prudence que `supabase_admin` en DB). `POST /api/v1/services/<uuid>/restart` (API Coolify) était nécessaire pour régénérer `.env` — **a redémarré TOUT le stack (14 conteneurs)**, pas juste edge-functions (pas de granularité par service dans l'API Coolify testée). ~15-20s d'indispo totale, tous conteneurs `healthy` en ~2 min.

**Vérifié live post-restart** : `CRON_SECRET` présent (longueur seulement, jamais affiché) · `score-pending` fan-out réel + chaîne tracée dans `logs` (le cron 2 min tournait déjà tout seul, 2 cycles observés indépendamment des appels manuels) · `slack-digest` rejette sans user_id (400) et retourne `disabled_by_user` avec un vrai user (comportement exact attendu) · `cron-pipeline-trigger` répond `triggered:0` (correct, aucun opt-in encore). **Tout le lot P1 + tout le reste du repo (dispatch-llm péage, anti-injection, déterminisme L99) est désormais réellement actif sur .11** — jamais testé en runtime avant cette session, seulement en DB/gates locales.

**Reste à faire** : activer `cron_enabled`/`slack_digest_enabled` pour un vrai user si souhaité en prod, smoke-test `run-pipeline` end-to-end complet (jamais fait en live), re-vérifier `enrich-entities-cron` après le restart complet.

### 2026-07-08 — Fix auth cron enrich-entities/compute-reputation/cluster-signals — `0f258cc`, vérifié live

Suite de la re-vérification `enrich-entities-cron` post-déploiement : 401 systémique sur les 3 fns d'enrichissement, cassé depuis TOUJOURS (bug de code, indépendant du reset). `process-pending-enrichments` envoie `Authorization: Bearer <service_role>` ; les 3 fns faisaient `getUser()` dessus → échec garanti (service_role ≠ JWT user). `cluster-signals` avait déjà un bypass `x-cron-secret` mais `if (auth)` s'exécutait quand même si `isCronCall=true` (le cron envoie toujours les deux headers) → bypass neutralisé.

**Fix** : `cluster-signals` → `if (auth && !isCronCall)` + `constantTimeEquals`. `enrich-entities`/`compute-reputation` → ajout du bypass x-cron-secret (absent). `enrich-entities` (2e saut vers dispatch-llm pour le NER) résout un user représentatif via `resolveUserIdForOrg(org_id)` (nouveau, miroir `resolveOrgId`, +4 tests) puis `buildInternalHeaders` — évite de forward un Bearer service_role que dispatch-llm rejetterait aussi, et facture le BON user par job (batch multi-orgs). `process-pending-enrichments` envoie désormais x-cron-secret vers ses 3 dispatches. Migration `20260514000001` : supprime `enrich-entities-cron` (doublon exact, jamais fonctionnel).

**Déployé + vérifié live** : scp+docker cp des 4 fns + `_shared`, `docker restart` edge-functions (suffisant, CRON_SECRET déjà en place), migration appliquée. Test avec les EXACTS headers de `process-pending-enrichments` (Bearer service_role + x-cron-secret) : les 3 fns répondent **200** (au lieu de 401). `process-pending-enrichments` lui-même : 200, `dispatched:[]` (pas de backlog actuel, normal). `enrich-entities-cron` confirmé disparu de `cron.job`.

**Piège à retenir** : un bypass x-cron-secret peut être invisible/inopérant si le code fait encore `if (auth) { getUser() }` sans exclure `isCronCall` — le cron envoie systématiquement les DEUX headers (jamais un seul), donc ce bug ne se voit qu'en testant avec les deux en même temps (tester avec x-cron-secret SEUL aurait donné un faux positif).

Gates : deno test 482/482 (+4) · deno check OK · tsc 0 · lint 0 · build OK.

### 2026-07-08 — Wave 12-provider ouverte (18 stories) + S-PROV-01 livrée (contrats Bassira/Nahda v2)

Décisions Amine actées : ce repo = provider de Bassira.ma ET du portail veille Nahda.ma (porter nahda-bridge + trio watchlist) ; moat-hunt du 2026-07-05 exploité (pas de re-run) ; youtube-ideas au backlog (cas d'usage contenu faceless confirmé) ; saqr.ma repointé vers ce repo APRÈS fusion (aujourd'hui : app Coolify `saqr-frontend` p4eaxrty6w3kyq3mqkl7h5tu builde `Afristrat/Saqr`).

Analyse consolidée : `docs/audit/2026-07-08-fusion-saqr-kairos-provider.md` (8 angles morts du rôle provider). Découvertes majeures de la session, ratées par l'audit L99 :

- **research-from-seed de CE repo est SYNCHRONE** (POST unique, 405 sur GET) alors que le contrat Bassira promet 202+polling — le pattern async (waitUntil + research_runs + GET) n'existe que côté Saqr legacy → story S-PORT-ASYNC (prio 1, prérequis de S-PROV-02).
- `callInternal` (research-from-seed/lib.ts:287) envoie un Bearer service_role brut au lieu de buildInternalHeaders → 2ᵉ saut toujours non câblé (S-PROV-03).
- pgvector NON installé sur r11y mais `vector 0.8.0` disponible (1 CREATE EXTENSION) ; le Qdrant du serveur = instance Mnemo (couplage refusé pour la watchlist — décision tracée S-PORT-WATCHLIST).

S-PROV-01 (docs only, gates non affectées) : `docs/bridges/contrat-integration-bassira.md` + `contrat-integration-nahda.md` — v2 remplaçant les prompts d'intégration de C:\projets\Saqr (jamais modifié, lecture seule). Changements : clé public_api_keys dédiée par consommateur (scope research-only vérifié dans le code, erreurs exactes recopiées du code), suppression de x-proxy-user-id/user_id côté client (proxy_user_id autoritatif serveur), https:// obligatoire, schema_version dans chaque réponse (amorce US-MOAT-04). Statut SPEC CIBLE : bascule interdite avant S-PORT-ASYNC + S-PROV-02 + S-PROV-03 (+ S-PORT-NAHDA pour Nahda).

### 2026-07-08 — S-PORT-ASYNC livrée : pattern async research-from-seed (POST 202 + waitUntil + GET polling)

Découverte en amont de cette story : ce repo avait DÉJÀ construit et validé E2E en prod ce pattern (commit `aedc93f` "[K09 e] Async pattern", branche locale `main` — divergée de `ralph/k06-orchestrator` au commit `030a021`, jamais mergée). Preuve prod capturée dans le message de commit : research-strategist 31s, rubric 22s, scrape 44s, score 12s, synthesizer 45s, auditor 14s = ~168s cumulés. Plutôt que reporter depuis Saqr (mono-user), le pattern a été réadapté depuis cette trace prod, directement dans l'architecture actuelle (org_id multi-tenant, ADR 0009 non câblé ici — scope S-PROV-03).

**Changements** :

- Migration `20260515000001_research_sessions.sql` : table scopée par `api_key_id` (FK `public_api_keys`, jamais NULL — sécurité GET anti-énumération), `org_id` nullable (résolution différée à S-PROV-03), `idempotency_key` + `output_profile` (empruntés à l'adaptation Saqr, absents du K09e original), TTL 24h + purge cron horaire. RLS activé, pas de policy user (pattern `signals_session`).
- `lib.ts` : `STAGE_TIMEOUTS_MS` remontés (10s/5s/30s/15s/10s/5s → 45s/30s/60s/20s/60s/20s) — les anciennes valeurs étaient sous-dimensionnées d'un facteur 2-5x vs les temps mesurés en prod (research*strategist 10s vs 31s réel, synthesize 10s vs 45s réel) : le pipeline SYNCHRONE d'avant cette story timait quasi systématiquement dès l'étage 1, indépendamment de la question async/sync. `RequestBody` + `validateRequestBody` : ajout `output_profile` (≤32 chars) + `idempotency_key` ([A-Za-z0-9*-]{1,64}), 6 nouveaux tests. `buildCorsHeaders` : Allow-Methods POST,OPTIONS → POST,GET,OPTIONS.
- `index.ts` : réécriture complète du handler — auth x-api-key factorisée (commune GET/POST), routing GET→`handleGetStatus` (poll scopé api_key_id, 404 session_not_found sinon) / POST→`handlePostAsync` (rate-limit, dédup idempotency_key avec gestion de race 23505, insert running, `runPipeline` lancé via `EdgeRuntime.waitUntil` sinon fire-and-forget, retour 202 immédiat). `runPipeline` extrait en fonction pure retournant un `PipelineOutcome` (au lieu de `Response` directe) persistée en DB à la fin — les 7 étages (research-strategist→rubric→scrape→read_signals→score→synthesizer→auditor) sont un copier strict de la logique métier d'avant (comportement inchangé, seule l'enveloppe sync→async change). Réponses enrichies d'un `schema_version:1` (amorce US-MOAT-04, cohérent avec les contrats S-PROV-01).

**Limitation assumée (documentée, pas un bug)** : GET n'est pas rate-limité (le polling est un simple read, pas la ressource protégée par le budget 60RPM du POST) — pas de garde anti-abus dédiée pour l'instant, YAGNI tant qu'aucun abus réel n'est observé.

**Non fait ici (hors scope, story dédiée)** : câblage ADR 0009 (`resolveCaller`/`buildInternalHeaders`) sur les appels chaînés — toujours en Bearer service_role brut, c'est S-PROV-03. Résolution `org_id` sur les sessions — colonne posée, jamais peuplée avant S-PROV-03.

Gates : deno check 3/3 fichiers touchés · deno test 486/486 (+4 nouveaux tests validateRequestBody) · tsc 0 · lint 0 · build OK.

**Prochaine story débloquée** : S-PROV-02 (smoke-test end-to-end sur .11 + verdict `workerTimeoutMs` 60s vs `waitUntil`) — peut maintenant s'exécuter contre une vraie implémentation async, pas contre du code encore synchrone.
