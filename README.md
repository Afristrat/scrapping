# theresa-scrap

> Veille IA automatisée, scorée par LLM, **personnalisable de bout en bout**.
> X (Twitter) via Apify · Reddit via Apify · ArXiv via API officielle · 10 providers LLM (BYOK).

Chaque utilisateur a sa propre instance, ses propres clés API, ses propres grilles de scoring, ses propres sources prioritaires, ses propres prompts admin. Aucun compte mutualisé, aucune fuite de données : 1 fork = 1 base Supabase = 1 user maître.

**Au-delà du scoring** : digest 80/20 multi-langue (FR/EN/ES), suivi de topics émergents sur fenêtre glissante 90 j (MinIO + z-score Welford), prompts admin éditables avec **cascade automatique** entre sources (`{{run:reddit}}` → exécute le prompt reddit puis injecte sa sortie dans le synthesis).

---

## Sommaire

1. [À quoi ça sert](#1-à-quoi-ça-sert)
2. [Comment ça marche](#2-comment-ça-marche)
3. [Stack technique](#3-stack-technique)
4. [Démarrer en 10 minutes](#4-démarrer-en-10-minutes)
5. [Configuration utilisateur](#5-configuration-utilisateur) (6 onglets dont Admin prompts)
6. [Sources de veille](#6-sources-de-veille)
7. [Coûts attendus](#7-coûts-attendus)
8. [Comment ça peut être rentable](#8-comment-ça-peut-être-rentable)
9. [Structure du repo](#9-structure-du-repo)
10. [FAQ débutant](#10-faq-débutant)

---

## 1. À quoi ça sert

**Problème** : tu veux faire de la veille sur l'IA mais tu te noies dans X, Reddit, ArXiv. 90 % du contenu est du bruit, 10 % est utile, et tu n'as pas le temps de filtrer.

**Solution** : `theresa-scrap` :

1. **Scrape** automatiquement les sources qui t'intéressent (listes X, subreddits, catégories ArXiv).
2. **Score** chaque signal de 0 à 100 avec un LLM, selon une grille que **tu définis** (innovation, actionable, crédibilité, etc.).
3. **Affiche** les meilleurs signaux dans un dashboard où tu filtres par score, période, source.
4. **Synthétise** chaque jour un brief 80/20 dans ta langue (FR/EN/ES) à partir des signaux scorés.
5. **Détecte** les topics émergents sur 90 jours glissants (z-score Welford + persistance MinIO).
6. **Compose** des analyses transversales via prompts admin éditables avec cascade `{{run:<source>}}`.
7. **Trace** chaque coût (tokens LLM + Apify) avec budget guard journalier.

Tu te réveilles le matin, tu vois les 20 meilleurs signaux des dernières 24 h, scorés selon **ta** définition de « pertinent ». Pas celle d'un algorithme générique.

---

## 2. Comment ça marche

```
┌─────────────────────────────────────────────────────────────┐
│  USER : tu cliques "Run Pipeline" (ou un cron pg_cron)      │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Edge Function : run-pipeline                               │
│  Lit tes settings, déclenche les 3 scrapers en parallèle    │
└────────┬───────────────┬───────────────┬────────────────────┘
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Apify X  │    │  Apify   │    │  ArXiv   │
   │  (list)  │    │  Reddit  │    │   API    │
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        └───────────────┴───────────────┘
                        │
                        ▼
        ┌────────────────────────────────┐
        │  Table signals (Postgres RLS)  │
        │  Une row par tweet/post/paper  │
        └────────────────┬───────────────┘
                         ▼
        ┌─────────────────────────────────────────────┐
        │  Edge Function : llm-score-batch            │
        │  - lit la grille de scoring active          │
        │  - appelle dispatch-llm (10 providers BYOK) │
        │  - background via EdgeRuntime.waitUntil     │
        │  - écrit score + coût                       │
        └────────────────┬────────────────────────────┘
                         ▼
        ┌─────────────────────────────────────────────────┐
        │  Tables scores + llm_costs                      │
        └────────┬───────────────────────┬────────────────┘
                 ▼                       ▼
   ┌──────────────────────┐   ┌──────────────────────────┐
   │  Edge fn : digest    │   │  Edge fn :               │
   │  brief 80/20 multi-  │   │  topic-classifier        │
   │  langue (FR/EN/ES)   │   │  z-score Welford →       │
   │                      │   │  topics + MinIO 90 j     │
   └──────────┬───────────┘   └────────────┬─────────────┘
              ▼                            ▼
         ┌─────────────────────────────────────────┐
         │  Edge fn : run-admin-prompt             │
         │  Templates avec cascade {{run:<kind>}}  │
         │  → reddit + arxiv + x → synthesis       │
         └────────────────────┬────────────────────┘
                              ▼
         ┌─────────────────────────────────────────┐
         │  Dashboard React (toi)                  │
         │  7 pages : Dashboard, Digest, Topics,   │
         │  Costs, Logs, Settings (6 onglets),     │
         │  Login/Signup                           │
         └─────────────────────────────────────────┘
```

**4 idées clés** :

- **RLS partout** : grâce à Supabase Row Level Security, chaque user ne voit QUE ses propres données. Tu peux héberger une instance partagée à plusieurs users sans aucune fuite.
- **BYOK 10 providers** : OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama. Tu mets TES clés dans l'onglet `Paramètres → Clés API`. Stockées en DB (RLS-protégé), lues uniquement par les Edge Functions via le helper `_shared/api-keys.ts`. Le routeur unique `dispatch-llm` choisit le bon provider selon la tâche.
- **Grilles de scoring custom** : tu peux créer plusieurs rubriques (ex : « veille technique builder », « veille macro CEO », « veille RH IA »), chacune avec ses critères pondérés. Tu actives celle que tu veux selon ton mood.
- **Prompts admin avec cascade** : 4 prompts seed (Reddit / arXiv / X / Synthesis) éditables. Le synthesis peut référencer `{{run:reddit}}`, `{{run:arxiv}}`, `{{run:x}}` — la cascade exécute automatiquement chaque source avant la synthèse (opt-in via `compose_chain: true`, garde-fous profondeur + cycle).

---

## 3. Stack technique

| Couche                    | Outil                                                                                      | Pourquoi                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Frontend                  | React 19 + Vite 8 + TypeScript strict                                                      | SPA légère, pas besoin de SSR                                             |
| Style                     | Tailwind v4 + shadcn/ui (Radix UI primitives)                                              | Composants accessibles + customisables                                    |
| Routing                   | react-router-dom v7                                                                        | SPA classique                                                             |
| Data client               | TanStack Query v5                                                                          | Cache + invalidation propre                                               |
| State auth                | Zustand                                                                                    | Session + user simple                                                     |
| Forms                     | react-hook-form + zod                                                                      | Validation typée                                                          |
| Charts                    | Recharts                                                                                   | Coûts et tendances                                                        |
| Markdown                  | react-markdown                                                                             | Rendu digest + admin runs                                                 |
| Backend                   | Supabase (Postgres 17 + Auth + Edge Functions Deno + Storage + pg_cron)                    | Tout-en-un, free tier suffisant pour 1 user                               |
| LLM router                | `dispatch-llm` edge fn unique                                                              | Route vers 10 providers selon `task` (scoring/scraping/monitoring/digest) |
| LLM providers             | OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama | BYOK : chaque user choisit                                                |
| Scrap X                   | Apify `apidojo/twitter-list-scraper`                                                       | Liste X dédiée, $0,0004/tweet                                             |
| Scrap Reddit              | Apify `automation-lab/reddit-scraper`                                                      | Le moins cher des actors stables (~$0,001/post)                           |
| Scrap ArXiv               | API officielle ArXiv                                                                       | Gratuite, 1 req / 3 s                                                     |
| Topic tracking            | MinIO (S3-compatible) + Welford z-score                                                    | Fenêtre glissante 90 j + détection émergence                              |
| Auth                      | Magic link + password + Google OAuth                                                       | Multi-méthodes                                                            |
| Runtime / package manager | bun (recommandé) ou npm `--legacy-peer-deps`                                               | React 19 peer deps strict                                                 |
| Tests                     | Vitest 4 + React Testing Library + jsdom · Deno test pour edge fns                         | Unitaires + composants + edge logic                                       |
| Lint / format             | ESLint (max-warnings 0) + Prettier + Husky + lint-staged                                   | Hooks pre-commit                                                          |

**Pas Next.js** : volontaire. Le projet n'a pas besoin de SSR ni de routing serveur. Vite + Edge Functions Supabase = stack plus simple, moins de dépendances, build plus rapide.

---

## 4. Démarrer en 10 minutes

> Pré-requis : `bun` installé (https://bun.sh), un compte GitHub, un compte Supabase gratuit.

### Étape 1 — Cloner et installer

```bash
git clone git@github.com:<ton-user>/theresa-scrap.git
cd theresa-scrap
bun install
```

### Étape 2 — Créer ton projet Supabase

1. Va sur https://supabase.com → **New project**.
2. Note l'URL et la **anon key** (Settings → API).
3. Copie le template `.env.example` :
   ```bash
   cp .env.example .env.local
   ```
4. Renseigne `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env.local`.

### Étape 3 — Appliquer les migrations DB

```bash
bunx supabase login
bunx supabase link --project-ref <ton-project-ref>   # le bout de l'URL Supabase
bunx supabase db push                                 # applique les 17 migrations
```

Les migrations créent (entre autres) :

- Cœur veille : `signals`, `scores`, `logs`, `llm_costs`, `settings`, `user_api_keys`, `scoring_rubrics` + RLS + trigger d'init au signup
- Digest : `digests`
- BYOK routeur : `llm_providers`, `provider_models` (tarifs dynamiques)
- Topic tracking : `topics`, `topic_runs`, `topic_signals`, `pending_minio_writes` (queue eventual consistency)
- Admin prompts : `admin_prompts` + `admin_prompt_runs` + trigger `seed_admin_prompts_on_user_creation` (4 prompts seed auto par user : Reddit / arXiv / X / Synthesis)

### Étape 4 — Déployer les Edge Functions

```bash
bunx supabase functions deploy   # déploie les 11 edge functions
```

Liste actuelle :

| Fonction                                         | Rôle                                                          |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `run-pipeline`                                   | Orchestrateur scrape → signals (background scoring)           |
| `scraper-x` / `scraper-reddit` / `scraper-arxiv` | 3 sources, parallèles                                         |
| `llm-score-batch`                                | Scoring en background (`EdgeRuntime.waitUntil`)               |
| `dispatch-llm`                                   | Routeur LLM unique (10 providers, task-aware)                 |
| `digest`                                         | Brief 80/20 multi-langue cross-source                         |
| `topic-classifier`                               | Welford z-score + persistance MinIO                           |
| `run-admin-prompt`                               | Templates admin avec cascade `{{run:<kind>}}`                 |
| `refresh-models`                                 | Rafraîchit les listes de modèles par provider                 |
| `purge`                                          | Supprime les signaux user (et options : logs, costs, digests) |

Set tes secrets fallback (optionnel — chaque user peut configurer les siens via UI) :

```bash
bunx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
bunx supabase secrets set APIFY_TOKEN=apify_api_...
# pour le topic tracking (sinon les writes restent en queue) :
bunx supabase secrets set MINIO_ENDPOINT=https://...
bunx supabase secrets set MINIO_ACCESS_KEY=...
bunx supabase secrets set MINIO_SECRET_KEY=...
bunx supabase secrets set MINIO_BUCKET=zlatan-scrap-topics
```

### Étape 5 — Lancer en local

```bash
bun dev    # http://localhost:5173
```

Login via magic link (mail → Inbucket en local ou ta boîte en prod), password, ou Google OAuth (page `/signup` pour créer un compte).

Dans `Paramètres → Clés API`, ajoute au minimum :

- Ta **clé OpenRouter** (https://openrouter.ai/keys, gratuit avec quelques crédits) — recommandé par défaut
- Ton **token Apify** (https://console.apify.com/account/integrations, ~5 $ de crédits gratuits/mois)

Optionnel : ajoute aussi tes clés Anthropic, OpenAI, Google, Mistral, etc. pour pouvoir choisir un provider direct par tâche dans `Paramètres → Modèles`.

Va dans **Dashboard**, clique **Run pipeline**. Tu verras les signaux apparaître au bout d'1-2 minutes (le scoring tourne en background).

### Étape 6 — Déployer en prod

**Option A — Vercel (le plus simple)**

```bash
bun add -g vercel
vercel deploy --prod
```

Configure les mêmes variables d'env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

**Option B — Coolify (self-host avec Cloudflare Tunnel)**

Le repo inclut un `Dockerfile` multi-stage (`node:20-alpine` build → `nginx:alpine` serve). Fork-friendly :

1. Crée une app Coolify pointant sur ton fork GitHub
2. Build via Dockerfile, port `80`
3. Tunnel Cloudflare (cf. `docs/architecture.md`) pour exposer `https://scrap.<ton-domaine>` sans ouvrir de port

Pas besoin de Vercel ni de cloud managé.

---

## 5. Configuration utilisateur

Tout est dans **Paramètres** (6 onglets) :

### 5.1 Modèles

4 cascades par tâche : `scraping`, `scoring`, `monitoring`, `digest`. Pour chacune, tu choisis :

1. **Provider** (10 disponibles : OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama)
2. **Modèle** (liste rafraîchie via edge fn `refresh-models`, auto-update à la sauvegarde)

Recommandé par défaut :

- Scoring : `anthropic/claude-haiku-4.5` (rapide, ~$0,001 / 1K tokens, qualité suffisante)
- Digest / Monitoring : `openrouter/auto` (laisse OpenRouter choisir)
- Fallback global : `openrouter/auto` si rien de configuré

### 5.2 Grilles de scoring

CRUD complet. Une rubrique = un nom + un prompt + N critères pondérés. Exemple :

| Critère                  | Poids |
| ------------------------ | ----- |
| Innovation technique     | 0.40  |
| Actionable cette semaine | 0.30  |
| Crédibilité de la source | 0.30  |

Tu peux avoir N rubriques, en marquer 1 active (`is_default`). Le LLM utilise la rubrique active pour scorer.

### 5.3 Sources

- **Reddit subs** : liste des subreddits à scraper (TagInput).
- **ArXiv catégories** : `cs.AI`, `cs.LG`, `cs.CL`, etc.
- **X queries** : utilisé en fallback si pas de liste.
- **Apify config** :
  - `x_list_ids` : IDs des listes X à scraper (par défaut `2049788531178926529` = veille IA core).
  - `reddit_actor`, `reddit_sort`, `reddit_time_filter`, `reddit_max_per_sub`.
- **Priorité des sources** : 3 sliders (reddit, arxiv, x) qui pondèrent l'importance dans le ranking final.

### 5.4 Clés API

10 providers BYOK + Apify :

- Input password par provider, save → stocké en DB (`user_api_keys`, RLS-protégée). Affichage masked seulement (`sk-or-v1...abcd`).
- Tu peux supprimer une clé à tout moment.
- Si pas de clé user, fallback sur les secrets projet (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, …) — pratique pour démo.

### 5.5 Admin prompts (cascade `{{run:<kind>}}`)

4 prompts seed à l'inscription (Reddit / arXiv / X / Synthesis) + tu peux en créer d'autres. Pour chaque prompt :

- **Édition** : system prompt + user template + filtre source (sources, fenêtre, score min, max count) + Live Preview des variables substituées
- **Variables supportées** : `{{signals}}`, `{{signals_block}}`, `{{language}}`, `{{date}}`, `{{topics_emerging}}`, `{{rubric}}`, `{{run:<task_kind>}}`
- **Run** : Cost Guard avant exécution (estimation tokens × tarif provider, blocage si dépasse `daily_budget_usd`)
- **Cascade** : si le template référence `{{run:reddit}}` ou `{{run:arxiv}}`, l'option « Composer la chaîne » exécute automatiquement les prompts dépendants juste avant. Garde-fous : profondeur max 3, détection cycle, fraîcheur cached `< max_age_hours` (default 6 h)
- **History** : N derniers runs avec output markdown, modèle utilisé, coût, status

### 5.6 Branding & budget

- Nom personnalisé, couleur primaire, logo (uploadé dans bucket `branding`)
- Budget journalier : `daily_budget_usd`. Si dépassé, `BudgetGuardDialog` apparaît avant chaque run admin (forçage possible avec log d'override)
- Concurrency scoring : `score_concurrency` (default 8)

---

## 6. Sources de veille

La référence complète est dans `specs/SOURCES.md` (192 handles X + 35 subreddits + 8 catégories ArXiv).

**Liste X par défaut** : `2049788531178926529` (192 comptes IA répartis Tier 1 anglo / Tier 2 Chine / Tier 3 Russie+Ukraine / Tier 4 Corée+Japon+Israël).

**Subreddits par défaut** (subset Tier S + A + B) :

```
MachineLearning, LocalLLaMA, AI_Agents, ClaudeAI, ClaudeCode,
ChatGPTCoding, vibecoding, OpenAI, PromptEngineering,
StableDiffusion, deeplearning, LLMDevs, MLOps, artificial,
ArtificialIntelligence, singularity, hardware, nvidia
```

**ArXiv catégories par défaut** :

```
cs.AI, cs.LG, cs.CL, cs.CV, cs.MA, stat.ML
```

Tu peux modifier tout ça dans `Paramètres → Sources`.

---

## 7. Coûts attendus

Pour un user actif (1 run pipeline / jour, ~200 signaux scorés) :

| Poste                             | Volume / jour              | Coût / jour | Coût / mois |
| --------------------------------- | -------------------------- | ----------- | ----------- |
| Apify X (list scraper)            | 100 tweets + 1 query       | ~$0.05      | ~$1.5       |
| Apify Reddit (18 subs × 25 posts) | ~450 posts + 1 run         | ~$0.45      | ~$13.5      |
| ArXiv (gratuit)                   | 6 catégories × 25 papers   | $0          | $0          |
| OpenRouter scoring (Haiku 4.5)    | ~700 signaux × ~150 tokens | ~$0.10      | ~$3         |
| Supabase free tier                | 500 MB DB, 2GB egress      | $0          | $0          |
| **Total**                         |                            | **~$0.60**  | **~$18**    |

Tout ça est trackable dans la page **Costs** (par jour / par modèle / par tâche).

> Astuce : passe `reddit_max_per_sub` à 10 et tu divises ton coût Reddit par 2.5.

---

## 8. Comment ça peut être rentable

`theresa-scrap` n'est PAS un produit à vendre. C'est un **outil de levier**. Voici comment il peut générer du ROI :

### Pour un solo créateur de contenu IA

- 30 minutes / jour de veille manuelle = 15h / mois
- Le pipeline scoré t'amène les top 20 signaux en 5 minutes
- Gain : **~13h / mois** = 1 vidéo YouTube de plus / mois = potentiellement 100-1000€ AdSense / mois selon ta chaîne

### Pour un consultant / formateur IA

- Un cours / une formation à jour = un cours qui se vend
- Les signaux ArXiv + X t'amènent les vrais breakthroughs avant qu'ils soient sur LinkedIn
- Tu peux pricer ta formation 30% plus cher si elle inclut les 5 derniers papers du mois

### Pour une équipe interne

- Pose `theresa-scrap` sur un Slack via webhook (à coder dans une edge function `notify`)
- Chaque matin, le top 5 score >80 est posté dans #veille-ia
- Économie : **~5h / semaine** × 5 personnes = 25h / semaine

### Pour vendre une newsletter

- Pipeline → top 10 signaux scorés → LLM réécriture en newsletter (encore une edge function)
- Tu publies sur Substack 5 jours / semaine sans y penser
- Une newsletter à 1000 abonnés payants × 5€ / mois = 5000€ / mois de revenus passifs

**Le pattern de fond** : tu transformes du temps de veille (chronophage, low-leverage) en signal qualifié (high-leverage, vendable).

---

## 9. Structure du repo

```
theresa-scrap/
├── README.md                    ← tu es ici
├── CLAUDE.md                    ← contexte agent IA (conventions projet)
├── AGENTS.md                    ← contexte universel agents (Claude/Cursor/Aider/Copilot)
├── HANDOFF.md                   ← pointer vers le dernier handoff
├── PASSATION.md                 ← steno session courante
├── Dockerfile                   ← build multi-stage (node:20-alpine → nginx:alpine)
├── nginx.conf                   ← SPA fallback
├── package.json                 ← deps + scripts (bun ou npm --legacy-peer-deps)
├── bun.lock                     ← lockfile bun
├── deno.lock                    ← lockfile Deno (edge functions)
├── .npmrc                       ← force --legacy-peer-deps (React 19)
├── .env.example                 ← template variables
├── index.html, vite.config.ts, vitest.config.ts, tsconfig*.json, eslint.config.js, components.json
│
├── .ralph/                      ← workflow Ralph Loop (PRD + run history)
│   ├── prd.json
│   └── progress.md
│
├── docs/                        ← documentation
│   ├── README.md                ← index docs
│   ├── architecture.md, api.md, database.md, security.md, conventions.md, overview.md
│   ├── architecture/adrs/       ← decisions historiques
│   └── handoffs/                ← notes de session datées
│
├── specs/                       ← references projet
│   ├── SOURCES.md               ← 192 X handles + 35 subreddits + 8 ArXiv categories
│   ├── done/                    ← specs implémentées
│   └── handoffs/                ← anciennes notes
│
├── public/                      ← assets statiques (favicon, etc.)
│
├── src/
│   ├── main.tsx, App.tsx, routes.tsx
│   │
│   ├── pages/
│   │   ├── Login.tsx            ← magic link + password + Google OAuth
│   │   ├── Signup.tsx           ← signup public
│   │   ├── Dashboard.tsx        ← table signaux + filtres + widget topics
│   │   ├── Digest.tsx           ← brief 80/20 multi-langue + slider min_score
│   │   ├── Topics.tsx           ← 4 sections trend (Émergents/Déclin/Stables/Calibrage)
│   │   ├── Settings.tsx         ← 6 onglets (Modèles/Rubriques/Sources/Clés/Admin/Branding)
│   │   ├── Costs.tsx            ← coûts par jour / modèle / tâche + tarifs DB
│   │   └── Logs.tsx             ← activité + bouton Copier par log
│   │
│   ├── components/
│   │   ├── ui/                  ← primitives shadcn
│   │   ├── layout/              ← AppLayout, Sidebar, BrandedHeader
│   │   ├── auth/                ← ProtectedRoute, AuthListener
│   │   └── features/            ← composants métier (SignalTable, RubricsManager,
│   │                              AdminPromptsConfig, ApifyConfigForm, ModelSelectField, …)
│   │
│   ├── hooks/                   ← TanStack Query hooks (useSignals, useDigest, useTopics,
│   │                              useAdminPrompts, useApiKeys, useEstimateRunCost, …)
│   ├── stores/auth.ts           ← Zustand session/user
│   ├── lib/
│   │   ├── supabase.ts          ← client browser (anon)
│   │   ├── utils.ts, source-meta.ts, openrouter-models.ts, promptPreview.ts
│   │   └── schemas/             ← schemas zod
│   ├── types/database.ts        ← types générés Supabase (regen via gen types)
│   └── test/setup.ts
│
└── supabase/
    ├── config.toml
    ├── migrations/              ← 17 SQL versionnés (init → topic-tracking → admin-prompts)
    └── functions/               ← Edge Functions Deno
        ├── _shared/             ← api-keys, errors, retry, providers, welford, minio,
        │                          unicode, filter (helpers partagés)
        ├── run-pipeline/        ← orchestrateur scrape parallèle
        ├── scraper-x/           ← Apify twitter-list-scraper
        ├── scraper-reddit/      ← Apify reddit-scraper
        ├── scraper-arxiv/       ← API officielle ArXiv
        ├── llm-score/           ← scoring 1 signal (legacy)
        ├── llm-score-batch/     ← scoring 1-30 signaux par appel (background)
        ├── dispatch-llm/        ← routeur unique BYOK 10 providers
        ├── digest/              ← brief 80/20 multi-langue
        ├── topic-classifier/    ← Welford + MinIO 90 j
        ├── refresh-models/      ← refresh listes modèles par provider
        ├── run-admin-prompt/    ← templates admin avec cascade {{run:<kind>}}
        │   ├── index.ts         ← edge fn (auth, fetch, render, dispatch)
        │   ├── compose.ts       ← resolveComposedRuns + types ComposedChainEntry
        │   ├── template.ts      ← moteur de substitution isolé
        │   └── template.test.ts ← 24 tests Deno
        └── purge/               ← suppression user signals/logs/costs/digests
```

---

## 10. FAQ débutant

**Q. C'est quoi un "edge function" ?**
R. Une fonction serverless Deno hébergée chez Supabase. Elle s'exécute à la demande, pas besoin de gérer un serveur. On l'appelle via HTTP avec un JWT user. Elle a accès à la DB avec les droits du user (RLS).

**Q. C'est quoi RLS (Row Level Security) ?**
R. Un mécanisme Postgres : chaque table a une "policy" qui dit "user X ne peut voir/modifier que les rows où user_id = X". Comme ça, même si tu héberges 5 users sur la même DB, ils sont étanches. Pas besoin de logique côté app.

**Q. Pourquoi Apify et pas l'API X officielle ?**
R. L'API X v2 Basic = $200/mois. Apify avec `apidojo/twitter-list-scraper` = $0.0004/tweet. Pour 100 tweets/jour pendant 1 mois = $1.20. Soit 166x moins cher.

**Q. Pourquoi pas l'API Reddit officielle ?**
R. Elle est gratuite mais rate-limitée à 60 req/min sans auth, 600 avec OAuth. Surtout, son rendu JSON change souvent et la stabilité long-terme est risquée. Apify avec un actor maintenu = setup une fois, oublie.

**Q. C'est quoi OpenRouter ?**
R. Un proxy unique pour appeler tous les LLMs (Anthropic, OpenAI, Google, Mistral, etc.). Tu changes de modèle en changeant 1 string. Pricing identique aux providers + petite marge. Indispensable pour A/B tester.

**Q. Pourquoi pas Next.js ?**
R. Pas de SEO besoin, pas de SSR, pas de RSC. Une SPA Vite + Supabase est plus simple, build 5x plus vite, moins de boilerplate. Si un jour le projet a besoin de SSR (ex landing publique), on extrait juste cette partie.

**Q. Comment je sauvegarde mes signaux scorés ?**
R. Tout est dans Postgres. Tu peux exporter via le Supabase Studio (SQL → CSV) ou faire une route `/api/export` (à coder).

**Q. Comment je le mets en multi-user ?**
R. C'est déjà multi-user. Tu invites des users via le panel Supabase ou via un signup public (à activer dans Auth settings). Chaque nouveau user a ses propres `settings`, `signals`, etc., grâce au trigger `init_user_settings`.

**Q. Comment je passe le pipeline en cron auto (sans clic) ?**
R. Une migration `pg_cron` est déjà en place. Tu peux ajouter un cron qui appelle `run-pipeline` toutes les N heures. Voir `supabase/migrations/20260430000003_pg_cron.sql`.

---

## Scripts npm/bun

| Commande             | Effet                                     |
| -------------------- | ----------------------------------------- |
| `bun dev`            | Vite dev server (http://localhost:5173)   |
| `bun run build`      | Production build (`tsc -b && vite build`) |
| `bun run typecheck`  | `tsc -b --noEmit`                         |
| `bun run lint`       | ESLint (max-warnings 0)                   |
| `bun run format`     | Prettier write                            |
| `bun run test`       | Vitest run once                           |
| `bun run test:watch` | Vitest watch                              |
| `bun run preview`    | Preview du build prod                     |

### Tests Deno (edge functions)

Vitest exclut `supabase/functions/**`. Pour tester les modules Deno isolés :

```bash
deno test --allow-env --node-modules-dir=auto supabase/functions/run-admin-prompt/template.test.ts
deno test --allow-env --node-modules-dir=auto supabase/functions/_shared/minio.test.ts
```

> **Note** : `--node-modules-dir=auto` crée `node_modules/.deno/` (cache Deno). Si un `tsc -b` se met à râler après un `deno test`, un `bun install` réintègre proprement.

### Supabase CLI

```bash
bunx supabase link --project-ref <ref>
bunx supabase db push
bunx supabase functions deploy [<name>]
bunx supabase secrets set KEY=VALUE
bunx supabase gen types typescript --project-id <id> > src/types/database.ts
bunx supabase functions logs <name>
```

---

## License

MIT. Fork, modifie, garde-le pour toi ou ouvre-le, tu fais comme tu veux.

---

## Crédits

Stack inspirée des best-practices Meydeey 2026 (Vite + Supabase + OpenRouter, anti-Next-by-default).
Sources Apify : [`apidojo/twitter-list-scraper`](https://apify.com/apidojo/twitter-list-scraper), [`automation-lab/reddit-scraper`](https://apify.com/automation-lab/reddit-scraper).
