# HANDOFF — Kairos (anciennement theresa-scrap / zlatan-scrap)

> **Date** : 2026-05-03 (MAJ session 2)
> **État global** : production stable sur `https://scrap.ai-mpower.com`. Wave 1-9.2 + Sprint 0 + Wave 11 (4 stories) + **Wave 10A (10 stories)** livrées. Wave 10A sur branche `feat/wave-10A-foundation` — prête pour PR + merge. Wave 10B-E à venir (27 stories restantes).

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
- `MEMORY.md` — index des mémoires

---

## 1. État du code

### HEAD courant

```
main = 2ab33df fix(pdf): retire fontStyle italic non-supporte
       (synchronisé avec feat/topic-tracking-minio)
```

### Stack

- **Frontend** : React 19 + Vite 8 + TypeScript strict + Tailwind v4 + shadcn/ui (Radix), Material You design system
- **Backend** : Supabase Postgres + Auth + Edge Functions Deno + Storage + pg_cron
- **LLM** : BYOK 10 providers (OpenRouter, Anthropic, OpenAI, Mistral, Groq, Together, DeepSeek, Moonshot, Google, Ollama). DeepSeek V4 Flash modèle digest actif chez le founder.
- **Sources** : X (Apify `apidojo/twitter-list-scraper`), Reddit (Apify `automation-lab/reddit-scraper`), arXiv (API officielle directe)
- **Storage** : MinIO (`zlatan-scrap-topics` bucket, lifecycle 100j) pour topic tracking 90j
- **Deploy** : Coolify auto-deploy sur push `feat/topic-tracking-minio`

### Quality gates au dernier commit

```bash
bun x tsc -b --noEmit              # 0 erreur
bun x eslint . --max-warnings 0    # 0 warning
bun x vitest run                   # 181/181 tests
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

## 3. User Stories — état complet (90 total trackées)

| Wave                | Stories | Statut             | Détail                                                                                                                                                                                                        |
| ------------------- | ------: | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1**          |       6 | ✅ Livré           | Refactor BYOK, dispatch-llm, llm_providers, lint/CI, code-splitting                                                                                                                                           |
| **Wave 1.5**        |       1 | ✅ Livré           | Fix bug rescoring + extract body 5xx                                                                                                                                                                          |
| **Wave 2**          |       3 | ✅ Livré           | Topic tracking 90j (Welford z-score + MinIO)                                                                                                                                                                  |
| **Wave 4**          |       2 | ✅ Livré           | Tests cascade Deno + `{{run:<kind>}}` engine                                                                                                                                                                  |
| **Wave 5**          |       5 | ✅ Livré           | DashDelete + ScoreZero + Landing + LandingContent v2 + MoatHunter                                                                                                                                             |
| **Wave 6**          |      22 | ✅ Livré           | Multi-tenant complet (orgs, members, RLS rewrite, Stripe billing 12 SKUs, configurateur, BYOK validation, audit log, AdminCockpit, CSM, self-host)                                                            |
| **Wave 7**          |       — | ✅ Livré           | Re-skin Material You complet (5 sous-vagues design tokens)                                                                                                                                                    |
| **Wave 8**          |       — | ✅ Livré           | Currency picker + domain admin + GitHub removal                                                                                                                                                               |
| **Wave 9.1**        |       5 | ✅ Livré           | Multi-LLM consensus scoring (`score_runs` + `consensus_models` + `ConsensusBadge`) — commit `bceeb73` merge                                                                                                   |
| **Wave 9.2**        |       5 | ✅ Livré           | Backtest des grilles de scoring (edge fn dry-run + page `/settings/rubrics/backtest` + `BacktestComparator`) — commit `de10d23` merge                                                                         |
| **Sprint 0**        |       6 | ✅ Livré           | 6 boutons distribution sur footer Digest (Copier md / Email mailto / Tweet / LinkedIn / Télécharger md / PDF basique) — commit `f7aaef6`                                                                      |
| **Wave 9.3**        |       6 | ❄️ **Freeze**      | Negative signal propagation → migré dans Phase C Wave 10 (clustering + signal_flags)                                                                                                                          |
| **Wave 9.4**        |       5 | ❄️ **Freeze**      | Cross-source corroboration → migré dans Phase C Wave 10 (cluster-signals embeddings)                                                                                                                          |
| **Wave 9.5**        |       5 | ❄️ **Freeze**      | Author Reputation Layer → migré dans Phase C Wave 10 (compute-reputation entities)                                                                                                                            |
| **Wave 10.A**       |      10 | ✅ Livré (branche) | Foundation Postgres + Taxonomie PARA — 5 migrations + seed 40 topics + UI CRUD + edge fn enrich-signal + suggest-personas + trigger llm-score-batch. Branche `feat/wave-10A-foundation`, 195 tests, 0 erreur. |
| **Wave 10.B**       |       6 | 📋 Planifié        | Vues filtrables + /digest contextualisé (Dashboard filtres + /explorer + scope params)                                                                                                                        |
| **Wave 10.C**       |       7 | 📋 Planifié        | Async enrichment + queue résiliente (NER + reputation + clustering + weight composite + /admin/queue)                                                                                                         |
| **Wave 10.D**       |       6 | 📋 Planifié        | Neo4j shadow mode (provisioning + push async + backfill + health + backup)                                                                                                                                    |
| **Wave 10.E**       |       8 | 📋 Planifié        | Neo4j active + commandes /slash (queryWithFallback + /brief @persona + /presentation + /recap + /explorer graph + annotations + GraphQL + lien public OG)                                                     |
| **Wave 11 (livré)** |       4 | ✅ Livré partiel   | PDF brandé sélectionnable + lien public `/share/:slug` + sélecteur langue + header brief enrichi                                                                                                              |
| **Wave 11 TODO**    |       — | 📋 Planifié        | OG meta tags dynamiques + Email HTML Resend + Slack webhook + Branding org PDF                                                                                                                                |

**Total** : 90 stories trackées dans `.ralph/prd.json` (réf authoritative).

---

## 4. Bugs critiques résolus (session 2026-05-03)

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

## 5. Edge Functions actives (28 deployées)

```
digest                      v5+ (PDB prompt + footnotes auto-inject + language override)
llm-score-batch             v6+ (consensus N modèles + dedup OPTIONS fix)
backtest-rubric             v1 (Wave 9.2 dry-run)
scraper-x / reddit / arxiv  v3+ (dedup external_id)
topic-classifier            v4
dispatch-llm                v5
refresh-models              v4
run-pipeline                v2
purge                       v2
admin-metrics               v2
audit-log helpers           multiple
invite-member               v2
accept-invitation           v2
remove-member               v2
validate-api-key            v2
provision-isolated-tenant   v2
stripe-webhook              v2
record-usage                v2
record-health-check         v2
create-checkout-session     v2
health                      v2
minio-init                  v1 (Wave 11 init bucket)
create-public-share         v1 (Wave 11)
run-admin-prompt            v2
```

---

## 6. À faire (urgent / non-bloquant)

### Urgent

1. **Rotater 4 credentials leakés dans le chat** : service_role Supabase, anon, Coolify token, MinIO secrets (**toujours pas fait**)
2. **Configurer Stripe** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICES_CATALOG` (script `stripe-bootstrap.ts`)
3. **Re-trigger run-pipeline** pour rétablir les 148 signaux X — nécessite d'abord setter `APIFY_TOKEN` + `OPENROUTER_API_KEY` via `bun x supabase secrets set` (dans `/c/temp/kairos-hotfix`)
4. **PR + merge Wave 10A** : branche `feat/wave-10A-foundation` prête → https://github.com/Afristrat/scrapping/pull/new/feat/wave-10A-foundation

### Non-bloquant

4. Configurer Plausible analytics (compte créé + uncomment `index.html`) OU laisser tel quel
5. Wave 10 Phase A (10 stories) — premier dispatch de la roadmap Second Cerveau
6. Wave 11 TODO : OG meta tags dynamiques, Email HTML Resend, Slack webhook, Branding org PDF

---

## 7. Comment reprendre

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
```

### Deploy Coolify (manuel via API token)

```bash
TOKEN="..."  # cf. memory/coolify_infra.md
APP="jhg5pwiyul9r992k8qg2lkx6"
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://coolify.ai-mpower.com/api/v1/deploy?uuid=$APP&force=true"
```

### Spawn ralph-loop pour Wave 10 Phase A

Voir `docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md` pour le détail des 10 stories Phase A. Le PRD recommande :

- 1 worktree par phase (`/c/temp/kairos-w10A`)
- Branche dédiée (`feat/wave-10A-foundation`)
- Sonnet 4.6 par défaut, Haiku 4.5 pour stories triviales
- JAMAIS Opus

---

## 8. Conventions importantes

- Worktree de travail toujours `/c/temp/kairos-hotfix`, jamais OneDrive direct
- Migrations versionnées `YYYYMMDDHHMMSS_description.sql`, RLS sur toutes nouvelles tables
- Modèles agents ralph-loop : Sonnet 4.6 par défaut, Haiku 4.5 pour stories triviales, **JAMAIS Opus** (cost prohibitif)
- Toujours `bun x supabase` (pas `npx`) — projet déjà link dans `/c/temp/kairos-hotfix`
- Toute migration → regen `src/types/database.ts` via `bun x supabase gen types typescript --project-id crplceoptyeslqyfcqvj > src/types/database.ts`
- Texte FR : accents OBLIGATOIRES partout (incluant majuscules — É À Ç). Aucune substitution ASCII.
- Pas de tolérance « non bloquant » — chaque erreur TS/lint corrigée à la racine.

---

_Mis à jour 2026-05-03. Authoritative à `.ralph/prd.json` pour le détail US._
