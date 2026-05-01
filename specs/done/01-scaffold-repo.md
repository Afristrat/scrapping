---
task_id: 01
title: Scaffold repo Vite + Supabase
owner: Xavier
status: done
estimated: 1h
actual: ~1h
commit: eb220d5
date_completed: 2026-04-30
source: ~/.claude/output/projects/zlatan-scrap/tasks/01-scaffold-repo.md
---

# Task 01 — Scaffold repo Vite + Supabase

## Objectif

Mettre en place le squelette du repo : Vite + React + TS + Tailwind + Supabase CLI initialisé + ESLint/Prettier + pre-commit + `.env.example`.

## Plan exécuté

### 1. Bootstrap

- `bun create vite . --template react-ts` (Vite 8 + React 19 + TS strict)
- `bun install` (154 packages)
- Runtime deps : `@supabase/supabase-js`, `@tanstack/react-query`, `react-router-dom`, `zustand`, `zod`, `react-hook-form`, `@hookform/resolvers`, `recharts`, `lucide-react`, `clsx`, `tailwind-merge`, `sonner`, `date-fns` (13)
- Dev deps : `@types/node`, `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/postcss`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@testing-library/{react,user-event,jest-dom}`, `jsdom`, `msw`, `husky`, `lint-staged` (14)

### 2. Configs

- `vite.config.ts` : plugin React + Tailwind + alias `@/*` + port 5173
- `tsconfig.app.json` : strict, paths `@/*`, `noUnusedLocals`, `noUnusedParameters`
- `vitest.config.ts` : jsdom, globals, setupFiles
- `eslint.config.js` : flat config + typescript-eslint + react-hooks + react-refresh + `no-console: warn`
- `.prettierrc.json` : single quotes, no semi, trailing comma, 100 cols, plugin Tailwind
- `.prettierignore`, `.gitignore` (étendu : .env.local, dist, coverage, supabase/.temp, .husky/\_)
- `.env.example` (placeholders Supabase + secrets Edge Functions documentés en commentaire)

### 3. Structure src/

```
src/
├── App.tsx, main.tsx, index.css   # Tailwind v4 import, QueryClient + Toaster wrap
├── lib/
│   ├── supabase.ts                # createClient typé Database, validation env vars
│   ├── utils.ts                   # cn() helper
│   ├── utils.test.ts              # 2 tests cn()
│   └── openrouter-models.ts       # POPULAR_MODELS list
├── stores/auth.ts                 # Zustand: user, session, loading, setSession
├── types/database.ts              # placeholder, regen via supabase gen types
└── test/setup.ts                  # @testing-library/jest-dom matchers
```

### 4. Supabase init

- `bunx supabase init` → `supabase/config.toml`, `migrations/`, `functions/`
- Pas de `supabase start` (Docker indispo localement → différé)

### 5. Husky + lint-staged

- `.husky/pre-commit` : `bun run typecheck && bunx lint-staged`
- `package.json` lint-staged config : prettier + eslint --fix sur `*.{ts,tsx}`, prettier sur `*.{json,md,css}`

### 6. Specs framework

- `specs/{todo,done}/` créés pour pipeline `/XD-plan` → `/XD-build`
- `.claude/settings.local.json` : permissions Bash projet

### 7. Docs

- `README.md` : démarrage, scripts, structure, fork-and-go (8 étapes)
- `CLAUDE.md` : pointeurs vers PRD/stack/archi, rules globales applicables, état actuel

## Acceptance — 7/7 ✅

- [x] `bun dev` lance Vite OK (http://localhost:5173)
- [x] `bun run build` passe (76kB gzip)
- [x] `bun run typecheck` passe
- [x] `bun run lint` passe (max-warnings 0)
- [x] `bun run test` passe (2 tests utils.cn)
- [x] `bunx supabase init` exécuté → `supabase/config.toml` présent
- [x] Pre-commit hook installé et fonctionnel

## Bloqué (non-bloquant pour la suite)

- `bunx supabase start` impossible (Docker daemon down) → différé task 02 ou setup user.

## Notes / déviations

- `tsconfig.app.json` : retiré `baseUrl` (deprecated TS 7.0), gardé `paths` seul.
- Husky 9 utilise `.husky/_/` comme wrapper ; `core.hooksPath` pointe dessus auto.
- Dérogation Next.js (Vite à la place) documentée dans `~/.claude/output/projects/zlatan-scrap/stack.md`.

## Commit

`eb220d5` chore(init): scaffold Vite + React + TS + Tailwind + Supabase CLI (30 files, +1872)
