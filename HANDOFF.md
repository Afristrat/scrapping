# HANDOFF — Kairos (anciennement theresa-scrap / zlatan-scrap)

> **Date** : 2026-05-22 (MAJ session devil-advocate Bassira→Kairos hardening)
> **État global** : production stable sur `https://scrap.ai-mpower.com`. Wave 1-11 livrées + **Pipeline Bassira (K05→K10) durci** + **Watchlist (US-K11/K12)** + **Devil-advocate hardening 2026-05-17/18 (9 fixes antifragiles)** mergés sur `main`. Wave 10C-E à venir (21 stories restantes).
>
> **Pipeline `research-from-seed` (Bassira → Kairos) opérationnel end-to-end** après 9 fixes en cascade. Dernière session de référence : `22f5e86a` (completed, 123s, 2 topics, scoring_quality=partial, tous stages OK).

---

## 0. Coordonnées techniques

| Composant               | Valeur                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Repo GitHub**         | `Afristrat/scrapping` (branches `main` + `feat/topic-tracking-minio`)                                                        |
| **Project Supabase**    | `crplceoptyeslqyfcqvj` (jamais `rratnmtiescwdvtnjbeq`)                                                                       |
| **Coolify admin**       | `https://coolify.ai-mpower.com`                                                                                              |
| **App UUID Coolify**    | `jhg5pwiyul9r992k8qg2lkx6` (déploie `feat/topic-tracking-minio`)                                                             |
| **Tunnel CF**           | `nahda-tunnel` → `scrap.ai-mpower.com` → `localhost:80`                                                                      |
| **Worktree principal**  | `C:\Users\amans\OneDrive\Projets\claudia-zlatan-scrap-main` (verrouillé OneDrive parfois — utiliser `/c/temp/kairos-hotfix`) |
| **Worktree de travail** | `/c/temp/kairos-hotfix` (clone fresh fonctionnel)                                                                            |
| **Founder user_id**     | `f313137b-3480-4b2b-bc11-e2d4c6ba8fd3`                                                                                       |
| **Founder org_id**      | `cbab1468-b8c4-4f6d-96a6-4ae867beb538` (« Kairos », slug `kairos`)                                                           |
| **Founder email**       | `medamine.mansouriidrissi@gmail.com`                                                                                         |

### Mémoires Claude Code persistées

`C:\Users\amans\.claude\projects\C--Users-amans-OneDrive-Projets-claudia-zlatan-scrap-main\memory\` :

- `coolify_infra.md` — admin URL, UUID, deploy API
- `supabase_infra.md` — project ref, service_role, anon, founder ids
- `worktree_setup.md` — pourquoi /c/temp/kairos-hotfix vs OneDrive
- `user_amine_cto.md` — profil founder
- `feedback_check_history_first.md` — toujours grep transcripts/passations avant de redemander
- `feedback_no_assumptions.md` — vérifier avant d'affirmer
- `feedback_autonomous_corrections.md` — fix direct, pas dicter
- `feedback_supabase_rpc_pattern.md` — `supabase.rpc()` jamais détaché en variable
- `feedback_byok_suprem.md` — BYOK non-négociable, fix le pipeline pas le modèle
- `feedback_supabase_no_verify_jwt.md` — `--no-verify-jwt` obligatoire pour toutes fns Bassira
- `bassira_pipeline_definitif.md` — architecture finale post-2026-05-15 + clé bsr_7123 + F3-F7b + scope_profiles
- `watchlist_mission_handoff.md` — topics_of_interest + topics-search + watchlist-tick livrés 2026-05-16
- `a3_credentials_rotation_runbook.md` — procédure 15min rotation service_role + anon + Coolify + MinIO
- `devil_advocate_2026_05_18.md` — 9 fixes session devil-advocate Bassira→Kairos
- `MEMORY.md` — index des mémoires

---

## 1. État du code

### HEAD courant

```
main = d7d0a9b docs(devil-advocate): section 8b — cascade fix logs.org_id + smoke #3 verdict
       (worktree OneDrive local desync sur 6cbe4a3, /c/temp/kairos-hotfix à jour)
```

Derniers commits significatifs (origin/main) :

| Commit    | Message                                                                                     |
| --------- | ------------------------------------------------------------------------------------------- |
| `d7d0a9b` | docs(devil-advocate): section 8b — cascade fix logs.org_id + smoke #3 verdict               |
| `6316d01` | fix(bassira→kairos): reasoning models compat + logs.org_id nullable (FIX #8+#9)             |
| `baf2f72` | docs(devil-advocate): section 8 — reasoning models compat + reco user                       |
| `87fb3ca` | fix(bassira→kairos): devil-advocate hardening — 7 fixes antifragiles (FIX #1-7)             |
| `913f5ec` | feat(kairos): scope-profiles endpoint + watchlist-tick auth fallback + classifyFailure fix  |
| `d8b332b` | merge feat/topics-watchlist (US-K11/K12) déployé prod 2026-05-16                            |
| `fa11869` | merge fix/bassira-pipeline-defense-in-depth (F3+F4+F6+F7a+F7b+F-Profile) déployé 2026-05-15 |
| `6cbe4a3` | [hotfix K05 #10] signal-synthesizer : seuils dégradés MIN_SIGNALS=1 MIN_TOPICS=1            |

### Stack

- **Frontend** : React 19 + Vite 8 + TypeScript strict + Tailwind v4 + shadcn/ui (Radix), Material You design system
- **Backend** : Supabase Postgres + Auth + Edge Functions Deno + Storage + pg_cron
- **LLM** : BYOK 10 providers (OpenRouter, Anthropic, OpenAI, Mistral, Groq, Together, DeepSeek, Moonshot, Google, Ollama). **Founder config actuelle : `deepseek-v4-flash` pour scoring/enrichment/scraping/digest (reasoning model) + `kimi-k2-0905-preview` pour monitoring.** Pas d'OpenRouter chez l'user.
- **Sources** : X (Apify `apidojo/twitter-list-scraper`), Reddit (Apify `automation-lab/reddit-scraper`), arXiv (API officielle directe)
- **Storage** : MinIO (`zlatan-scrap-topics` bucket, lifecycle 100j) pour topic tracking 90j
- **Deploy** : Coolify auto-deploy sur push `feat/topic-tracking-minio` (frontend), edge fns Supabase deployées manuellement via `bunx supabase functions deploy`

### Quality gates au dernier commit

```bash
bun x tsc -b --noEmit              # 0 erreur
bun x eslint . --max-warnings 0    # 0 warning
bun x vitest run                   # 181/181 tests
# Deno tests pipeline Bassira (session 2026-05-17/18) :
deno test --allow-all --no-check supabase/functions/rubric-architect/    # 37 passed
deno test --allow-all --no-check supabase/functions/llm-score-batch/     # 109 passed (39 index + 70 modules)
deno test --allow-all --no-check supabase/functions/research-from-seed/  # 53 passed
```

---

## 2. Documents stratégiques (PRD + analyses)

### Stratégie & moats

| Doc                                                         | Objet                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/strategy/2026-05-02-moats-and-value-capture.md`       | **Source vérité moats** — 15 analogies inter-industries, top 5 features (Multi-LLM consensus, Backtest, Negative propag, Cross-source, Author Reputation), value capture par segment, pricing 12 SKUs (6 segments × Maison/BYOK), MRR cible 132 k€/mois |
| `docs/strategy/2026-05-03-digest-moats-and-shareability.md` | **Moat-hunt /digest spécifique** — 15 analogies (PDB, Cochrane, Doctrine, Galaxy, Stratechery, Common Room, Manifold), top 5 = Words of Estimative Probability, Mode Pitch, PDF brandé, Diff successifs, Citations cliquables                           |

### PRD ralph-loop

| PRD                                                      | Statut                                        | Stories         | Effort        |
| -------------------------------------------------------- | --------------------------------------------- | --------------- | ------------- |
| `docs/handoffs/2026-05-03-wave-9-moats-prd.md`           | **Partiel — 9.1+9.2 livrés, 9.3-9.5 freezés** | 26              | 17-25 j-agent |
| `docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md` | **À dispatcher (validé founder)**             | 37 sur 5 phases | 5-7 sem-agent |

### Handoffs historiques

- `docs/handoffs/2026-04-30-initial-build.md` (build initial)
- `docs/handoffs/2026-04-30-bug-fixes-and-verbose-logging.md` (Wave 1 bug fixes)
- `docs/handoffs/2026-05-01-session-ralph-complete.md` (Wave 2-4 ralph loop)

---

## 3. Pipeline Bassira → Kairos (`research-from-seed`) — état post-2026-05-18

### Architecture

```
Bassira backend (Flask Python, Coolify miro-shark u6pn5mr2pgi88s13un55pkzb)
  ↓ POST /api/research/from-seed  (headers: x-api-key: bsr_7123...)
research-from-seed (verify_jwt=false)
  ↓ 7 stages chaînés
  1. research-strategist     [120s budget] seed → research_strategy + hints
  2. rubric-architect        [120s budget] strategy → rubric 3-couches (criteria/disq/boosts/calibration)
  3. scrape parallèle        [90s budget]  x + reddit + arxiv via signals_session éphémère
  4. read_signals            [n/a]         lecture signals_session (limit 200)
  5. llm-score-batch         [150s budget] top 30 scoredSignals (30 × 2-3 LLM calls //)
  6. signal-synthesizer      [150s budget] F3 best-effort fallback si timeout/schema
  7. quality-auditor         [60s budget]  verdict pass/warn/fail/deepen (F3 best-effort)
```

**Clé API Bassira active** : `bsr_7123800c10cf61ef4f3a116ae2e8a544` (rotée 2026-05-15, prefix `bsr_7123`, scope `research-only`, rate-limit 60/min).
**Coolify env var** : `KAIROS_API_KEY` (uuid `koxe4dustc3joqhg5wacywvm`).

### 9 fixes antifragiles (session devil-advocate 2026-05-17/18)

| #   | Fichier                             | Fix                                                                                                                          |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | (audit)                             | 38 failure modes audités — 22 → 35 couverts (de 58% à 92%)                                                                   |
| 2   | `rubric-architect/index.ts`         | `normalizeScoringPromptLength` — auto-pad si <200 mots depuis contenu rubric / auto-truncate si >500                         |
| 3   | `research-from-seed/lib.ts:28`      | `STAGE_TIMEOUTS_MS.score: 90_000 → 150_000` (30 signaux × 2-3 LLM calls //)                                                  |
| 4   | `rubric-architect/index.ts`         | 5 normalizers defense-in-depth (criteria_count clip 8, disq_count clip 6, soft_boosts cap+scale, calibration min/median/max) |
| 5   | `research-from-seed/{index,lib}.ts` | idempotency_key support + seed_hash 16-char SHA-256 (PII) + cron `mark_stale_running_sessions` 5min                          |
| 6   | `llm-score-batch/{index,engine}.ts` | `scoring_failed` flag + `scoring_quality` (full/partial/poor) + filtrage avant synth + 422 `SCORING_TOTAL_FAILURE`           |
| 7   | migration `20260518000001_*.sql`    | Vue `research_sessions_health` + RPC `alert_on_failure_spike` + cron `check-research-failure-spike` 30min + vue alertes      |
| 8   | `dispatch-llm/index.ts` + engine    | Compat reasoning models : si content vide + reasoning_content présent → fallback. max_tokens bumpés (criteria 600→2000)      |
| 9   | migration `20260518000002_*.sql`    | `ALTER TABLE logs ALTER COLUMN org_id DROP NOT NULL` (sabotait tous mes logs antifragiles)                                   |

### Sessions de référence (5 runs successifs)

| Session        | Date             | Status        | Score stage                        | Quality     | Topics                         |
| -------------- | ---------------- | ------------- | ---------------------------------- | ----------- | ------------------------------ |
| `777f6c28`     | 2026-05-17 22h   | failed        | timeout 90s                        | —           | 0                              |
| `fec78bae`     | 2026-05-17 22h   | failed        | rubric schema (scoring_prompt=28w) | —           | 0                              |
| `30257bfb`     | 2026-05-17 23h   | completed     | 6.8s ✓                             | poor        | 0                              |
| `787362ea`     | 2026-05-18 00h   | failed        | 8.2s ✓                             | —           | 0 (synth INSUFFICIENT_SIGNALS) |
| **`22f5e86a`** | 2026-05-18 00h43 | **completed** | **15.5s ✓**                        | **partial** | **2**                          |

### Pièges critiques à connaître pour future debug

1. **Toutes les fns du pipeline DOIVENT être déployées `--no-verify-jwt`**. Oublier ce flag casse Bassira en ~30s (toutes les requêtes deviennent 401 `UNAUTHORIZED_NO_AUTH_HEADER`, masqué côté MiroShark en `KAIROS_INVALID_KEY` 502).
2. **`logs.org_id` est désormais nullable** (migration 20260518000002). Si tu remets `NOT NULL`, tous les inserts d'observabilité depuis les edge fns ad_hoc échouent silencieusement.
3. **Founder n'utilise PAS OpenRouter** — `deepseek-v4-flash` (reasoning) pour scoring/enrichment. Dispatch-llm fallback sur `reasoning_content` si `content` vide.
4. **BYOK supreme** : ne JAMAIS changer le modèle (memory `feedback_byok_suprem.md`). Fix le pipeline, pas le modèle.
5. **Recommandation user (option, hors BYOK)** : passer `model_config.scoring.model` de `deepseek-v4-flash` à `deepseek-chat` (non-reasoning) pour latence 3-5× moindre. Doc devil-advocate section 8 §reco.
6. **Supervision** : vue `research_sessions_health` (7j horaire), RPC `alert_on_failure_spike(window_minutes, threshold_pct)`, vue `research_alerts_recent`, tous service_role only.

### Investiguer une future panne

```bash
SERVICE_ROLE="..." ; PROJECT="crplceoptyeslqyfcqvj"

# 1. Health 24h
curl -s -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
  "https://$PROJECT.supabase.co/rest/v1/research_sessions_health?limit=24"

# 2. Sessions failed récentes avec failure_type
curl -s -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
  "https://$PROJECT.supabase.co/rest/v1/research_sessions?status=in.(failed,timeout,stale)&order=created_at.desc&limit=10&select=id,seed_hash,status,error_detail,telemetry"

# 3. Failure spike check
curl -X POST -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  "https://$PROJECT.supabase.co/rest/v1/rpc/alert_on_failure_spike" \
  -d '{"window_minutes":60,"failure_threshold_pct":30}'

# 4. Versions déployées vs commits
cd /c/temp/kairos-hotfix && bunx supabase functions list --project-ref $PROJECT
```

Doc référence complète : `docs/bassira-kairos-devil-advocate.md` (8 sections : inventaire 38 failure modes, fixes détaillés, invariants, détection, remédiation par failure_type, limites V2).

### Watchlist (US-K11/K12) — livré prod 2026-05-16

- Migration `20260516100001_topics_watchlist.sql` : `topics_of_interest` (vector 1024) + `topics_archive` + `topic_collect_runs` + RPC `topics_of_interest_match` + cron `purge_topics_archive_daily` + cron `watchlist_tick_hourly`
- Edge fns `topics-of-interest`, `topics-search`, `watchlist-tick` (toutes `--no-verify-jwt`)
- `_shared/embeddings.ts` multi-provider DashScope/OpenAI/OpenRouter 1024 dims Matryoshka (Qwen3-Embedding-8B)
- **Bloqueur smoke test** : `DASHSCOPE_API_KEY` non set, founder doit provisionner clé Singapore (cf. memory `watchlist_mission_handoff.md` §Bloqueur)
- Cron `watchlist_tick_hourly` échoue auth jusqu'à `app.settings.watchlist_cron_secret` set côté DB (cf. workaround memory)

---

## 4. User Stories — état complet (90 total trackées)

| Wave                | Stories | Statut           | Détail                                                                                                                                                    |
| ------------------- | ------: | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1**          |       6 | ✅ Livré         | Refactor BYOK, dispatch-llm, llm_providers, lint/CI, code-splitting                                                                                       |
| **Wave 1.5**        |       1 | ✅ Livré         | Fix bug rescoring + extract body 5xx                                                                                                                      |
| **Wave 2**          |       3 | ✅ Livré         | Topic tracking 90j (Welford z-score + MinIO)                                                                                                              |
| **Wave 4**          |       2 | ✅ Livré         | Tests cascade Deno + `{{run:<kind>}}` engine                                                                                                              |
| **Wave 5**          |       5 | ✅ Livré         | DashDelete + ScoreZero + Landing + LandingContent v2 + MoatHunter                                                                                         |
| **Wave 6**          |      22 | ✅ Livré         | Multi-tenant complet (orgs, members, RLS rewrite, Stripe billing 12 SKUs, configurateur, BYOK validation, audit log, AdminCockpit, CSM, self-host)        |
| **Wave 7**          |       — | ✅ Livré         | Re-skin Material You complet (5 sous-vagues design tokens)                                                                                                |
| **Wave 8**          |       — | ✅ Livré         | Currency picker + domain admin + GitHub removal                                                                                                           |
| **Wave 9.1**        |       5 | ✅ Livré         | Multi-LLM consensus scoring (`score_runs` + `consensus_models` + `ConsensusBadge`) — commit `bceeb73` merge                                               |
| **Wave 9.2**        |       5 | ✅ Livré         | Backtest des grilles de scoring (edge fn dry-run + page `/settings/rubrics/backtest` + `BacktestComparator`) — commit `de10d23` merge                     |
| **Sprint 0**        |       6 | ✅ Livré         | 6 boutons distribution sur footer Digest (Copier md / Email mailto / Tweet / LinkedIn / Télécharger md / PDF basique) — commit `f7aaef6`                  |
| **Wave 9.3**        |       6 | ❄️ **Freeze**    | Negative signal propagation → migré dans Phase C Wave 10 (clustering + signal_flags)                                                                      |
| **Wave 9.4**        |       5 | ❄️ **Freeze**    | Cross-source corroboration → migré dans Phase C Wave 10 (cluster-signals embeddings)                                                                      |
| **Wave 9.5**        |       5 | ❄️ **Freeze**    | Author Reputation Layer → migré dans Phase C Wave 10 (compute-reputation entities)                                                                        |
| **Wave 10.A**       |      10 | ✅ Livré         | Foundation Postgres + Taxonomie PARA — 5 migrations + seed 40 topics + UI CRUD + enrich-signal + suggest-personas + trigger llm-score-batch.              |
| **Wave 10.B**       |       6 | ✅ Livré         | Dashboard filtres multi-axes + /explorer pivot + /digest pré-écran scope + RPC enriched_signals + digest edge fn étendue + stratégie score-first.         |
| **RSS Feeds**       |       5 | ✅ Livré         | Table rss_feeds + scraper-rss (RSS 2.0 + Atom 1.0) + run-pipeline + hook useRssFeeds + UI Settings Sources. Google Alerts supporté.                       |
| **Wave 10.C**       |       7 | 📋 Planifié      | Async enrichment + queue résiliente (NER + reputation + clustering + weight composite + /admin/queue)                                                     |
| **Wave 10.D**       |       6 | 📋 Planifié      | Neo4j shadow mode (provisioning + push async + backfill + health + backup)                                                                                |
| **Wave 10.E**       |       8 | 📋 Planifié      | Neo4j active + commandes /slash (queryWithFallback + /brief @persona + /presentation + /recap + /explorer graph + annotations + GraphQL + lien public OG) |
| **Wave 11 (livré)** |       4 | ✅ Livré partiel | PDF brandé sélectionnable + lien public `/share/:slug` + sélecteur langue + header brief enrichi                                                          |
| **Wave 11 TODO**    |       — | 📋 Planifié      | OG meta tags dynamiques + Email HTML Resend + Slack webhook + Branding org PDF                                                                            |

**Total** : 90 stories trackées dans `.ralph/prd.json` (réf authoritative).

---

## 5. Bugs critiques résolus (session 2026-05-03)

| #   | Bug                                                                                      | Fix                                                                                       | Commit    |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 1   | Récursion RLS infinie sur `organization_members`                                         | DROP policy + `orgm_self_select` non-récursive + `list_org_members()` SECURITY DEFINER    | `b8bf43d` |
| 2   | UNIQUE constraint manquante sur `user_api_keys (org_id, provider)`                       | Migration ADD constraint + DROP ancienne `(user_id, provider)`                            | `b09637a` |
| 3   | Récursion RLS `app_admins` (même pattern)                                                | DROP policies + `is_app_admin()` SECURITY DEFINER                                         | `b999ae3` |
| 4   | `useIsAppAdmin` perdait `this` sur `supabase.rpc` détaché                                | Cast objet entier au lieu de la méthode seule                                             | `8de9ef0` |
| 5   | `useTeamMembers` plantait sur view 403 (`auth.users` perm denied)                        | Switch vers RPC `list_org_members` SECURITY DEFINER                                       | `7c08922` |
| 6   | Currency picker pas appliqué sur /costs (`$` hard-coded)                                 | Hook `useFormatCost` + refacto 11 usages                                                  | `b18ab09` |
| 7   | Accents français orthographe (Costs/Logs/Settings)                                       | Corrections complètes                                                                     | `f418c1b` |
| 8   | Plausible code mort                                                                      | Suppression complète `index.html` + `analytics.ts` + ADR                                  | `00fd705` |
| 9   | `signals_fetch_failed` HTTP/2 stream error sur /digest                                   | FETCH_CAP 1000→120 + filtre SQL `gte scraped_at`                                          | `1a1b159` |
| 10  | OPTIONS preflight 500 sur `llm-score-batch` (rescoring « Failed to fetch »)              | `Response(null, 204, headers)` au lieu de `json({ok:true}, 204)` (HTTP 204 interdit body) | `8b71d5c` |
| 11  | LLM digest 2-3 insights paresseux                                                        | Prompt renforcé « 8-15 insights distincts + RÈGLE EXHAUSTIVITÉ »                          | `8b71d5c` |
| 12  | MinIO bucket `zlatan-scrap-topics` inexistant                                            | Edge fn `minio-init` idempotente + lifecycle 100j                                         | `887a315` |
| 13  | Dashboard ne montrait que Reddit (top ArXiv 95/90 absents)                               | `useSignals.limit(500)` → `5000` (corpus 748 signaux)                                     | `326bb21` |
| 14  | Scrapers `21000 ON CONFLICT` duplicate batch                                             | Dédup `Set` par `external_id` avant upsert (3 scrapers : x/reddit/arxiv)                  | `2b18e0f` |
| 15  | LLM met `[Likely] **insight**` au lieu de `**[Likely] insight**` → badges WEP invisibles | `normalizeConfidenceMarkers` regex côté frontend qui normalise les 2 patterns             | `326bb21` |
| 16  | Sélecteur langue enfoui dans Settings                                                    | `<Select>` langue directement dans Card de génération `/digest` + override per-brief      | `d27d175` |
| 17  | Header brief sans modèle/coût/langue visibles                                            | Header enrichi : Langue : EN · Modèle : deepseek-v4-flash · Coût : 0,xxx €                | `2b18e0f` |
| 18  | PDF `window.print()` minable                                                             | `@react-pdf/renderer` lazy-load + template A4 brandé sélectionnable                       | `dcd1e1a` |
| 19  | Lien partage = URL auth-protégée illisible publiquement                                  | Migration `public_shares` + edge fn `create-public-share` + page `/share/:slug` publique  | `dcd1e1a` |
| 20  | PDF font italic non-registered crash                                                     | Retire `fontStyle: italic`, indentation + → suffisent                                     | `2ab33df` |

---

## 6. Edge Functions actives

### Pipeline Bassira → Kairos (`--no-verify-jwt` obligatoire)

```
research-from-seed          v22+ (devil-advocate hardening : idempotency + seed_hash + scoring_quality propagation)
research-strategist         v8+  (F7a retry si <50% hints)
rubric-architect            v12+ (5 normalizers defense-in-depth + scoring_prompt auto-pad/truncate)
llm-score-batch             v8+  (scoring_failed flag + scoring_quality + max_tokens reasoning models)
signal-synthesizer          v19+ (F3 best-effort + auto-truncate key_signals_supporting)
quality-auditor             v7+  (F3 best-effort + verdict deepen V1)
dispatch-llm                v7+  (compat reasoning models : fallback reasoning_content si content vide)
topics-of-interest          v3   (CRUD x-api-key)
topics-search               v3   (match cosine + lookup archive)
watchlist-tick              v3   (worker 2 phases START + FINALIZE)
```

### Pipeline veille Kairos historique

```
digest                      v5+ (PDB prompt + footnotes auto-inject + language override)
backtest-rubric             v1 (Wave 9.2 dry-run)
scraper-x / reddit / arxiv  v3+ (dedup external_id)
scraper-rss                 v1 (RSS 2.0 + Atom 1.0)
topic-classifier            v4
refresh-models              v4
run-pipeline                v2
purge                       v2
admin-metrics               v2
audit-log helpers           multiple
invite-member / accept-invitation / remove-member  v2
validate-api-key            v2
provision-isolated-tenant   v2
stripe-webhook              v2
record-usage / record-health-check  v2
create-checkout-session     v2
health                      v2
minio-init                  v1 (Wave 11 init bucket)
create-public-share         v1 (Wave 11)
run-admin-prompt            v2
enrich-signal / suggest-personas / cluster-signals / compute-reputation  v1 (Wave 10A)
```

---

## 7. À faire (urgent / non-bloquant)

### Urgent

1. **Rotater 4 credentials leakés dans le chat** : service_role Supabase, anon, Coolify token, MinIO secrets — procédure 15min dans memory `a3_credentials_rotation_runbook.md`. Non automatisable par Claude faute de PAT. **Toujours pas fait au 2026-05-22.**
2. **Provisionner clé DashScope Singapore** + set `DASHSCOPE_API_KEY` secret + insert dans `user_api_keys` provider='dashscope' pour proxy_user — débloque smoke test watchlist (cf. memory `watchlist_mission_handoff.md`).
3. **Set cron secret côté DB** : `SELECT vault.create_secret('<value from /tmp/watchlist_secret.env>', 'watchlist_cron_secret')` — débloque cron `watchlist_tick_hourly`.
4. **Configurer Stripe** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICES_CATALOG` (script `stripe-bootstrap.ts`).
5. **Re-trigger run-pipeline** pour rétablir les 148 signaux X — nécessite d'abord setter `APIFY_TOKEN` + `OPENROUTER_API_KEY` via `bun x supabase secrets set` (dans `/c/temp/kairos-hotfix`).

### Recommandé (optionnel)

6. **User Settings UI** : passer `model_config.scoring.model` et `model_config.enrichment.model` de `deepseek-v4-flash` (reasoning) à `deepseek-chat` (classique) → latence 3-5× moindre sur pipeline Bassira, même clé API DeepSeek. Garder reasoning pour `monitoring`/`digest` où ça aide.
7. **PR + merge Wave 10A** si pas déjà fait : https://github.com/Afristrat/scrapping/pull/new/feat/wave-10A-foundation

### Non-bloquant

8. Configurer Plausible analytics (compte créé + uncomment `index.html`) OU laisser tel quel
9. Wave 10 Phase C-E (21 stories) — async enrichment + Neo4j shadow + Neo4j active
10. Wave 11 TODO : OG meta tags dynamiques, Email HTML Resend, Slack webhook, Branding org PDF
11. **V2 hardening Bassira** : (a) iterative deepening US-K08 si verdict='deepen', (b) webhook alerte externe (Slack/email) au lieu de seul `logs` table, (c) cost cap budget par session, (d) détection prompt injection sémantique dans research-strategist (coût LLM additionnel)

---

## 8. Comment reprendre

### Setup local

```bash
# Worktree fonctionnel (jamais OneDrive direct si SearchIndexer lock)
cd /c/temp/kairos-hotfix
git pull origin main
bun install

# Dev server
bun dev   # http://localhost:5173
```

### Tests

```bash
bun x tsc -b --noEmit
bun x eslint . --max-warnings 0
bun x vitest run
# Pipeline Bassira (Deno tests)
deno test --allow-all --no-check supabase/functions/rubric-architect/
deno test --allow-all --no-check supabase/functions/llm-score-batch/
deno test --allow-all --no-check supabase/functions/research-from-seed/
```

### Deploy edge fns pipeline Bassira (`--no-verify-jwt` obligatoire)

```bash
cd /c/temp/kairos-hotfix
bunx supabase db push --include-all  # applique les migrations
bunx supabase functions deploy rubric-architect    --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
bunx supabase functions deploy llm-score-batch     --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
bunx supabase functions deploy research-from-seed  --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
bunx supabase functions deploy dispatch-llm        --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
bunx supabase functions deploy signal-synthesizer  --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
bunx supabase functions deploy quality-auditor     --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
bunx supabase functions deploy research-strategist --no-verify-jwt --project-ref crplceoptyeslqyfcqvj
```

### Smoke test Bassira post-deploy

```bash
API_KEY="bsr_7123800c10cf61ef4f3a116ae2e8a544"
IDEMP="smoke-$(date +%s)"
SEED="Phrase de seed >= 50 caractères pour passer la validation côté Kairos."

curl -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -H "Origin: https://prospectives.ai-mpower.com" \
  "https://crplceoptyeslqyfcqvj.supabase.co/functions/v1/research-from-seed" \
  -d "{\"seed\":\"$SEED\",\"lang\":\"fr\",\"idempotency_key\":\"$IDEMP\"}"

# Attendu : 202 { session_id, status: 'running', message: 'Pipeline started. Poll GET ...' }
# Replay même idempotency_key → 200 { session_id same, idempotent: true }
```

### Deploy Coolify (manuel via API token)

```bash
TOKEN="..."  # cf. memory/coolify_infra.md
APP="jhg5pwiyul9r992k8qg2lkx6"
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://coolify.ai-mpower.com/api/v1/deploy?uuid=$APP&force=true"
```

### Spawn ralph-loop pour Wave 10 Phase C-E

Voir `docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md` pour le détail des stories restantes (21 sur 5 sous-vagues). Le PRD recommande :

- 1 worktree par phase (`/c/temp/kairos-w10C`)
- Branche dédiée (`feat/wave-10C-async-enrichment`)
- Sonnet 4.6 par défaut, Haiku 4.5 pour stories triviales
- JAMAIS Opus

---

## 9. Conventions importantes

- Worktree de travail toujours `/c/temp/kairos-hotfix`, jamais OneDrive direct (lock SearchIndexer Windows)
- Migrations versionnées `YYYYMMDDHHMMSS_description.sql`, RLS sur toutes nouvelles tables
- **Toutes les edge fns du pipeline Bassira DOIVENT être déployées `--no-verify-jwt`** — sinon 401 `UNAUTHORIZED_NO_AUTH_HEADER` masqué en `KAIROS_INVALID_KEY` 502 côté MiroShark (memory `feedback_supabase_no_verify_jwt.md`)
- **BYOK suprême — jamais changer le modèle LLM** (memory `feedback_byok_suprem.md`). Le modèle est choisi par l'user via `settings.model_config`. Fix le pipeline, pas le modèle.
- **`logs.org_id` est nullable depuis 2026-05-18** (migration 20260518000002). Tous les inserts d'observabilité depuis edge fns ad_hoc en dépendent. Ne pas remettre `NOT NULL`.
- **pgcrypto vit dans le schema `extensions`** sur Supabase Cloud. Qualifier `extensions.digest(...)` dans les migrations qui en font usage (sinon ERROR 42883).
- Modèles agents ralph-loop : Sonnet 4.6 par défaut, Haiku 4.5 pour stories triviales, **JAMAIS Opus** (cost prohibitif)
- Toujours `bun x supabase` (pas `npx`) — projet déjà link dans `/c/temp/kairos-hotfix`
- Toute migration → regen `src/types/database.ts` via `bun x supabase gen types typescript --project-id crplceoptyeslqyfcqvj > src/types/database.ts`
- Texte FR : accents OBLIGATOIRES partout (incluant majuscules — É À Ç). Aucune substitution ASCII.
- Pas de tolérance « non bloquant » — chaque erreur TS/lint corrigée à la racine.
- **`supabase.rpc()` jamais détaché en variable** (memory `feedback_supabase_rpc_pattern.md`) — perd le `this`, casse silencieusement.
- **Idempotency Bassira** : si Bassira retry réseau, passer le même `idempotency_key` (1-64 chars `[A-Za-z0-9_-]`) pour dedup côté Kairos. Index unique partiel `(api_key_id, idempotency_key)` garantit l'unicité.

---

_Mis à jour 2026-05-22 (session devil-advocate Bassira→Kairos hardening). Authoritative à `.ralph/prd.json` pour le détail US et à `docs/bassira-kairos-devil-advocate.md` pour le pipeline Bassira._
