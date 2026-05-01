# Database

Postgres 17 hébergé sur Supabase. RLS partout. Migrations versionnées dans `supabase/migrations/`.

## Schema

### `signals`

Table principale, ingestion brute des sources.

| Colonne       | Type                 | Notes                                                              |
| ------------- | -------------------- | ------------------------------------------------------------------ |
| `id`          | UUID PK              | gen_random_uuid                                                    |
| `user_id`     | UUID FK auth.users   | RLS isolation                                                      |
| `source`      | enum `signal_source` | 'reddit' / 'arxiv' / 'x'                                           |
| `external_id` | TEXT                 | ID natif (post id, paper URL, tweet id)                            |
| `url`         | TEXT                 | URL source                                                         |
| `title`       | TEXT                 | titre du contenu                                                   |
| `raw_payload` | JSONB                | payload brut du provider                                           |
| `scraped_at`  | TIMESTAMPTZ          | quand on l'a fetché                                                |
| `signal_date` | TIMESTAMPTZ          | **date de publication originale** (paper published, tweet created) |

**UNIQUE** `(user_id, source, external_id)` — déduplication exacte.
**Index** : `(user_id, scraped_at DESC)`, `(user_id, source, scraped_at DESC)`, `(user_id, signal_date DESC NULLS LAST)`.

### `scores`

Score LLM par signal × user.

| Colonne      | Type        | Notes                            |
| ------------ | ----------- | -------------------------------- |
| `signal_id`  | UUID FK     | cascade                          |
| `user_id`    | UUID FK     | cascade                          |
| `score`      | NUMERIC     | CHECK 0-100                      |
| `reasoning`  | TEXT        | justification 1 phrase           |
| `model_used` | TEXT        | ex: `anthropic/claude-haiku-4.5` |
| `cost`       | NUMERIC     | $ pour cet appel                 |
| `scored_at`  | TIMESTAMPTZ |                                  |

**PK** `(signal_id, user_id)`.

### `logs`

Trace toutes les actions du pipeline. Purgés < 24h via pg_cron.

| Colonne   | Type         | Notes                                                                                                              |
| --------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `id`      | BIGSERIAL PK |                                                                                                                    |
| `user_id` | UUID FK      | nullable pour logs système                                                                                         |
| `action`  | TEXT         | `scrape:x`, `scrape:reddit`, `scrape:arxiv`, `llm:score`, `llm:score-batch`, `llm:digest`, `pipeline:run`, `purge` |
| `payload` | JSONB        | détails contextuels                                                                                                |
| `status`  | TEXT         | `start` / `ok` / `error` / `degraded`                                                                              |
| `ts`      | TIMESTAMPTZ  |                                                                                                                    |

### `llm_costs`

Tracking coût par appel OpenRouter.

| Colonne                              | Type            | Notes                                            |
| ------------------------------------ | --------------- | ------------------------------------------------ |
| `id`                                 | BIGSERIAL       |                                                  |
| `user_id`                            | UUID FK         |                                                  |
| `task`                               | enum `llm_task` | 'scraping' / 'scoring' / 'monitoring' / 'digest' |
| `model`                              | TEXT            |                                                  |
| `prompt_tokens`, `completion_tokens` | INT             |                                                  |
| `cost`                               | NUMERIC         | $                                                |
| `ts`                                 | TIMESTAMPTZ     |                                                  |

### `settings`

1 ligne par user (auto-créée via trigger `init_user_settings`).

| Colonne             | Type       | Default                                                                                        | Notes                               |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| `user_id`           | UUID PK FK |                                                                                                |                                     |
| `model_config`      | JSONB      | `{}`                                                                                           | `{task: {provider, model}}` BYOK    |
| `prompt_scoring`    | TEXT       | (legacy fallback si pas de rubric)                                                             |                                     |
| `language`          | TEXT       | `fr`                                                                                           | CHECK fr/en/es                      |
| `reddit_subs`       | TEXT[]     | 18 subs IA                                                                                     |                                     |
| `arxiv_categories`  | TEXT[]     | `cs.AI, cs.LG, cs.CL, cs.CV, cs.MA, stat.ML`                                                   |                                     |
| `x_queries`         | TEXT[]     | `[]`                                                                                           | legacy, Apify utilise listIds       |
| `branding`          | JSONB      | `{name, primary, logo_url}`                                                                    |                                     |
| `daily_budget_usd`  | NUMERIC    | 1.00                                                                                           |                                     |
| `active_rubric_id`  | UUID FK    | NULL                                                                                           | rubric scoring active               |
| `source_priority`   | JSONB      | `{reddit:1, arxiv:1, x:1}`                                                                     | poids 0-2                           |
| `apify_config`      | JSONB      | `{x_list_ids, x_max_items, reddit_actor, reddit_sort, reddit_time_filter, reddit_max_per_sub}` |                                     |
| `score_concurrency` | INT        | 20                                                                                             | CHECK 1-100                         |
| `score_batch_size`  | INT        | 20                                                                                             | CHECK 1-50, signaux par appel batch |

Trigger `trg_settings_updated_at` met à jour `updated_at` à chaque UPDATE.

### `user_api_keys`

Clés API par user et par provider, RLS-protected.

| Colonne         | Type    | Notes                                         |
| --------------- | ------- | --------------------------------------------- |
| `id`            | UUID PK |                                               |
| `user_id`       | UUID FK |                                               |
| `provider`      | TEXT    | CHECK 'openrouter' / 'apify'                  |
| `encrypted_key` | TEXT    | en clair pour V1, future migration vers Vault |
| `masked_key`    | TEXT    | pour affichage UI (`sk-or-...abcd`)           |

**UNIQUE** `(user_id, provider)`.

> **Sécurité** : la colonne `encrypted_key` contient la clé en clair, mais RLS empêche un user d'accéder à celle d'un autre user. Le frontend ne sélectionne JAMAIS `encrypted_key`, uniquement `masked_key`.

### `scoring_rubrics`

Grilles de scoring custom par user. N rubrics, 1 active (`is_default`).

| Colonne       | Type    | Notes                                                         |
| ------------- | ------- | ------------------------------------------------------------- |
| `id`          | UUID PK |                                                               |
| `user_id`     | UUID FK |                                                               |
| `name`        | TEXT    | CHECK length 1-80                                             |
| `description` | TEXT    |                                                               |
| `prompt`      | TEXT    | CHECK length 10-4000                                          |
| `criteria`    | JSONB   | `[{label, weight}]`                                           |
| `is_default`  | BOOLEAN | flag par convention, l'active est `settings.active_rubric_id` |

Default seed (créé au signup) : "Default builder IA" avec 6 critères pondérés (innovation, actionable, crédibilité, récence, profondeur, builder-fit).

### `digests`

Cache des briefs LLM générés.

| Colonne         | Type        | Notes                               |
| --------------- | ----------- | ----------------------------------- |
| `id`            | UUID PK     |                                     |
| `user_id`       | UUID FK     |                                     |
| `period_days`   | INT         | CHECK 1/7/30                        |
| `language`      | TEXT        | snapshot au moment de la génération |
| `content`       | TEXT        | Markdown                            |
| `signals_count` | INT         |                                     |
| `model_used`    | TEXT        |                                     |
| `cost`          | NUMERIC     |                                     |
| `generated_at`  | TIMESTAMPTZ |                                     |

## Migrations

10 migrations dans l'ordre :

1. `init` — tables principales + enums + indexes
2. `rls` — enable RLS + policies `own_*` + trigger `init_user_settings` + bucket storage `branding`
3. `pg_cron` — purge logs > 24h horaire
4. `costs_by_day` — RPC pour Costs page
5. `unscored_signals_rpc` — RPC retourne les ids sans score
6. `modular_config` — `user_api_keys` + `scoring_rubrics` + colonnes settings + RPC `tokens_summary`
7. `seed_sources_default` — defaults VEILLE_IA_ZLATAN_CORE
8. `digest_and_language` — table `digests` + `settings.language` + `model_digest` + enum `digest`
9. `score_concurrency` — `settings.score_concurrency`
10. `signal_date_and_batching` — `signals.signal_date` + `settings.score_batch_size` + backfill

## RPCs

| RPC                         | Returns                                                             | Usage                        |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| `costs_by_day(days INT)`    | `(day, task, total_cost)`                                           | Page Costs (Recharts)        |
| `tokens_summary(days INT)`  | `(day, model, prompt_tokens, completion_tokens, total_cost, calls)` | Page Costs détail par modèle |
| `unscored_signals(lim INT)` | `(id UUID)`                                                         | Pipeline phase scoring       |

## RLS

Toutes les tables ont RLS enabled. Policies `own_*` :

```sql
CREATE POLICY "own_signals" ON signals FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

Patron répliqué pour `scores`, `logs`, `llm_costs`, `settings`, `scoring_rubrics`, `digests`.

`user_api_keys` a 4 policies splittées (SELECT, INSERT, UPDATE, DELETE) pour clarté.

Storage bucket `branding` : public read (logos affichés sans auth), insert/update/delete réservé au propriétaire (path `<user_id>/...`).

## Régénération des types TS

Après toute migration qui ajoute/modifie une colonne :

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

Si tu ne peux pas, les hooks affectés utilisent `as unknown as` cast (déjà en place dans `useApiKeys`, `useRubrics`, `useUpdateSettings`).
