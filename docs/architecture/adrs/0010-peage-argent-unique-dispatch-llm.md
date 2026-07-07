# ADR 0010 — Péage argent unique dans dispatch-llm

- **Statut** : accepté (2026-07-07)
- **Contexte** : blindage 2026-07-07 (P0-004 budget, P0-005 auth, P1-010 coûts)
  - deep-explore L99 (finding A#1 consensus factice)

## Contexte

`dispatch-llm` est l'unique point de sortie génératif du repo (14 fonctions
consommatrices), mais quatre responsabilités « argent » étaient éclatées ou
absentes :

1. **Coûts non écrits (P1-010)** — chaque fonction écrivait sa propre ligne
   `llm_costs`, or la colonne `task` était un ENUM (`scraping|scoring|monitoring`)
   alors que les labels réels étaient libres (`digest`, `enrich:topic`,
   `admin_prompt:<kind>`, `suggest:personas`, `quality-auditor`) → violation
   d'enum **silencieuse** sur la plupart des inserts. Preuve live (db.saqr.ma,
   2026-07-07) : `llm_costs` = 0 ligne. Quatre fonctions (backtest-rubric,
   research-strategist, rubric-architect, signal-synthesizer, topic-classifier)
   n'écrivaient d'ailleurs rien du tout.
2. **Consensus factice (A#1)** — `llm-score-batch` envoyait
   `provider_override`/`model_override` que `dispatch-llm` ignorait : les N
   appels du panel résolvaient le même modèle, `score_variance` mesurait le
   bruit de température. N× coût pour une métrique fausse (DÉFCON 1).
3. **Aucune garde budget (P0-004)** — `settings.daily_budget_usd` n'était
   respecté nulle part dans la chaîne LLM.
4. **Auth mono-mode (P0-005)** — `getUser()` direct : la chaîne interne K06
   (research-from-seed → … → dispatch-llm en 2ᵉ saut) ne pouvait pas passer.

## Décision

`dispatch-llm` devient le **péage unique** :

1. **Écriture `llm_costs` exclusive** : une ligne par complétion aboutie, avec
   label fin `cost_task` (défaut : `task`). Les callers n'écrivent plus jamais
   `llm_costs` (les 9 inserts côté callers sont supprimés). `org_id` est résolu
   explicitement (premier org rejoint — même sémantique que
   `user_default_org_id()`, qui retourne NULL en service_role).
2. **Migration `20260511000001`** : `llm_costs.task` ENUM → TEXT
   (CHECK 1-64 chars), enum `llm_task` purgé, `costs_by_day` recréée.
   Purger, ne pas contourner : l'enum était la cause racine.
3. **Overrides honorés** : `provider_override` + `model_override` (couple
   validé tout-ou-rien, logique pure `resolve.ts`) priment sur
   `settings.model_config[task]`. Le consensus multi-modèles redevient réel.
4. **Garde budget** : `_shared/budget-check.ts` (module testé repêché du repo
   Saqr de l'associé, fail-open) évalué AVANT l'appel payant → HTTP 402
   `budget_exceeded`. Instrumenter le péage couvre toutes les fonctions.
5. **Auth dual-mode** : `resolveCaller` (ADR 0009). En mode interne, queries
   service_role avec filtres `user_id` explicites.
6. `temperature` (déjà transmise) conservée telle quelle.

## Conséquences

- (+) Comptabilité exacte et exhaustive : plus aucune fuite de coût possible
  par oubli d'insert côté caller ; les fonctions qui ne traçaient rien sont
  couvertes d'office.
- (+) Budget quotidien enfin opposable, en un seul point.
- (+) `score_variance`/consensus mesurent un vrai désaccord inter-modèles.
- (+) La chaîne K06 peut appeler dispatch-llm en mode interne (2ᵉ saut).
- (−) `llm_costs.task` perd la contrainte d'enum → labels à discipline
  conventionnelle (`domaine:sous-tâche`), bornés par CHECK.
- (−) Un échec d'écriture du péage ne fait pas échouer la réponse LLM
  (`cost_recorded=false` + log `dispatch-llm:cost_write_failed`) : la réponse
  prime, mais l'échec est bruyant.
- (⚠) `scores.cost` et `admin_prompt_runs.cost` continuent de stocker le coût
  par run pour l'UI — ce sont des dénormalisations d'affichage, `llm_costs`
  est la seule source comptable.

## Fichiers

- `supabase/functions/dispatch-llm/{index.ts,resolve.ts,resolve.test.ts,README.md}`
- `supabase/functions/_shared/{budget-check.ts,budget-check.test.ts}`
- `supabase/migrations/20260511000001_llm_costs_task_text.sql`
- 12 fonctions clientes nettoyées (inserts supprimés + labels `cost_task`).
