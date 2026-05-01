# Commandes

## Frontend (npm / bun)

| Commande               | Effet                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | Vite dev server, http://localhost:5173, HMR                      |
| `npm run build`        | TypeScript build (`tsc -b`) + Vite production build vers `dist/` |
| `npm run typecheck`    | `tsc -b --noEmit` (CI gate)                                      |
| `npm run lint`         | ESLint, max-warnings 0                                           |
| `npm run format`       | Prettier write sur tout le repo                                  |
| `npm run format:check` | Prettier check (CI)                                              |
| `npm test`             | Vitest run unique                                                |
| `npm run test:watch`   | Vitest watch mode                                                |
| `npm run preview`      | Preview du build production                                      |

## Supabase CLI

| Commande                                                                      | Effet                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `npx supabase login`                                                          | Auth via browser                                         |
| `npx supabase link --project-ref <ref>`                                       | Lie le repo à un projet Supabase cloud                   |
| `npx supabase db push`                                                        | Applique toutes les migrations locales sur le projet lié |
| `npx supabase db pull`                                                        | Récupère le schema distant en migration locale           |
| `npx supabase functions deploy`                                               | Déploie toutes les edge functions                        |
| `npx supabase functions deploy <name>`                                        | Déploie une fonction spécifique                          |
| `npx supabase secrets set KEY=VALUE`                                          | Set un secret pour les edge functions                    |
| `npx supabase secrets list`                                                   | Liste les secrets configurés                             |
| `npx supabase gen types typescript --project-id <id> > src/types/database.ts` | Régénère les types TypeScript depuis le schema           |
| `npx supabase functions logs <name>`                                          | Tail des logs d'une fonction                             |

## Git workflow

| Commande                | Quand                                                   |
| ----------------------- | ------------------------------------------------------- |
| `git status`            | avant tout commit                                       |
| `git diff`              | review des changements                                  |
| `git log --oneline -10` | contexte récent                                         |
| `git pull`              | sync avec remote (après clone ou si plusieurs sessions) |
| `git push`              | push vers GitHub privé                                  |

## Debug ciblé

| Besoin                               | Commande                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Vérifier un edge function fonctionne | `curl -X POST https://<ref>.supabase.co/functions/v1/<name> -H "Authorization: Bearer <jwt>" -d '{}'` |
| Récupérer un JWT pour test           | depuis le browser : `localStorage.getItem('sb-<ref>-auth-token')` puis `JSON.parse(...).access_token` |
| Inspecter une migration              | `cat supabase/migrations/<file>.sql`                                                                  |
| Voir les logs OpenRouter récents     | dans l'app : `/logs` onglet OpenRouter                                                                |
| Reset DB locale (si supabase start)  | `npx supabase db reset`                                                                               |

## CI/CD

Pas de CI configurée actuellement (pas de `.github/workflows/`). Recommandation V2 :

- Job typecheck + test sur PR
- Job auto-deploy edge functions sur merge main
