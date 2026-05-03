# PRD : Wave 9 — 5 features moat (cœur scoring)

> **⚠️ STATUT 2026-05-03 — PARTIELLEMENT FREEZÉ POST-PIVOT SECOND CERVEAU**
>
> Wave 9.1 (Multi-LLM consensus) et 9.2 (Backtest rubrics) **livrées et mergées sur main** — restent valides comme attributs d'enrichissement.
>
> Wave 9.3 (Negative propagation), 9.4 (Cross-source corroboration) et 9.5 (Author Reputation) **freezées**. Leur logique est réintégrée dans le PRD Wave 10 Second Cerveau (`docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md`) :
>
> - 9.3 → US-10C.4 (clustering avec embeddings) + signal_flags potentiel en Phase E
> - 9.4 → US-10C.4 (clustering pour cross-source corroboration via embeddings)
> - 9.5 → US-10C.3 (compute-reputation hebdomadaire, intégré au modèle entities)
>
> Le scoring n'est plus LE moat. Le moat est désormais : taxonomie tenant + graph 90 j+ + vues paramétrables + historique d'exploitation.
>
> ---

> **Date** : 2026-05-03
> **Source d'analyse** : `docs/strategy/2026-05-02-moats-and-value-capture.md` (skill `moat-hunter`)
> **Effort total estimé** : 26 user stories · 17-25 jours-agent (Sonnet 4.6 / Haiku 4.5)
> **Mode d'exécution** : ralph-loop spawn-agents (jamais Opus)

---

## Architecture en 3 couches (validée 2026-05-03)

Ce PRD couvre **Layer 1 (Wave 9)** + **Sprint 0 distribution table stakes** (parallèle, 1 jour). Wave 10 (digest credibility) et Wave 11 (distribution premium) suivront dans des PRD séparés.

```
┌─────────────────────────────────────────────────────────┐
│ LAYER 3 — DISTRIBUTION (Wave 11, à PRD'er plus tard)    │
│ PDF brandé · Speaker notes · Slack/Email auto + Webhook │
└─────────────────────────────────────────────────────────┘
                         ▲ consomme
┌─────────────────────────────────────────────────────────┐
│ LAYER 2 — BRIEF CREDIBILITY (Wave 10, à PRD'er)         │
│ Words of Estimative Probability · Citations · Diff      │
└─────────────────────────────────────────────────────────┘
                         ▲ consomme
┌─────────────────────────────────────────────────────────┐
│ LAYER 1 — SIGNAL QUALIFICATION (Wave 9 — CE PRD)        │
│ Multi-LLM consensus · Backtest · Negative propag        │
│ Cross-source corroboration · Author Reputation          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SPRINT 0 — DISTRIBUTION TABLE STAKES (parallèle, 1 j)   │
│ 6 boutons sur le footer digest : copier, mail, X,       │
│ LinkedIn, télécharger .md, PDF basique                  │
└─────────────────────────────────────────────────────────┘
```

**Pourquoi cet ordre** : sortir Layer 2 ou 3 sans Layer 1 = vendre une crédibilité qu'on n'a pas (« Quasi-certain » sans Multi-LLM consensus = arbitraire). Layer 1 a sa valeur en autonomie (Dashboard avec 4 badges). Sprint 0 = quick wins indépendants, sans dépendance scoring.

---

## 1. Introduction / Overview

Wave 9 implémente les 5 features moat issues de l'analyse `moat-hunter` 2026-05-02. Objectif : transformer le scoring Kairos d'un _commodity LLM call_ en un système avec **5 couches de moat data accumulée** (consensus multi-modèles, backtest history, propagation négative, corroboration cross-source, réputation auteur).

**Pourquoi maintenant** :

- Wave 6 multi-tenant + Wave 7 design = livrés et stables (verified 2026-05-02 via tour des routes)
- Sans ces moats, le scoring est imitable en 2 semaines par tout concurrent ayant accès à un LLM
- La data accumulée par ces 5 features est _non-réplicable à froid_ (90 j minimum à backfiller pour un nouveau venu)

---

## 2. Goals

- Implémenter **5 features moat** end-to-end (DB schema + edge fn + frontend UI + tests)
- Ajouter **0 dette technique** : typecheck 0 erreur, lint 0 warning, tests 100 % passent
- Préparer le **lock-in data** : à 90 j de prod, ces 5 features auront accumulé un asset propriétaire défensif
- Permettre l'**up-sell pricing** : features pré-requises pour les SKU 599-999 €/seat (VC / Brand / Avocats Pro+)

---

## 3. Quality Gates

Ces commandes doivent passer pour chaque user story (avant `passes: true`) :

```bash
bun x tsc -b --noEmit              # Type checking 0 erreur
bun x eslint . --max-warnings 0    # Lint 0 warning
bun x vitest run                   # Tests unitaires 100 %
```

Pour les stories DB (migrations) :

```bash
bunx supabase db push --include-all  # Migration appliquée en prod sans erreur
bunx supabase gen types typescript --project-id crplceoptyeslqyfcqvj > src/types/database.ts  # Types regen
```

Pour les stories UI :

- Smoke test via `mcp__claude-in-chrome__*` tools quand possible (rendre + interagir + vérifier)
- Sinon : test unitaire React Testing Library minimum

---

## 4. Contraintes ralph-loop

| Contrainte          | Valeur                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| **Max itérations**  | 25 sans intervention humaine (CLAUDE.md global)                                        |
| **Circuit breaker** | Même erreur 3× → stop + alerte utilisateur                                             |
| **Modèle agent**    | Sonnet 4.6 par défaut, Haiku 4.5 pour stories triviales (CSS, types). **JAMAIS Opus.** |
| **Isolation**       | Git worktree par US (`/c/temp/kairos-w9-<story-id>`)                                   |
| **Worktree base**   | Branchent sur `main` HEAD (`8de9ef0+`) au moment du spawn                              |
| **Merge strategy**  | Fast-forward sur `main` à chaque story `passes: true`, push + auto-deploy Coolify      |
| **Tenant test**     | Org `cbab1468-...` (founder Amine) en sandbox                                          |

---

## 5. Dependency graph

```
              ┌─────────────────────────┐
              │ Wave 9.1 Multi-LLM      │ ← indépendant, peut partir en parallèle
              │ consensus scoring       │
              └─────────────────────────┘

              ┌─────────────────────────┐
              │ Wave 9.2 Backtest       │ ← indépendant, peut partir en parallèle
              │ rubrics                 │
              └─────────────────────────┘

              ┌─────────────────────────┐
              │ Wave 9.3 Negative       │ ← bloquant pour 9.4 et 9.5
              │ signal propagation      │   (embeddings + signal_relations)
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │ Wave 9.4 Cross-source   │ ← réutilise embeddings de 9.3
              │ corroboration           │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │ Wave 9.5 Author         │ ← agrège signaux flagged (9.3)
              │ Reputation Layer        │   et corroborés (9.4)
              └─────────────────────────┘
```

**Suggestion ralph-loop** : 2 worktrees parallèles initialement (9.1 + 9.2 + 9.3), puis 9.4, puis 9.5 séquentiel.

---

## 6. User Stories (26 total)

### Wave 9.1 — Multi-LLM consensus scoring (5 stories)

#### US-9.1.1 — DB schema `score_runs` + RLS

**Description** : En tant que système de scoring, je veux persister chaque appel LLM individuellement (un row par modèle, par signal) pour permettre l'audit et le calcul de consensus a posteriori.

**Acceptance criteria** :

- [ ] Migration `YYYYMMDDHHMMSS_score_runs.sql` crée table `score_runs(id uuid PK, signal_id uuid FK, org_id uuid FK, user_id uuid FK, model text, provider text, score int 0-100, reasoning text, prompt_tokens int, completion_tokens int, cost numeric, ts timestamptz default now())`
- [ ] Index sur `(signal_id, org_id)` pour les agrégations
- [ ] RLS policy `org_score_runs_select`, `org_score_runs_insert` (user authentifié, member de l'org)
- [ ] Schema `scores` étendu : ajout colonnes `score_consensus numeric`, `score_variance numeric`, `models_used text[]` (nullable, calculé après consensus)
- [ ] Backfill : `score_runs` insert d'1 row par `scores` existant avec model = `model_used`, score = `score`, etc.
- [ ] `bunx supabase gen types` exécuté, `src/types/database.ts` à jour

**Files** : `supabase/migrations/20260503000001_score_runs.sql`, `src/types/database.ts`
**Dependencies** : aucune
**Agent model** : sonnet
**Priority** : 1

#### US-9.1.2 — Settings UI `consensus_models` picker

**Description** : En tant qu'admin org, je veux configurer quels 2-3 modèles utiliser pour le consensus scoring depuis Settings → Modèles.

**Acceptance criteria** :

- [ ] Schema `settings` étendu : colonne `consensus_models text[] default ARRAY[]::text[]`
- [ ] UI Settings → onglet « Modèles » : nouvelle section « Consensus scoring (BYOK avancé) » avec multi-select des modèles disponibles dans `provider_models`
- [ ] Validation : 2 ≤ longueur ≤ 3, modèles distincts
- [ ] Mention « Coût × N » visible quand sélection multi
- [ ] Hook `useUpdateConsensusModels` (mutation upsert)
- [ ] Tests : `Settings.test.tsx` couvre le multi-select + validation

**Files** : `supabase/migrations/20260503000002_settings_consensus_models.sql`, `src/pages/Settings.tsx`, `src/hooks/useUpdateConsensusModels.ts`, `src/pages/Settings.test.tsx`
**Dependencies** : US-9.1.1
**Agent model** : sonnet
**Priority** : 2

#### US-9.1.3 — Edge fn `llm-score-batch` extension N modèles

**Description** : En tant que pipeline de scoring, je veux appeler N modèles en parallèle (au lieu d'1 seul) et persister les résultats dans `score_runs`.

**Acceptance criteria** :

- [ ] Si `settings.consensus_models` est non-vide, lance N appels parallèles via `Promise.all` à `dispatch-llm`
- [ ] Insert N rows dans `score_runs` (1 par modèle)
- [ ] Calcul moyenne + variance + écart-type → update `scores.score_consensus`, `score_variance`, `models_used`
- [ ] Si 1 modèle échoue, continuer avec les N-1 autres (best-effort consensus)
- [ ] Logs verbeux dans `logs` table (action `llm:score-consensus`)
- [ ] Tests Deno : `deno test --allow-env --node-modules-dir=auto supabase/functions/llm-score-batch/index.test.ts`

**Files** : `supabase/functions/llm-score-batch/index.ts`, `supabase/functions/llm-score-batch/index.test.ts`
**Dependencies** : US-9.1.1, US-9.1.2
**Agent model** : sonnet
**Priority** : 3

#### US-9.1.4 — Hook `useScoreConsensus` + types

**Description** : En tant que frontend, je veux lire le score_consensus + variance pour les afficher.

**Acceptance criteria** :

- [ ] Hook `useScoreConsensus(signalId)` qui retourne `{ consensus, variance, models, agreement: 'high' | 'medium' | 'low' }`
- [ ] `agreement` calculé : variance < 10 = high, 10-25 = medium, > 25 = low
- [ ] React Query staleTime 5 min, queryKey `['score_consensus', orgId, signalId]`
- [ ] Type `ScoreConsensus` exporté depuis `src/types/scoring.ts`
- [ ] Tests : mock Supabase response, vérifier les 3 niveaux d'agreement

**Files** : `src/hooks/useScoreConsensus.ts`, `src/types/scoring.ts`, `src/hooks/useScoreConsensus.test.ts`
**Dependencies** : US-9.1.1
**Agent model** : haiku
**Priority** : 4

#### US-9.1.5 — Dashboard badge agreement

**Description** : En tant qu'utilisateur, je veux voir d'un coup d'œil quels signaux ont un consensus fort vs un sujet polarisant.

**Acceptance criteria** :

- [ ] Dans `SignalTable.tsx`, à côté du score, ajouter un badge consensus :
  - Vert « ✓ consensus » si agreement = high
  - Jaune « ~ consensus partiel » si medium
  - Rouge « ⚠ polarisant » si low
- [ ] Tooltip au hover : « N modèles : Haiku 75, Mistral 80, DeepSeek 50 (variance 12.5) »
- [ ] N'affiche le badge QUE si `score_consensus` est non-null (sinon hidden, pas de breaking change)
- [ ] Tests RTL : couvre les 3 cas + le cas null
- [ ] Smoke test browser : naviguer /dashboard, vérifier visuellement

**Files** : `src/components/features/SignalTable.tsx`, `src/components/features/ConsensusBadge.tsx`, `src/components/features/SignalTable.test.tsx`
**Dependencies** : US-9.1.4
**Agent model** : sonnet
**Priority** : 5

---

### Wave 9.2 — Backtest des grilles de scoring (5 stories)

#### US-9.2.1 — Edge fn `backtest-rubric` (dry-run)

**Description** : En tant que system, je veux re-scorer les 30 derniers jours de signaux avec une nouvelle rubric SANS persister, pour permettre le preview avant adoption.

**Acceptance criteria** :

- [ ] Edge fn POST `/functions/v1/backtest-rubric` avec body `{ rubric_id?: uuid, rubric_prompt: string, criteria: jsonb, max_signals?: int (default 100) }`
- [ ] Cap : 100 signaux max par run (paramètre)
- [ ] Cap : 1 backtest simultané par user (lock via `pg_advisory_lock` keyed sur user_id ; si lock held, retourne 409)
- [ ] Lit les signaux des 30 derniers jours scoped org (RLS)
- [ ] Appelle `dispatch-llm` pour chacun avec la nouvelle rubric, NE PERSISTE PAS dans `scores`
- [ ] Retourne array `{ signal_id, title, current_score, backtested_score, delta, reasoning_new }`
- [ ] Loggue dans `logs` (action `backtest:run`)
- [ ] Tests Deno

**Files** : `supabase/functions/backtest-rubric/index.ts`, `supabase/functions/backtest-rubric/index.test.ts`
**Dependencies** : aucune (parallèle à 9.1)
**Agent model** : sonnet
**Priority** : 1

#### US-9.2.2 — Hook `useBacktestRubric` + cost estimation

**Description** : En tant que frontend, je veux lancer un backtest et estimer le coût avant.

**Acceptance criteria** :

- [ ] Hook `useBacktestRubric` (mutation) qui POST l'edge fn
- [ ] Hook `useBacktestCostEstimate(rubric, modelChoice, signalCount)` qui calcule le coût attendu via `provider_models.pricing_*`
- [ ] Affiche cost estimate dans la modale avant le bouton « Lancer »
- [ ] Si cost > 5 € → confirmation explicite (modal dialog)
- [ ] Tests

**Files** : `src/hooks/useBacktestRubric.ts`, `src/hooks/useBacktestCostEstimate.ts`, tests
**Dependencies** : US-9.2.1
**Agent model** : haiku
**Priority** : 2

#### US-9.2.3 — Page `/settings/rubrics/backtest`

**Description** : En tant qu'utilisateur, je veux une page dédiée pour itérer ma rubric.

**Acceptance criteria** :

- [ ] Route `/settings/rubrics/backtest`
- [ ] Form : éditeur prompt + critères JSON
- [ ] Bouton « Backtester » avec cost estimate visible
- [ ] Pendant le run : loader + liste des signaux qui passent en stream (Server-Sent Events ou polling)
- [ ] Lien « Adopter cette rubric » qui upsert dans `scoring_rubrics` quand le user est satisfait

**Files** : `src/pages/RubricBacktest.tsx`, ajout route dans `App.tsx`
**Dependencies** : US-9.2.2
**Agent model** : sonnet
**Priority** : 3

#### US-9.2.4 — Composant `BacktestComparator`

**Description** : En tant qu'utilisateur, je veux comparer la nouvelle rubric à l'actuelle.

**Acceptance criteria** :

- [ ] Composant `BacktestComparator` : tableau 2 colonnes (current_score / backtested_score) trié par |delta|
- [ ] Distribution des scores en histogramme (Recharts)
- [ ] Top 20 signaux promus (delta > 0) + top 20 rétrogradés (delta < 0)
- [ ] KPIs : moyenne de delta, signaux nouvellement > 70, signaux qui passent en dessous

**Files** : `src/components/features/BacktestComparator.tsx`, tests
**Dependencies** : US-9.2.3
**Agent model** : sonnet
**Priority** : 4

#### US-9.2.5 — Cap simultané + queueing UI

**Description** : En tant que système, je veux empêcher 2 backtests en parallèle pour un même user (limite ressources LLM).

**Acceptance criteria** :

- [ ] Si user lance un 2e backtest pendant que le 1er tourne → toast warning + bouton désactivé
- [ ] Status visible : « Backtest en cours… (estimated 2 min restantes) »
- [ ] Annuler en cours possible (cancel mutation)
- [ ] pg_advisory_lock libéré proprement même en cas d'erreur

**Files** : `src/hooks/useBacktestRubric.ts` (extension), tests
**Dependencies** : US-9.2.1, US-9.2.2
**Agent model** : haiku
**Priority** : 5

---

### Wave 9.3 — Negative signal propagation (6 stories)

#### US-9.3.1 — DB schema `signal_flags` + `signal_relations` + RLS

**Description** : En tant que système, je veux persister les flags utilisateur et les relations entre signaux.

**Acceptance criteria** :

- [ ] Migration crée tables :
  - `signal_flags(id uuid PK, signal_id uuid FK, user_id uuid FK, org_id uuid FK, reason text, ts timestamptz)`
  - `signal_relations(id uuid PK, parent_signal_id uuid FK, child_signal_id uuid FK, similarity_score numeric, detection_method text, detected_at timestamptz)`
- [ ] Indexes : `(parent_signal_id, detected_at)`, `(child_signal_id)`
- [ ] RLS policies org-scoped (insert via authenticated user, select tous membres org)
- [ ] Constraint UNIQUE `(parent_signal_id, child_signal_id)`
- [ ] Types regen

**Files** : `supabase/migrations/20260503000003_signal_flags_relations.sql`, types
**Dependencies** : aucune
**Agent model** : sonnet
**Priority** : 1

#### US-9.3.2 — Edge fn `flag-signal`

**Description** : En tant qu'utilisateur, je veux flagger un signal comme faux/débunké.

**Acceptance criteria** :

- [ ] Edge fn POST `/flag-signal` body `{ signal_id, reason }`
- [ ] Insert dans `signal_flags` + audit log entry (`audit_log.action = 'signal.flag'`)
- [ ] Réponse `{ ok: true, flag_id }`
- [ ] Tests Deno

**Files** : `supabase/functions/flag-signal/index.ts`, tests
**Dependencies** : US-9.3.1
**Agent model** : haiku
**Priority** : 2

#### US-9.3.3 — Edge fn `compute-embeddings` (signal title → vector)

**Description** : En tant que système, je veux calculer des embeddings sur les titres pour détecter les signaux similaires.

**Acceptance criteria** :

- [ ] Edge fn `/compute-embeddings` qui prend `{ signal_ids: uuid[] }` et appelle OpenAI `text-embedding-3-small`
- [ ] Stocke dans nouvelle table `signal_embeddings(signal_id PK, embedding vector(1536), computed_at)` (require pg_vector extension)
- [ ] Migration ajoute `CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] Idempotent : skip si embedding existe déjà
- [ ] Cost tracking : log token count → llm_costs avec `task: 'embeddings'`
- [ ] Fallback : si OpenAI key manquante, use Voyage AI ou retour error

**Files** : `supabase/migrations/20260503000004_signal_embeddings.sql`, `supabase/functions/compute-embeddings/index.ts`, tests
**Dependencies** : US-9.3.1
**Agent model** : sonnet
**Priority** : 3

#### US-9.3.4 — pg_cron job `propagate-flags`

**Description** : En tant que système, je veux propager les flags aux signaux similaires.

**Acceptance criteria** :

- [ ] Edge fn `/propagate-flags` qui :
  1. Trouve tous les `signal_flags` ts < 14 jours
  2. Pour chaque flag, trouve les signaux dans la même fenêtre temporelle 14j avec :
     - URL identique OU
     - similarité embedding > 0.85 (cosine sim)
  3. Insert relations dans `signal_relations`
- [ ] pg_cron schedule : daily 4am UTC (`SELECT cron.schedule('propagate-flags', '0 4 * * *', '...')`)
- [ ] Logs

**Files** : `supabase/functions/propagate-flags/index.ts`, migration `20260503000005_propagate_flags_cron.sql`
**Dependencies** : US-9.3.1, US-9.3.3
**Agent model** : sonnet
**Priority** : 4

#### US-9.3.5 — Frontend bouton thumbs-down + dialog

**Description** : En tant qu'utilisateur, je veux flagger un signal en 1 click.

**Acceptance criteria** :

- [ ] Bouton « 👎 Contester » sur chaque signal du `SignalTable`
- [ ] Dialog avec 4 raisons radio (faux / débunké / hype / erreur) + textarea optionnelle
- [ ] Hook `useFlagSignal` mutation
- [ ] Toast confirm « Signal flaggé. Propagation aux signaux similaires en cours. »
- [ ] Tests

**Files** : `src/components/features/SignalTable.tsx`, `src/components/features/FlagDialog.tsx`, `src/hooks/useFlagSignal.ts`, tests
**Dependencies** : US-9.3.2
**Agent model** : sonnet
**Priority** : 5

#### US-9.3.6 — Dashboard badge `contested` + score minoré

**Description** : En tant qu'utilisateur, je veux voir visuellement les signaux contestés.

**Acceptance criteria** :

- [ ] Hook `useContestedSignals` qui retourne le set de `signal_id` ayant un flag direct OU une relation parent flaggé
- [ ] Badge orange `⚠ contesté` sur le signal
- [ ] Score effectif minoré : `score_displayed = score - settings.contested_penalty (default 30)` , affichage strikethrough du score original
- [ ] Setting `contested_penalty int default 30` dans `settings`
- [ ] Filter UI : « Masquer les contestés »
- [ ] Tests

**Files** : `src/hooks/useContestedSignals.ts`, `src/components/features/SignalTable.tsx`, migration setting
**Dependencies** : US-9.3.4, US-9.3.5
**Agent model** : sonnet
**Priority** : 6

---

### Wave 9.4 — Cross-source corroboration (5 stories)

#### US-9.4.1 — DB schema `signal_clusters` + RLS

**Description** : En tant que système, je veux regrouper les signaux qui parlent du même sujet.

**Acceptance criteria** :

- [ ] Migration crée :
  - `signal_clusters(id uuid PK, org_id uuid FK, topic_label text, created_at)`
  - `signal_cluster_members(cluster_id uuid FK, signal_id uuid FK, source text, score int, detected_at)`
  - PK composite `(cluster_id, signal_id)`
- [ ] Indexes
- [ ] RLS org-scoped
- [ ] Types regen

**Files** : `supabase/migrations/20260503000006_signal_clusters.sql`
**Dependencies** : US-9.3.1 (extension pg_vector déjà créée par 9.3.3)
**Agent model** : sonnet
**Priority** : 1

#### US-9.4.2 — Edge fn `compute-corroboration`

**Description** : En tant que système, je veux clusteriser automatiquement les signaux ≥ 70 par similarité.

**Acceptance criteria** :

- [ ] Edge fn `/compute-corroboration` lance le clustering sur les signaux récents :
  1. Pour chaque signal score ≥ 70 sans cluster, fenêtre 24-48h
  2. Trouve signaux dans même fenêtre avec embedding cosine > 0.80 ET source différente
  3. Crée un cluster (ou ajoute au cluster existant le plus proche)
- [ ] Triggered par `llm-score-batch` après scoring
- [ ] Logs détaillés
- [ ] Tests

**Files** : `supabase/functions/compute-corroboration/index.ts`, `supabase/functions/llm-score-batch/index.ts` (modification trigger), tests
**Dependencies** : US-9.4.1, US-9.3.3 (embeddings)
**Agent model** : sonnet
**Priority** : 2

#### US-9.4.3 — RPC `find_corroborated_cluster` + types

**Description** : En tant que frontend, je veux requêter rapidement les clusters d'un signal.

**Acceptance criteria** :

- [ ] RPC SQL `find_corroborated_cluster(p_signal_id uuid)` retourne `(cluster_id, member_count, sources text[])`
- [ ] SECURITY INVOKER (RLS appliquées)
- [ ] Tests : couvre cluster solo (1 source) + cluster 3 sources

**Files** : migration RPC
**Dependencies** : US-9.4.1
**Agent model** : haiku
**Priority** : 3

#### US-9.4.4 — Hook `useSignalCorroboration` + score boost

**Description** : En tant que frontend, je veux lire le statut corroboration et appliquer le boost.

**Acceptance criteria** :

- [ ] Hook `useSignalCorroboration(signalId)` retourne `{ corroborated: boolean, sourceCount: int, sources: string[], scoreBoost: int }`
- [ ] `scoreBoost` = 10 si sourceCount ≥ 3 sources distinctes, 0 sinon
- [ ] React Query staleTime 5 min
- [ ] Score effectif affiché = score + scoreBoost (si applicable)
- [ ] Tests

**Files** : `src/hooks/useSignalCorroboration.ts`, tests
**Dependencies** : US-9.4.3
**Agent model** : haiku
**Priority** : 4

#### US-9.4.5 — Dashboard badges corroboration

**Description** : En tant qu'utilisateur, je veux voir « 3 sources confirment » ou « 1 source unique ».

**Acceptance criteria** :

- [ ] Badge vert `✓ 3 sources` (X + Reddit + arXiv) sur le signal
- [ ] Badge gris `1 source unique` quand pas corroboré
- [ ] Tooltip avec liste des autres signaux du cluster (titres + URLs)
- [ ] Smoke test browser

**Files** : `src/components/features/SignalTable.tsx`, `src/components/features/CorroborationBadge.tsx`
**Dependencies** : US-9.4.4
**Agent model** : sonnet
**Priority** : 5

---

### Wave 9.5 — Author Reputation Layer (5 stories)

#### US-9.5.1 — DB schema `authors` + RLS

**Description** : En tant que système, je veux tracker les auteurs et leur réputation.

**Acceptance criteria** :

- [ ] Migration crée :
  - `authors(id uuid PK, handle text, source text CHECK IN ('x','reddit','arxiv'), org_id uuid FK, reputation_score numeric default 0.5, sample_size int default 0, last_updated timestamptz)`
  - UNIQUE `(handle, source, org_id)`
- [ ] RLS org-scoped
- [ ] `signals.author_id uuid REFERENCES authors(id)` ajouté (nullable)
- [ ] Backfill : extract author handle depuis `signals.raw_payload` (X = `user.screen_name`, Reddit = `author`, arXiv = 1er auteur de la liste)
- [ ] Types regen

**Files** : migration, types
**Dependencies** : aucune
**Agent model** : sonnet
**Priority** : 1

#### US-9.5.2 — pg_cron job `recompute-author-reputation`

**Description** : En tant que système, je veux recalculer quotidiennement la réputation.

**Acceptance criteria** :

- [ ] Edge fn `/recompute-author-reputation` :
  1. Pour chaque `author` avec ≥ 5 signaux dans 90j (sample_size threshold) :
     - Compute `n_top` = nombre de signaux scorés ≥ 80
     - Compute `n_total` = nombre de signaux dans 90j
     - Compute `n_corroborated` = nombre via `signal_clusters` cross-source
     - Compute `n_flagged` = nombre via `signal_flags` direct ou propagé
     - `reputation_score = (n_top + 0.5 * n_corroborated - 0.7 * n_flagged) / n_total` clampé [0, 1]
  2. Update `authors.reputation_score`, `sample_size`, `last_updated`
- [ ] pg_cron schedule daily 3am UTC
- [ ] Logs

**Files** : `supabase/functions/recompute-author-reputation/index.ts`, migration cron
**Dependencies** : US-9.5.1, US-9.3.4 (flags), US-9.4.2 (corroboration)
**Agent model** : sonnet
**Priority** : 2

#### US-9.5.3 — Backfill initial 90j

**Description** : En tant que système, je veux peupler `authors` avec les 90j d'historique.

**Acceptance criteria** :

- [ ] Script SQL ou edge fn one-shot qui :
  1. Extract authors depuis `signals.raw_payload` rétroactivement
  2. Insert dans `authors` (idempotent via UNIQUE)
  3. Update `signals.author_id` via JOIN
  4. Lance le `recompute-author-reputation` une fois
- [ ] Lancé manuellement par le founder ou via pg_cron one-shot
- [ ] Idempotent (peut être relancé)

**Files** : `supabase/migrations/20260503000010_authors_backfill.sql` ou `scripts/backfill-authors.ts`
**Dependencies** : US-9.5.1, US-9.5.2
**Agent model** : sonnet
**Priority** : 3

#### US-9.5.4 — Score formula integration

**Description** : En tant que système, je veux pondérer le score signal par la réputation auteur.

**Acceptance criteria** :

- [ ] Modification `llm-score-batch` : après scoring, lookup `signal.author_id` → `authors.reputation_score`
- [ ] Si reputation existe : `score_final = score × √(0.5 + 0.5 × reputation_score)` (formule conservatrice : √reputation normalisée [0.5-1.0])
- [ ] Si pas de reputation (auteur < 5 signaux) : `score_final = score` (no-op)
- [ ] Logs : `score_raw`, `reputation_factor`, `score_final` dans `score_runs`
- [ ] Tests Deno : couvre 3 cas (haute reputation, basse, aucune)

**Files** : `supabase/functions/llm-score-batch/index.ts`, tests
**Dependencies** : US-9.5.1, US-9.5.2
**Agent model** : sonnet
**Priority** : 4

#### US-9.5.5 — Frontend tooltip + filter author reputation

**Description** : En tant qu'utilisateur, je veux voir et filtrer par reputation.

**Acceptance criteria** :

- [ ] Hover handle dans `SignalTable` → tooltip avec reputation score (étoile 0-5) + sample size + lien vers histo author
- [ ] Hook `useAuthorReputation(authorId)`
- [ ] Filter UI Dashboard : « Reputation min » slider 0-1
- [ ] Trier par reputation (col cliquable)
- [ ] Tests

**Files** : `src/components/features/SignalTable.tsx`, `src/hooks/useAuthorReputation.ts`, `src/components/features/AuthorTooltip.tsx`
**Dependencies** : US-9.5.1
**Agent model** : sonnet
**Priority** : 5

---

### Sprint 0 — Distribution table stakes (6 stories, ~1 jour, parallèle Wave 9)

> **Objectif** : éliminer la friction immédiate sur `/digest`. Le founder demandait : « le brief n'est pas exploitable en l'état, ni partageable par mail ou par les réseaux sociaux ». Ces 6 stories répondent à 100 % à ce besoin sans dépendance Wave 9. Tous les boutons s'ajoutent au footer du composant brief de `Digest.tsx`.

#### US-S0.1 — Bouton « Copier markdown »

**Description** : En tant qu'utilisateur, je veux copier le markdown du brief dans le presse-papier en 1 click pour le coller ailleurs (Slack, email, Notion).

**Acceptance criteria** :

- [ ] Bouton `Copier markdown` dans le footer du brief
- [ ] Utilise `navigator.clipboard.writeText(selected.content)`
- [ ] Toast confirmation « Markdown copié dans le presse-papier »
- [ ] Fallback si Clipboard API indispo (vieux navigateur) : sélection + `document.execCommand('copy')`
- [ ] Tests RTL

**Files** : `src/pages/Digest.tsx` (modif), `src/pages/Digest.test.tsx` (modif)
**Dependencies** : aucune
**Agent model** : haiku
**Priority** : 1
**Effort** : XS (~5 min)

#### US-S0.2 — Bouton « Envoyer par email » mailto

**Description** : En tant qu'utilisateur, je veux envoyer le brief par email à un destinataire en ouvrant son client mail par défaut.

**Acceptance criteria** :

- [ ] Bouton `Email` dans le footer
- [ ] Génère un `mailto:?subject=&body=` avec :
  - subject = `Veille IA Kairos — ${date} — ${signal_count} signaux`
  - body = markdown brut tronqué à 1500 chars (limite mailto navigateur) + lien vers le brief sur `/digest?id=...`
- [ ] Body URL-encoded proprement
- [ ] Si markdown > 1500 chars : ajoute `[brief complet : <url>]` à la fin
- [ ] Tests : couvre encoding chars spéciaux

**Files** : `src/pages/Digest.tsx` (modif), test
**Dependencies** : aucune
**Agent model** : haiku
**Priority** : 2
**Effort** : S (~30 min)

#### US-S0.3 — Boutons « Tweet » + « LinkedIn »

**Description** : En tant qu'utilisateur, je veux partager le brief sur X ou LinkedIn en 1 click.

**Acceptance criteria** :

- [ ] Bouton `Tweet` ouvre `https://twitter.com/intent/tweet?text=${headline}&url=${shareUrl}` dans un nouvel onglet
- [ ] Bouton `LinkedIn` ouvre `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`
- [ ] `headline` = première ligne du brief (h1 markdown extrait) ou `Veille IA Kairos — ${date}` en fallback
- [ ] `shareUrl` = `${window.location.origin}/digest?id=${digest_id}` (route partageable, à créer si pas déjà)
- [ ] Si la route `/digest?id=X` n'auto-charge pas le digest spécifique → ajouter le param dans `useState(searchParams.get('id'))` + l'utiliser comme `selectedId` initial
- [ ] Tests

**Files** : `src/pages/Digest.tsx` (modif, support param URL), test
**Dependencies** : aucune
**Agent model** : sonnet
**Priority** : 3
**Effort** : S (~1 h)

#### US-S0.4 — Bouton « Télécharger .md »

**Description** : En tant qu'utilisateur, je veux télécharger le brief en fichier `.md` pour archive ou édition externe.

**Acceptance criteria** :

- [ ] Bouton `Télécharger .md`
- [ ] Crée un Blob du markdown + ancre cachée + click programmatique
- [ ] Filename : `kairos-brief-${YYYY-MM-DD}-${HH-mm}.md`
- [ ] Tests

**Files** : `src/pages/Digest.tsx` (modif), `src/lib/download-utils.ts` (nouveau, helper réutilisable), test
**Dependencies** : aucune
**Agent model** : haiku
**Priority** : 4
**Effort** : XS (~15 min)

#### US-S0.5 — Cleanup footer Digest : actions groupées + visibles

**Description** : En tant qu'utilisateur, je veux que les actions du brief soient visibles et bien organisées (pas perdues parmi les méta-données).

**Acceptance criteria** :

- [ ] Footer divisé en 2 zones : **Actions** (gauche) avec les 6 boutons + **Métadonnées** (droite) avec signaux/fenêtre/score/modèle/coût
- [ ] Actions = boutons compacts avec icônes lucide (ClipboardCopy, Mail, Twitter, Linkedin, Download, FileText pour PDF)
- [ ] Responsive : sur mobile, actions wrap au-dessus des métadonnées
- [ ] Hover état + active visible (Material You)
- [ ] Tests RTL : couvre la présence des 6 boutons + responsive

**Files** : `src/pages/Digest.tsx` (refacto footer), test
**Dependencies** : US-S0.1, US-S0.2, US-S0.3, US-S0.4 (les boutons doivent exister)
**Agent model** : sonnet
**Priority** : 5
**Effort** : S (~30 min)

#### US-S0.6 — Bouton « Exporter PDF » (basique, sans branding)

**Description** : En tant qu'utilisateur, je veux exporter le brief en PDF pour le forwarder à un boss/client.

**Acceptance criteria** :

- [ ] Bouton `Exporter PDF` dans le footer Actions
- [ ] Implémentation Sprint 0 = côté client uniquement (pas d'edge fn) : `window.print()` avec un `@media print` CSS dédié qui :
  - Cache la sidebar, le header de page, les autres briefs
  - Affiche uniquement le contenu du brief sélectionné + un en-tête simple « Kairos · ${date} · ${signal_count} signaux »
  - Couleurs print-friendly (texte noir, pas de bg sombre)
- [ ] Format : A4, marges raisonnables
- [ ] Note : version Wave 11 ajoutera branding org + logo + QR code (edge fn `export-digest-pdf` avec Puppeteer)
- [ ] Tests : vérifier la présence des CSS print rules

**Files** : `src/pages/Digest.tsx` (modif), `src/index.css` ou `src/styles/print.css` (nouveau)
**Dependencies** : US-S0.5 (footer cleanup d'abord pour bien intégrer le bouton)
**Agent model** : sonnet
**Priority** : 6
**Effort** : S (~1 h)

---

## 7. Functional Requirements (synthèse cross-feature)

- **FR-1** : Toutes les nouvelles tables ont RLS activée et des policies org-scoped. Aucune mutation par anon.
- **FR-2** : Les coûts LLM additionnels (consensus, backtest, embeddings) sont trackés dans `llm_costs` avec `task` distinct.
- **FR-3** : Les pg_cron jobs sont idempotents et résilients (retry sur échec, log complet).
- **FR-4** : Les RPCs SECURITY DEFINER (si nécessaires) doivent valider l'appartenance à l'org du caller en interne.
- **FR-5** : Les types TypeScript sont régénérés et commités après chaque migration.
- **FR-6** : Aucune feature ne déploie sans migration RLS testée (test manuel via service_role bypass + user authentifié).
- **FR-7** : Les badges UI ont des fallback gracieux si la donnée n'est pas encore calculée (ne PAS rendre `null` en hard error).
- **FR-8** : Les coûts visibles (cost estimate, cost displayed) utilisent `useFormatCost` (Wave 8 currency picker).

---

## 8. Non-Goals (out of scope Wave 9)

- ❌ Pas d'UI admin pour configurer les penalty/boost values en self-serve (default settings.\* hardcoded sortis Wave 10)
- ❌ Pas de fine-tuning ou model selection automatique (le user choisit ses 2-3 modèles consensus)
- ❌ Pas de prediction tracking / Brier scoring (Wave 10)
- ❌ Pas de cross-org consensus benchmark (Wave 10)
- ❌ Pas d'export PDF/share buttons sur les signaux (Wave 9 = scoring core, pas shareability)
- ❌ Pas de réactivation rétroactive des digests historiques avec nouveau scoring (cost prohibitif)

---

## 9. Technical Considerations

### Embeddings strategy

- OpenAI `text-embedding-3-small` (1536 dim, $0.02/1M tokens) en default
- Fallback : Voyage AI `voyage-2` si OPENAI_API_KEY absent
- Cache : 1 embedding par signal, calculé 1× au scoping (pas re-calculé)
- Cost projection : 700 signaux/j × 50 tokens/title × 30 j = 1,05 M tokens / mois ≈ 0,02 €/mois

### Performance

- pg_vector index `IVFFlat (lists=100)` sur `signal_embeddings.embedding` pour cosine sim < 100 ms
- pg_cron jobs en background (pas de blocage user)
- Backtest cap 100 signaux × ~15 sec/signal = 25 min max

### Compatibility

- RLS Wave 6 + hotfixes RLS récursion ce matin = base saine
- Pas de breaking change sur API publique (additive only)

### Cost monitoring

- Multi-LLM consensus : cost × N modèles. À tracker via `llm_costs` pour reporting
- Alert si org dépasse 50 €/jour (déjà présent Wave 6.5 admin cockpit)

---

## 10. Success Metrics

- ✅ 26/26 stories `passes: true`
- ✅ 0 erreur typecheck, 0 lint warning
- ✅ Tests : ≥ 130 tests unitaires (96 actuels + ~35 nouveaux), 100 % pass
- ✅ Edge functions tests Deno : ≥ 5 nouveaux tests
- ✅ Migrations DB : 12-15 migrations Wave 9, toutes avec RLS, types regen propres
- ✅ Dashboard rendering avec les 4 nouveaux badges (consensus, contested, corroboration, reputation tooltip)
- ✅ /settings/rubrics/backtest fonctionnel end-to-end

**Mesure post-déploiement (60 j)** :

- 30 % des signaux ont un score consensus distinct du score primaire (variance > 5)
- Au moins 1 user a backtesté ≥ 1 rubric
- Au moins 5 % des signaux flagged sont propagés à des signaux similaires
- Author reputation distinguée pour ≥ 100 auteurs actifs

---

## 11. Open Questions

1. **Embeddings provider** : OpenAI (better quality, easier) vs Voyage (better long-doc, plus cher) ?
   → **Décision** : OpenAI `text-embedding-3-small` par défaut, Voyage en fallback option.
2. **Reputation formula** : `sqrt(reputation)` ou `reputation^0.7` ou linéaire ?
   → **Décision provisoire** : sqrt (conservateur, n'over-pondère pas les top auteurs).
3. **Multi-LLM consensus models** : forcer ≥ 2 fournisseurs distincts (ex : pas Haiku + Sonnet, mais Anthropic + OpenAI + Mistral) ?
   → **Décision** : laisser le user choisir, mais warning UI si toutes les modèles d'un même provider.
4. **Backtest persistence** : conserver l'historique des backtests pour audit ?
   → **Décision** : non en Wave 9 (out of scope), à reconsidérer Wave 10.

---

## 12. Annexe — Mapping ralph-loop

```yaml
loop_config:
  max_iterations: 25
  circuit_breaker_threshold: 3 # même erreur 3x = stop
  default_agent_model: sonnet-4-6
  fallback_agent_model: haiku-4-5
  forbidden_models: [opus-4-7, opus-4-6]
  worktree_strategy: per-story
  worktree_base: /c/temp/kairos-w9
  base_branch: main
  merge_strategy: fast-forward-only
  auto_deploy_after_merge: true
  deploy_target: coolify

parallel_groups:
  - [US-9.1.1, US-9.1.2, US-9.1.3, US-9.1.4, US-9.1.5] # 9.1 séquentiel internal
  - [US-9.2.1, US-9.2.2, US-9.2.3, US-9.2.4, US-9.2.5] # 9.2 séquentiel internal, parallèle à 9.1
  - [US-9.3.1, US-9.3.2, US-9.3.3, US-9.3.4, US-9.3.5, US-9.3.6] # 9.3 séquentiel
  - [US-9.4.*] # depend de 9.3.3 (embeddings)
  - [US-9.5.*] # depend de 9.3.4 + 9.4.2

exit_conditions:
  all_stories_pass: true
  typecheck_zero_errors: true
  lint_zero_warnings: true
  vitest_all_pass: true
  promised_signal: '<promise>COMPLETE</promise>'
```

---

_PRD généré 2026-05-03 via skill `ralph-tui-prd` — basé sur l'analyse `2026-05-02-moats-and-value-capture.md`. Ne pas dispatcher la loop sans GO explicite utilisateur._
