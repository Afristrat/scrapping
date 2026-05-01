# theresa-scrap

> Veille IA automatisée, scorée par LLM, **personnalisable de bout en bout**.
> X (Twitter) via Apify · Reddit via Apify · ArXiv via API officielle · OpenRouter pour le scoring.

Chaque utilisateur a sa propre instance, ses propres clés API, ses propres grilles de scoring, ses propres sources prioritaires. Aucun compte mutualisé, aucune fuite de données : 1 fork = 1 base Supabase = 1 user maître.

---

## Sommaire

1. [À quoi ça sert](#1-à-quoi-ça-sert)
2. [Comment ça marche](#2-comment-ça-marche)
3. [Stack technique](#3-stack-technique)
4. [Démarrer en 10 minutes](#4-démarrer-en-10-minutes)
5. [Configuration utilisateur](#5-configuration-utilisateur)
6. [Sources de veille](#6-sources-de-veille)
7. [Coûts attendus](#7-coûts-attendus)
8. [Comment ça peut être rentable](#8-comment-ça-peut-être-rentable)
9. [Structure du repo](#9-structure-du-repo)
10. [FAQ débutant](#10-faq-débutant)

---

## 1. À quoi ça sert

**Problème** : tu veux faire de la veille sur l'IA mais tu te noies dans X, Reddit, ArXiv. 90% du contenu est du bruit, 10% est utile, et tu n'as pas le temps de filtrer.

**Solution** : `theresa-scrap` :

1. **Scrape** automatiquement les sources qui t'intéressent (listes X, subreddits, catégories ArXiv).
2. **Score** chaque signal de 0 à 100 avec un LLM, selon une grille que **tu définis** (innovation, actionable, crédibilité, etc.).
3. **Affiche** les meilleurs signaux dans un dashboard où tu filtres par score, période, source.
4. **Trace** chaque coût (tokens OpenRouter + Apify) pour que tu sois maître de ton budget.

Tu te réveilles le matin, tu vois les 20 meilleurs signaux des dernières 24h, scorés selon **ta** définition de "pertinent". Pas celle d'un algorithme générique.

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
        ┌────────────────────────────────┐
        │  Edge Function : llm-score     │
        │  - lit ta grille de scoring    │
        │  - appelle OpenRouter (Haiku)  │
        │  - écrit le score + le coût    │
        └────────────────┬───────────────┘
                         ▼
        ┌────────────────────────────────┐
        │  Tables scores + llm_costs     │
        └────────────────┬───────────────┘
                         ▼
        ┌────────────────────────────────┐
        │  Dashboard React (toi)         │
        │  Filtres, modals, stats coûts  │
        └────────────────────────────────┘
```

**3 idées clés** :

- **RLS partout** : grâce à Supabase Row Level Security, chaque user ne voit QUE ses propres données. Tu peux héberger une instance partagée à 5 users sans aucune fuite.
- **Clés API user-side** : tu mets TA clé OpenRouter et TA clé Apify dans l'onglet `Paramètres → Clés API`. Elles sont stockées chiffrées en DB, lues uniquement par les Edge Functions.
- **Grilles de scoring custom** : tu peux créer plusieurs rubriques (ex : "veille technique builder", "veille macro CEO", "veille RH IA"), chacune avec ses critères pondérés. Tu actives celle que tu veux selon ton mood.

---

## 3. Stack technique

| Couche | Outil | Pourquoi |
|--------|-------|----------|
| Frontend | React 19 + Vite + TypeScript strict | SPA légère, pas besoin de SSR |
| Style | Tailwind v4 + shadcn/ui | Composants accessibles + customisables |
| Routing | react-router-dom v7 | SPA classique |
| Data client | TanStack Query v5 | Cache + invalidation propre |
| Forms | react-hook-form + zod | Validation typée |
| Charts | Recharts | Coûts et tendances |
| Backend | Supabase (Postgres + Auth + Edge Functions Deno + Storage + pg_cron) | Tout-en-un, free tier suffisant pour 1 user |
| LLM | OpenRouter (proxy multi-modèles) | Tu choisis Haiku, Sonnet, Gemini, etc. |
| Scrap X | Apify `apidojo/twitter-list-scraper` | Liste X dédiée, $0.0004/tweet |
| Scrap Reddit | Apify `automation-lab/reddit-scraper` | Le moins cher des actors stables (~$0.001/post) |
| Scrap ArXiv | API officielle ArXiv | Gratuite, 1 req / 3s |
| Tests | Vitest + React Testing Library | Tests unitaires et composants |

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
bunx supabase db push                                 # applique migrations 1 à 7
```

Les migrations créent : `signals`, `scores`, `logs`, `llm_costs`, `settings`, `user_api_keys`, `scoring_rubrics` + RLS + trigger d'init au signup.

### Étape 4 — Déployer les Edge Functions

```bash
bunx supabase functions deploy
```

Set tes secrets fallback (optionnel — chaque user peut configurer les siens via UI) :

```bash
bunx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
bunx supabase secrets set APIFY_TOKEN=apify_api_...
```

### Étape 5 — Lancer en local

```bash
bun dev    # http://localhost:5173
```

Login via magic link (mail → Inbucket en local ou ta boîte en prod). Va dans `Paramètres → Clés API`, ajoute :

- Ta **clé OpenRouter** (https://openrouter.ai/keys, gratuit avec quelques crédits)
- Ton **token Apify** (https://console.apify.com/account/integrations, gratuit avec 5$ de crédits/mois)

Va dans **Dashboard**, clique **Run pipeline**. Tu verras les signaux apparaître au bout d'1-2 minutes.

### Étape 6 — Déployer en prod (Vercel)

```bash
bun add -g vercel
vercel deploy --prod
```

Configure les mêmes variables d'env dans Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 5. Configuration utilisateur

Tout est dans **Paramètres** (5 onglets) :

### 5.1 Modèles

3 sélections OpenRouter (`scraping`, `scoring`, `monitoring`). Recommandé :
- Scoring : `anthropic/claude-haiku-4.5` (rapide, $0.001/1K tokens, qualité largement suffisante).
- Monitoring : `openrouter/auto` (laisse OpenRouter choisir).

### 5.2 Grilles de scoring

CRUD complet. Une rubrique = un nom + un prompt + N critères pondérés. Exemple :

| Critère | Poids |
|---------|-------|
| Innovation technique | 0.40 |
| Actionable cette semaine | 0.30 |
| Crédibilité de la source | 0.30 |

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

- **OpenRouter** : input password, save → stocké chiffré en DB. Affichage masked seulement (`sk-or-v1...abcd`).
- **Apify** : idem.

Tu peux supprimer une clé à tout moment. Si pas de clé, fallback sur `OPENROUTER_API_KEY` / `APIFY_TOKEN` envs serveur (pour démo).

### 5.5 Branding & budget

- Nom personnalisé, couleur primaire, logo (uploadé dans bucket `branding`).
- Budget journalier : `daily_budget_usd`. Si dépassé, alerte dans la page Costs.

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

| Poste | Volume / jour | Coût / jour | Coût / mois |
|-------|---------------|-------------|-------------|
| Apify X (list scraper) | 100 tweets + 1 query | ~$0.05 | ~$1.5 |
| Apify Reddit (18 subs × 25 posts) | ~450 posts + 1 run | ~$0.45 | ~$13.5 |
| ArXiv (gratuit) | 6 catégories × 25 papers | $0 | $0 |
| OpenRouter scoring (Haiku 4.5) | ~700 signaux × ~150 tokens | ~$0.10 | ~$3 |
| Supabase free tier | 500 MB DB, 2GB egress | $0 | $0 |
| **Total** | | **~$0.60** | **~$18** |

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
├── CLAUDE.md                    ← contexte agent IA
├── package.json                 ← deps + scripts bun
├── .env.example                 ← template variables
├── index.html                   ← entry HTML Vite
├── vite.config.ts
├── vitest.config.ts
├── tsconfig*.json
├── eslint.config.js
├── components.json              ← config shadcn/ui
│
├── public/                      ← assets statiques (favicon, etc.)
│
├── specs/                       ← documentation projet
│   ├── SOURCES.md               ← référence des 241 sources de veille
│   ├── done/                    ← specs implémentées (audit historique)
│   └── handoffs/                ← notes de session
│
├── src/
│   ├── main.tsx                 ← bootstrap React
│   ├── App.tsx                  ← root provider (QueryClient, Auth)
│   ├── routes.tsx               ← routes react-router
│   │
│   ├── pages/
│   │   ├── Login.tsx            ← magic link Supabase
│   │   ├── Dashboard.tsx        ← table signaux + filtres + modal
│   │   ├── Settings.tsx         ← 5 onglets de config
│   │   ├── Costs.tsx            ← coûts par jour / modèle / tâche
│   │   └── Logs.tsx             ← activité + détails OpenRouter
│   │
│   ├── components/
│   │   ├── ui/                  ← primitives shadcn (button, card, dialog, tabs, ...)
│   │   ├── layout/              ← AppLayout, Sidebar, BrandedHeader
│   │   └── features/            ← composants métier (RubricsManager, ApifyConfigForm, ...)
│   │
│   ├── hooks/                   ← TanStack Query hooks (useSignals, useApiKeys, ...)
│   ├── stores/                  ← Zustand (auth)
│   ├── lib/
│   │   ├── supabase.ts          ← client browser (anon)
│   │   ├── utils.ts             ← cn helper, etc.
│   │   ├── openrouter-models.ts ← liste de modèles affichés
│   │   └── schemas/             ← schemas zod (settings, rubrics, api-keys)
│   ├── types/
│   │   └── database.ts          ← types générés Supabase
│   └── test/
│       └── setup.ts
│
└── supabase/
    ├── config.toml
    ├── migrations/              ← SQL versionnés (1 à 7)
    │   ├── 20260430000001_init.sql
    │   ├── 20260430000002_rls.sql
    │   ├── 20260430000003_pg_cron.sql
    │   ├── 20260430000004_costs_by_day.sql
    │   ├── 20260430000005_unscored_signals_rpc.sql
    │   ├── 20260430000006_modular_config.sql
    │   └── 20260430000007_seed_sources_default.sql
    └── functions/               ← Edge Functions Deno
        ├── _shared/api-keys.ts  ← helper lecture clés user
        ├── scraper-x/           ← Apify twitter-list-scraper
        ├── scraper-reddit/      ← Apify reddit-scraper
        ├── scraper-arxiv/       ← API officielle
        ├── llm-score/           ← OpenRouter scoring
        └── run-pipeline/        ← orchestrateur
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

| Commande             | Effet                                   |
| -------------------- | --------------------------------------- |
| `bun dev`            | Vite dev server (http://localhost:5173) |
| `bun run build`      | Production build (tsc + vite build)     |
| `bun run typecheck`  | `tsc -b --noEmit`                       |
| `bun run lint`       | ESLint (max-warnings 0)                 |
| `bun run format`     | Prettier write                          |
| `bun run test`       | Vitest run once                         |
| `bun run test:watch` | Vitest watch                            |
| `bun run preview`    | Preview du build prod                   |

---

## License

MIT. Fork, modifie, garde-le pour toi ou ouvre-le, tu fais comme tu veux.

---

## Crédits

Stack inspirée des best-practices Meydeey 2026 (Vite + Supabase + OpenRouter, anti-Next-by-default).
Sources Apify : [`apidojo/twitter-list-scraper`](https://apify.com/apidojo/twitter-list-scraper), [`automation-lab/reddit-scraper`](https://apify.com/automation-lab/reddit-scraper).
