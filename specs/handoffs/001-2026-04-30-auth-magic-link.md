## Case facts

- **Branch** : main
- **Last commit** : ea2b5a4 — feat(auth): magic link login + protected routes (task 03)
- **Commits non pushés** : 0 (aucun remote configuré sur ce repo local)
- **Open PRs** : none
- **Blocking issue** : none
- **Next concrete step** : démarrer Task 04 (Edge Function `scraper-reddit`) — voir `~/.claude/output/projects/zlatan-scrap/tasks/04-scraper-reddit.md`

## HANDOFF — zlatan-scrap — 2026-04-30

### Contexte & décisions

- Problème traité : Task 03 — câbler l'auth magic link Supabase + protéger les routes V1 (Dashboard / Settings / Logs / Monitoring) derrière une session valide.
- Approche choisie (et pourquoi pas les autres) :
  - Choix : `supabase.auth.signInWithOtp({ email })` + `onAuthStateChange` listener global hydratant Zustand + `<ProtectedRoute>` wrapper avec `<Outlet>` rendu si session présente, sinon `<Navigate to="/login" replace>`.
  - Rejeté : route loaders react-router v7 — raison : nécessite d'attendre la session avant le 1er render, complexifie la gestion du `loading: true` initial du store. Le pattern listener + redirect au render est suffisant pour V1.
  - Rejeté : Server Components / middleware — raison : projet Vite SPA, pas Next.js (dérogation stack documentée dans CLAUDE.md).
- Décisions d'architecture :
  - shadcn/ui scaffold installé (button, card, input, label) avec `components.json` à la racine — anticipe Task 08 (layout/sidebar) tout en servant déjà au formulaire Login.
  - `src/test/setup.ts` stub `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` au niveau global pour que `import '@/lib/supabase'` ne throw pas en tests unitaires. Les tests qui veulent assert sur le client doivent mocker explicitement.
  - `signOut()` ajouté au store auth (`src/stores/auth.ts`) — appelle `supabase.auth.signOut()`, le listener `onAuthStateChange` se charge de remettre `session: null`.

### Findings critiques

- Validate complet vert : lint OK, typecheck OK, **7/7 tests passing**, build OK (355 KB / 103 KB gzip).
- Husky + lint-staged actifs : prettier + eslint --fix appliqués automatiquement au commit (vu lors du commit ea2b5a4).
- Aucun remote git configuré sur ce projet local — `git remote -v` vide. Push impossible. Pas de canal CI distant.
- Tests présents :
  - `src/pages/Login.test.tsx` — validation email (champ requis + format)
  - `src/components/auth/ProtectedRoute.test.tsx` — redirect /login quand pas de session
  - 1 troisième fichier de test scaffold pré-existant (total 3 fichiers, 7 tests)

### Terminé

- Task 03 (auth magic link + ProtectedRoute) — spec déplacée dans `specs/done/03-auth-magic-link.md`
- Tasks fermées en amont : 01 (scaffold) + 02 (DB migrations + RLS)

### Fichiers en cours (non commités)

- `specs/handoffs/001-2026-04-30-auth-magic-link.md` — ce handoff lui-même, non staged. Piggyback sur le prochain build via `/XD-commit` standard (D-24).

### Prochaine étape immédiate

Démarrer Task 04 : créer l'Edge Function `supabase/functions/scraper-reddit/index.ts` qui ingère les top hot posts de N subreddits dans la table `signals` en mode user-scoped (RLS via JWT user passé en `Authorization` header). Spec complète dans `~/.claude/output/projects/zlatan-scrap/tasks/04-scraper-reddit.md`.

### Risques identifiés

**Nouveaux risques découverts cette session** :

- Pas de remote git → aucun backup distant, aucun CI. Si la machine crash, tout le travail local est perdu. Avant de pousser plus loin, créer un repo GitHub et `git remote add origin` (idéalement avant Task 04).
- `src/test/setup.ts` injecte des env vars factices via `import.meta.env.VITE_SUPABASE_* ??= ...` — fonctionne tant que les tests ne dépendent pas du contenu réel des env vars. Si un futur test importe `@/lib/supabase` ET appelle vraiment l'API, il faudra mocker `@/lib/supabase` directement (pas se contenter du stub global).
- shadcn/ui scaffold partiel : `src/components/layout/` et `src/components/features/` sont créés mais vides. Task 08 devra y poser le sidebar — ne pas les supprimer entre-temps.
- Bundle frontend déjà à 355 KB (103 KB gzip) avant tout code métier — recharts + react-router-dom + supabase-js pèsent. Surveiller au fil des tasks 09-11 (dashboard avec graphes).

**Risques hérités encore ouverts** (repris du handoff précédent, re-vérifiés) :

- none (premier handoff du projet)

### Prêt pour la prod ?

- [x] Tests OK (7/7)
- [x] Build OK (vite build pass)
- [ ] Testé manuellement (auth flow magic link non vérifié end-to-end avec un vrai email Supabase — Task 03 specs ne le requiert pas)
- [x] Pas de debug oubliés (pas de console.log, pas de TODO bloquants)
- Décision : **PARTIEL** — code shippable techniquement (lint/types/tests/build verts) mais V1 incomplète (5 tasks scaffold/db/auth sur 12). Pas de prod avant Task 12.

### Fichiers clés

- `/Users/xais/Dev/PROJETS/zlatan-scrap/CLAUDE.md` — contexte projet (stack Vite SPA, dérogation Next.js, pipeline XD)
- `/Users/xais/Dev/PROJETS/zlatan-scrap/src/components/auth/AuthListener.tsx` — listener global onAuthStateChange à comprendre avant tout changement auth
- `/Users/xais/Dev/PROJETS/zlatan-scrap/src/components/auth/ProtectedRoute.tsx` — pattern de protection des routes V1
- `/Users/xais/Dev/PROJETS/zlatan-scrap/src/routes.tsx` — table de routing react-router v7
- `/Users/xais/Dev/PROJETS/zlatan-scrap/src/stores/auth.ts` — store Zustand auth (user, session, loading, signOut)
- `/Users/xais/Dev/PROJETS/zlatan-scrap/src/test/setup.ts` — stubs env Supabase (lire avant d'écrire un test qui touche au client)
- `/Users/xais/Dev/PROJETS/zlatan-scrap/specs/done/03-auth-magic-link.md` — spec implémentée cette session
- `~/.claude/output/projects/zlatan-scrap/tasks/04-scraper-reddit.md` — prochaine task
- `~/.claude/output/projects/zlatan-scrap/tasks/00-overview.md` — vue d'ensemble V1 (12 tasks, ordre des dépendances)
