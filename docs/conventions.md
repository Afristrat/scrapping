# Conventions

## TypeScript

- **Strict mode partout**. Pas de `any` implicite, pas de `@ts-ignore`. Si nécessaire : `as unknown as Type` documenté.
- Pas de `enum` TS (préférer union literals). Les enums Postgres restent en SQL.
- Imports : alias `@/` pour `src/`, configuré dans `tsconfig.json` + `vite.config.ts`.

## Naming

| Type              | Convention                    | Exemple                                        |
| ----------------- | ----------------------------- | ---------------------------------------------- |
| Composants React  | `PascalCase`                  | `RubricsManager.tsx`, `PurgeButton.tsx`        |
| Hooks             | `useCamelCase`                | `useDigest`, `usePurge`, `useRubrics`          |
| Tables Postgres   | `snake_case`                  | `user_api_keys`, `scoring_rubrics`             |
| Colonnes Postgres | `snake_case`                  | `signal_date`, `score_concurrency`             |
| Edge functions    | `kebab-case`                  | `scraper-x`, `llm-score-batch`, `run-pipeline` |
| Variables env     | `UPPER_SNAKE_CASE`            | `VITE_SUPABASE_URL`, `OPENROUTER_API_KEY`      |
| Types/interfaces  | `PascalCase`                  | `Settings`, `SignalRow`, `ApiKeyProvider`      |
| Schémas Zod       | `camelCase` + suffix `Schema` | `settingsSchema`, `apifyConfigSchema`          |

## Patterns observés

### Frontend

- **Une page = un dossier ?** Non, pages = fichiers individuels dans `src/pages/`. Si une page devient grosse (>200 lignes), extraire les composants en `src/components/features/`.
- **Hooks data** : 1 hook par ressource, pattern TanStack Query (`useQuery` pour lire, `useMutation` pour écrire). `queryKey` toujours array stable.
- **Forms** : `react-hook-form` + `zodResolver`. Schéma défini dans `src/lib/schemas/`. Validation au submit.
- **shadcn/ui** : composants primitives copiés dans `src/components/ui/`. On peut les modifier (ils sont à nous).
- **Pas de styled-components / emotion** : Tailwind utility classes uniquement, helper `cn` (clsx + tailwind-merge) pour la composition conditionnelle.

### Backend

- **Edge Functions** : 1 dossier = 1 fonction = 1 responsabilité. Helper partagé dans `_shared/`.
- **Logs structurés** : toujours `{ user_id, action, status, payload }`, jamais juste un message texte. Permet de filtrer dans la page Logs.
- **Erreurs return JSON** : jamais de throw/HTTP 500 silencieux. Retourner `{ error: 'code', detail?: 'msg' }` avec status approprié.
- **JWT user toujours propagé** : `createClient(URL, ANON_KEY, { global: { headers: { Authorization: authHeader }}})`. Jamais de `service_role` côté edge fn applicatives.

## Anti-patterns à éviter

- ❌ `useEffect` pour fetch data → utiliser `useQuery`
- ❌ `useState` pour partager entre composants → Zustand ou context (rare)
- ❌ Cast `as Type` sans `unknown` intermédiaire pour types DB → préférer `as unknown as Type`
- ❌ Hardcoder une clé API ou un model OpenRouter → toujours via `settings`
- ❌ Désactiver RLS sur une table "temporairement" → reflexe gaspillage de temps en migration de fix
- ❌ Modifier une migration déjà appliquée en prod → créer une nouvelle migration corrective
- ❌ `git commit` automatique → toujours attendre la demande explicite

## Commits & Git

- Conventional commits : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Sujet sous 72 chars
- Body explique le **pourquoi** (le quoi est dans le diff)
- Pas de `--no-verify` sauf demande explicite

## Tests

- Vitest run via `npm test`
- 1 fichier `*.test.tsx` par composant/page testé
- React Testing Library : `getByRole`, `getByText`, `findByText` (préférer aux selecteurs CSS)
- Mock les hooks data via `vi.mock('@/hooks/useXxx', ...)`
- Snapshot tests : éviter (fragiles), préférer assertions explicites

## Style

- Prettier avec config par défaut (sauf `singleQuote: true`, `semi: false`)
- ESLint `max-warnings 0` en CI
- Pas de tiret cadratin (—) dans le code, code docs, commits, comments. Convention globale Meydeey, voir `~/.claude/CLAUDE.md`.
- En markdown, j'use le tiret cadratin uniquement pour la lisibilité de la doc (cette règle s'applique aux contenus produits par l'app, pas à la doc interne du repo)
