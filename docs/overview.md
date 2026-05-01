# Vue d'ensemble

## Quoi

`theresa-scrap` est un dashboard de veille IA. Il scrape X (Twitter), Reddit et ArXiv toutes les N heures (ou à la demande), score chaque signal de 0 à 100 via un LLM (OpenRouter), et génère un brief synthétique 80/20 dans la langue de l'utilisateur (FR/EN/ES).

## Pour qui

Builders IA, créateurs de contenu, consultants tech, équipes veille. Le projet est conçu **fork-per-user** : chaque utilisateur a sa propre instance Supabase, ses propres clés OpenRouter et Apify, ses propres grilles de scoring et sources prioritaires.

## Pourquoi

90% du contenu IA en ligne est du bruit. Filtrer manuellement = 1-2h/jour. `theresa-scrap` réduit ça à 5 minutes/jour avec des signaux scorés sur des critères que l'utilisateur définit.

## Stack technique

| Couche        | Outil                                 | Version            | Rôle                                           |
| ------------- | ------------------------------------- | ------------------ | ---------------------------------------------- |
| Runtime       | Bun (préféré) ou Node                 | Bun 1.x / Node 22+ | Dev server + scripts                           |
| Build         | Vite                                  | 8.x                | Bundler frontend                               |
| Frontend      | React                                 | 19.x               | UI                                             |
| Langage       | TypeScript                            | ~6.0 strict        | Type safety                                    |
| Style         | Tailwind                              | v4                 | Utility CSS                                    |
| UI primitives | radix-ui (meta) + shadcn/ui           | 1.4+               | Composants accessibles                         |
| Routing       | react-router-dom                      | 7.x                | SPA routing                                    |
| Data client   | TanStack Query                        | 5.x                | Cache + invalidation                           |
| State         | Zustand                               | 5.x                | Auth store                                     |
| Forms         | react-hook-form + zod                 | 7.x + 4.x          | Validation                                     |
| Charts        | Recharts                              | 3.x                | Coûts                                          |
| Backend       | Supabase                              | Postgres 17        | DB + Auth + Edge Functions + Storage + pg_cron |
| Edge runtime  | Deno                                  | latest             | Edge Functions                                 |
| LLM proxy     | OpenRouter                            | API v1             | Multi-modèles                                  |
| Scrap X       | Apify `apidojo/twitter-list-scraper`  | —                  | $0.0004/tweet                                  |
| Scrap Reddit  | Apify `automation-lab/reddit-scraper` | —                  | $0.001/post                                    |
| Scrap ArXiv   | API officielle ArXiv                  | —                  | gratuit                                        |
| Tests         | Vitest + RTL                          | 4.x + 16.x         | Unit + composants                              |
| Lint/format   | ESLint + Prettier                     | 10.x + 3.x         | Quality gate                                   |

## Pré-requis installation

- Compte Supabase (free tier suffit)
- Compte OpenRouter avec crédits ($5+ recommandé)
- Compte Apify avec crédits ($5/mois inclus en free)
- Bun ou Node 22+, npm
- Optionnel : Vercel pour deployment

## Variables d'environnement

`.env.local` (frontend Vite) :

- `VITE_SUPABASE_URL` — URL projet Supabase
- `VITE_SUPABASE_ANON_KEY` — clé anon publique

Secrets Supabase Edge Functions (fallbacks, l'user peut configurer ses propres clés via UI) :

- `OPENROUTER_API_KEY`
- `APIFY_TOKEN`

Set via : `bunx supabase secrets set KEY=VALUE`.

## Installation rapide

```bash
git clone https://github.com/meydeey/theresa-scrap.git
cd theresa-scrap
npm install
cp .env.example .env.local
# Edit .env.local
npx supabase login
npx supabase link --project-ref <ton-ref>
npx supabase db push
npx supabase functions deploy
npm run dev
```

Voir [`commands.md`](./commands.md) pour la liste complète et [`deployment.md`](./deployment.md) pour la prod.
