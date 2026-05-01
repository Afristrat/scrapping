# Documentation theresa-scrap

> Veille IA automatisée, scorée par LLM, personnalisable bout en bout. X (Apify) + Reddit (Apify) + ArXiv (API officielle) + OpenRouter + Supabase.

Date de génération : 2026-04-30.

## Index

### Architecture & code

- [Vue d'ensemble](./overview.md) — quoi, pour qui, stack
- [Architecture](./architecture.md) — couches, flux de données, diagrammes
- [Architecture des relations](./architecture-map.md) — modules, dépendances, points d'entrée
- [Conventions](./conventions.md) — naming, patterns, anti-patterns
- [Sécurité](./security.md) — RLS, clés API user-side, JWT

### Référence technique

- [API & Edge Functions](./api.md) — les 7 edge functions Deno + body schemas
- [Database](./database.md) — schema, migrations, RPC, RLS policies
- [Authentification](./auth.md) — magic link Supabase, trigger init_user_settings
- [Deployment](./deployment.md) — Supabase + Vercel
- [Commandes](./commands.md) — npm scripts + supabase CLI

### Décisions architecturales

- [ADR-0001 — Vite (pas Next.js)](./architecture/adrs/0001-vite-no-nextjs.md)
- [ADR-0002 — Supabase Edge Functions Deno](./architecture/adrs/0002-supabase-edge-functions.md)
- [ADR-0003 — OpenRouter + batch scoring](./architecture/adrs/0003-openrouter-batch-scoring.md)
- [ADR-0004 — Apify pour X et Reddit](./architecture/adrs/0004-apify-vs-official-api.md)

### Handoffs

- [Index handoffs](./handoffs/) — historique des sessions de dev

## Stack en 1 ligne

`React 19 + Vite 8 + TS strict + Tailwind v4 + shadcn/ui + TanStack Query + Zustand + Supabase (Postgres + Auth + Edge Functions Deno + pg_cron) + OpenRouter + Apify + ArXiv API`.
