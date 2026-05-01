# AGENTS.md

> Universal AI agent context file. Compatible with Claude Code, Cursor, Aider, Copilot CLI, Gemini CLI.
> Project-specific instructions live in `CLAUDE.md`. This file describes the project setup and conventions.

## Project

**theresa-scrap** is an AI watch dashboard that scrapes Twitter/X (via Apify), Reddit (via Apify) and ArXiv (official API), scores each signal 0-100 with a user-chosen LLM (via OpenRouter), and produces an 80/20 brief in the user's language (FR/EN/ES).

Fork-per-user model : every user runs their own Supabase project, brings their own OpenRouter and Apify keys.

## Stack

- React 19 + Vite 8 + TypeScript strict (no implicit `any`)
- Tailwind v4 + shadcn/ui (Radix primitives, copied into `src/components/ui/`)
- TanStack Query v5 for server state, Zustand for auth store, react-hook-form + zod for forms
- Supabase : Postgres 17 + Auth (magic link) + Edge Functions Deno + Storage + pg_cron
- OpenRouter SDK (`openai` package pointed at `openrouter.ai/api/v1`)
- Apify HTTP API (no SDK, just `fetch`)
- Vitest + React Testing Library

## Setup

```bash
npm install
cp .env.example .env.local   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy
npm run dev
```

## Commands

| Command                         | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `npm run dev`                   | Vite dev server (5173)                   |
| `npm run build`                 | TypeScript build + Vite production build |
| `npm run typecheck`             | tsc --noEmit (CI gate)                   |
| `npm run lint`                  | ESLint, max-warnings 0                   |
| `npm test`                      | Vitest run once                          |
| `npx supabase db push`          | Apply migrations to linked project       |
| `npx supabase functions deploy` | Deploy all edge functions                |

## Conventions

- **TypeScript strict**, no `any`, no `@ts-ignore`. Use `as unknown as Type` when DB types lag behind schema.
- **RLS everywhere** : every new table MUST have `ENABLE ROW LEVEL SECURITY` + an `own_*` policy in the same migration.
- **API keys per user** : never hardcode. Read via `_shared/api-keys.ts` helper.
- **No Next.js** : voluntary choice, see `docs/architecture/adrs/0001-vite-no-nextjs.md`.
- **Migrations versioned** : `supabase/migrations/YYYYMMDDHHMMSS_description.sql`. One migration = one intent.
- **Component naming** : PascalCase files matching the export.
- **Hook naming** : `useCamelCase`, one hook per resource.
- **Imports** : alias `@/` maps to `src/`.

## File structure (high level)

```
src/
├── pages/         6 routes (Dashboard, Digest, Costs, Logs, Settings, Login)
├── components/
│   ├── ui/        shadcn primitives
│   ├── layout/    AppLayout, Sidebar
│   ├── auth/      ProtectedRoute, AuthListener
│   └── features/  business components
├── hooks/         TanStack Query hooks
├── stores/        Zustand auth store
├── lib/           supabase client, utils, schemas/
└── types/         database.ts (Supabase regen)

supabase/
├── migrations/    10 SQL files
└── functions/     7 edge functions + _shared/

docs/              this file's siblings
specs/             SOURCES.md + done specs + handoffs
```

## Edge functions

- `run-pipeline` : orchestrates scrape (parallel) + score (batched)
- `scraper-x` : Apify Twitter list scraper
- `scraper-reddit` : Apify Reddit scraper, chunked by 6 subs
- `scraper-arxiv` : ArXiv official API
- `llm-score-batch` : scores 1-30 signals per LLM call
- `digest` : cross-source 80/20 brief in user language
- `purge` : delete user's signals (and optionally logs/costs/digests)

## Database tables (high level)

- `signals` (user_id, source, external_id, title, raw_payload, scraped_at, signal_date)
- `scores` (signal_id, user_id, score, reasoning, model_used, cost)
- `logs` (action, status, payload, ts) — purged hourly < 24h
- `llm_costs` (task, model, tokens, cost, ts)
- `settings` (model\_\*, language, prompts, sources, branding, daily_budget, score_concurrency, ...)
- `user_api_keys` (provider, encrypted_key, masked_key)
- `scoring_rubrics` (name, prompt, criteria jsonb)
- `digests` (period_days, language, content, signals_count, cost)

All RLS-protected by `user_id = auth.uid()`.

## Testing

- Unit + component tests with Vitest in `*.test.tsx` next to the file
- React Testing Library : prefer `getByRole` / `getByText`
- Mock hooks via `vi.mock('@/hooks/useXxx', ...)`
- Run before any commit : `npm test`

## Deployment

- Frontend : Vercel (auto-detect Vite) or Netlify (with SPA redirect)
- Backend : `npx supabase functions deploy` and `npx supabase db push`
- Set fallback secrets : `npx supabase secrets set OPENROUTER_API_KEY=...`

## Reference docs

Detailed documentation lives in `docs/`. Read in priority :

1. `docs/overview.md` — what + why + stack
2. `docs/architecture.md` — diagrams + flows
3. `docs/api.md` — edge function contracts
4. `docs/database.md` — schema + migrations
5. `docs/security.md` — RLS + secrets
6. `docs/conventions.md` — patterns to follow
7. `docs/architecture/adrs/` — historical decisions
