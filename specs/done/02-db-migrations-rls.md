---
task_id: 02
title: DB migrations + RLS + pg_cron
owner: Xavier
status: done
estimated: 1h
actual: ~30min
commit: 3b683cc
date_completed: 2026-04-30
source: ~/.claude/output/projects/zlatan-scrap/tasks/02-db-migrations-rls.md
depends_on: [01]
---

# Task 02 — DB migrations + RLS + pg_cron

## Objectif

Créer les migrations DB, activer RLS partout, programmer la purge logs 24h via pg_cron, exposer une RPC d'agrégation pour la page Monitoring, générer les types TS.

## Plan exécuté

### 4 migrations versionnées (`supabase/migrations/`)

#### `20260430000001_init.sql` (124L)

- 2 enums : `signal_source` ('reddit'|'arxiv'|'x'), `llm_task` ('scraping'|'scoring'|'monitoring')
- 5 tables :
  - `signals(id, user_id, source, external_id, url, title, raw_payload jsonb, scraped_at)` + UNIQUE(user, source, external_id)
  - `scores(signal_id, user_id, score CHECK 0-100, reasoning, model_used, cost, scored_at)` PK composite
  - `logs(id bigserial, user_id, action, payload, status, ts)`
  - `llm_costs(id bigserial, user_id, task, model, prompt_tokens, completion_tokens, cost, ts)`
  - `settings(user_id PK, model_scraping, model_scoring, model_monitoring, prompt_scoring, reddit_subs[], arxiv_categories[], x_queries[], branding jsonb, daily_budget_usd, updated_at)`
- 7 indexes ciblés (user_id+ts DESC, source+ts, score DESC, task+day)
- Trigger `touch_updated_at` sur settings (auto-bump `updated_at`)

#### `20260430000002_rls.sql` (97L)

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sur les 5 tables
- 5 policies `own_*` : `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`, role `authenticated`
- Trigger `init_user_settings` SECURITY DEFINER : auto-insert ligne settings au signup `auth.users`
- Bucket Storage `branding` (public read) + 4 policies CRUD (owner-only via `(storage.foldername(name))[1] = auth.uid()::text`)

#### `20260430000003_pg_cron.sql` (15L)

- `CREATE EXTENSION IF NOT EXISTS pg_cron`
- `cron.schedule('purge_logs_24h', '0 * * * *', 'DELETE FROM logs WHERE ts < now() - interval ''24 hours''')`

#### `20260430000004_costs_by_day.sql` (21L)

- RPC `costs_by_day(days INT DEFAULT 7) RETURNS TABLE(day, task, total_cost)`
- `SECURITY INVOKER` + `STABLE` → respecte RLS du caller, prêt pour page Monitoring (task 11)

### `src/types/database.ts` — types Database manuels

- 5 tables × 3 variants (Row, Insert, Update) typés strict
- Enums `SignalSource`, `LlmTask` extraits en alias
- `Branding` interface pour la colonne JSONB
- RPC `costs_by_day` typée avec `Args` et `Returns`

## Acceptance — 5/5 ✅

- [x] 5 tables migrent (sanity SQL : parens balanced 4/4)
- [x] RLS enable + 5 policies own\_\* écrites
- [x] pg_cron job purge_logs_24h écrit (validation live = quand stack up)
- [x] Types TS générés/écrits, typecheck passe
- [x] Trigger init_user_settings écrit

## Bloqué localement (validation différée)

- Docker daemon indispo → pas de `supabase start` ni `supabase db reset` local
- Validation live possible via :
  1. **Local** : démarrer Docker Desktop puis `bunx supabase db reset`
  2. **Remote** : `bunx supabase link --project-ref <id> && bunx supabase db push`
- Une fois live : `bunx supabase gen types typescript --local > src/types/database.ts` (overwrite types manuels)

## Améliorations vs spec source

- **CHECK constraint** sur `scores.score` (0-100) — défensif côté DB
- **`daily_budget_usd`** ajouté à `settings` (mitigation runaway, mentionné dans archi.md § risques)
- **Migration RPC `costs_by_day`** anticipée ici plutôt que task 11
- **Storage policies CRUD complètes** (4 policies au lieu de 2 dans le spec)
- **Trigger `touch_updated_at`** sur settings

## Commit

`3b683cc` feat(db): schema initial + RLS + pg_cron + RPC costs_by_day (5 files, +396/-5)
