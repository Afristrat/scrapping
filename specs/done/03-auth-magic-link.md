---
task_id: 03
title: Auth magic link + ProtectedRoute
owner: François
status: done
estimated: 1h50
depends_on: [01, 02]
blocks: [09, 10, 11]
source: ~/.claude/output/projects/zlatan-scrap/tasks/03-auth-magic-link.md
date_planned: 2026-04-30
---

# Plan — Auth magic link + ProtectedRoute

## Problème & objectif

Le repo scaffold n'a pas encore de routing ni d'auth. Toutes les pages V1 (Dashboard, Settings, Logs, Monitoring) doivent être protégées par auth ; seul `/login` est public. Modèle 1 user = 1 fork = 1 instance Supabase, magic link Supabase Auth.

**Objectif** :

1. Page `/login` avec formulaire email + bouton "Envoyer le lien magique"
2. Listener global `onAuthStateChange` qui hydrate le store Zustand
3. `<ProtectedRoute>` qui redirige vers `/login` si pas de session
4. Routes V1 câblées (placeholders pour Dashboard/Settings/Logs/Monitoring)
5. Logout dans le layout temporaire
6. Persistence session après refresh (déjà câblée via `persistSession: true`)
7. Tests : validation email Login + redirect ProtectedRoute

## Contexte projet (ce qui est déjà fait)

- `src/lib/supabase.ts` — client typé `Database`, `persistSession`/`autoRefreshToken`/`detectSessionInUrl` activés (task 01).
- `src/stores/auth.ts` — Zustand store avec `user`, `session`, `loading`, `setSession`, `setLoading` (task 01).
- `supabase/migrations/20260430000002_rls.sql` — trigger `init_user_settings` auto-crée la ligne `settings` au signup (task 02).
- `src/main.tsx` — `QueryClientProvider` + `Toaster` mountés (task 01).

## Approche technique

### Stack & libs

- `react-router-dom@7` (déjà installé) — `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `useNavigate`, `useLocation`
- `react-hook-form@7` + `zod@4` + `@hookform/resolvers/zod` — form
- `@supabase/supabase-js@2` — `signInWithOtp`, `signOut`, `getSession`, `onAuthStateChange`
- **shadcn/ui** — primitives `Button`, `Input`, `Label`, `Card` (à installer en step 1)

### Flow magic link

```
[User /login]
   │
   ▼
[saisit email] → submit react-hook-form
   │
   ▼
supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: window.location.origin }
})
   │
   ▼
[Supabase envoie email avec lien `https://<project>.supabase.co/auth/v1/verify?token=...&redirect_to=<origin>`]
   │
   ▼
[User click email] → redirect `<origin>?access_token=...&refresh_token=...&...`
   │
   ▼
[detectSessionInUrl: true] → supabase.auth lit l'URL, hydrate la session, supprime les query params
   │
   ▼
[onAuthStateChange listener fire 'SIGNED_IN'] → useAuthStore.setSession(session)
   │
   ▼
[ProtectedRoute] : session ≠ null → render children
```

### Architecture composants

```
src/
├── App.tsx                          # rendre <RouterProvider/> (ou simple Routes)
├── routes.tsx                       # createBrowserRouter avec ProtectedRoute
├── components/
│   ├── auth/
│   │   ├── ProtectedRoute.tsx       # garde route, redirect /login si pas session
│   │   └── AuthListener.tsx         # hook + composant qui mount onAuthStateChange
│   └── ui/                          # shadcn primitives ajoutées : button, input, label, card
├── pages/
│   ├── Login.tsx                    # MagicLinkForm + UI
│   ├── Dashboard.tsx                # placeholder "Hello {email}" + logout
│   ├── Settings.tsx                 # placeholder
│   ├── Logs.tsx                     # placeholder
│   └── Monitoring.tsx               # placeholder
└── stores/auth.ts                   # ajout : signOut() action
```

## Implementation guide (step-by-step)

### Step 1 — shadcn init + primitives (15 min)

shadcn n'est pas encore initialisé. Lancer :

```bash
bunx shadcn@latest init
# Style : Default | Base color : Slate | CSS file : src/index.css | Tailwind config : (auto v4)
bunx shadcn@latest add button input label card form
```

Vérifier :

- `components.json` créé
- `src/components/ui/{button,input,label,card,form}.tsx` créés
- `tsconfig.json` ou `tsconfig.app.json` paths déjà OK (alias `@/*`)

### Step 2 — Étendre `useAuthStore` avec `signOut` (5 min)

Modifier `src/stores/auth.ts` :

```ts
import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
  setLoading: (loading) => set({ loading }),
  signOut: async () => {
    await supabase.auth.signOut()
    // onAuthStateChange listener will set session to null
  },
}))
```

### Step 3 — `<AuthListener/>` composant (10 min)

`src/components/auth/AuthListener.tsx` :

```tsx
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export function AuthListener({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession)

  useEffect(() => {
    // Hydrate initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    // Subscribe to auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => sub.subscription.unsubscribe()
  }, [setSession])

  return <>{children}</>
}
```

### Step 4 — `<ProtectedRoute/>` (10 min)

`src/components/auth/ProtectedRoute.tsx` :

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export function ProtectedRoute() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Chargement…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
```

### Step 5 — Page `/login` (25 min)

`src/pages/Login.tsx` :

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const schema = z.object({
  email: z.string().email('Adresse email invalide'),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const session = useAuthStore((s) => s.session)
  const [sent, setSent] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  if (session) return <Navigate to="/" replace />

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      toast.error(`Échec : ${error.message}`)
      return
    }
    setSent(true)
    toast.success('Lien envoyé. Vérifie ta boîte mail.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>zlatan-scrap</CardTitle>
          <CardDescription>
            {sent
              ? 'Lien magique envoyé. Clique le lien reçu par mail pour te connecter.'
              : 'Connecte-toi avec ton email — un lien magique te sera envoyé.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="toi@example.com"
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Envoi…' : 'Envoyer le lien magique'}
              </Button>
            </form>
          ) : (
            <Button variant="outline" onClick={() => setSent(false)}>
              Renvoyer un nouveau lien
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
```

### Step 6 — Pages placeholder (10 min)

4 fichiers minimaux dans `src/pages/`. Exemple `Dashboard.tsx` :

```tsx
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-slate-500">Connecté en tant que {user?.email}</p>
      <Button variant="outline" onClick={signOut}>
        Logout
      </Button>
    </main>
  )
}
```

`Settings.tsx`, `Logs.tsx`, `Monitoring.tsx` : variantes minimales avec titre + lien retour vers `/`.

### Step 7 — Routes (`src/routes.tsx`) (15 min)

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import Logs from '@/pages/Logs'
import Monitoring from '@/pages/Monitoring'
import Settings from '@/pages/Settings'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/settings', element: <Settings /> },
      { path: '/logs', element: <Logs /> },
      { path: '/monitoring', element: <Monitoring /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
```

### Step 8 — Câbler `App.tsx` (5 min)

```tsx
import { RouterProvider } from 'react-router-dom'
import { AuthListener } from '@/components/auth/AuthListener'
import { router } from '@/routes'

export default function App() {
  return (
    <AuthListener>
      <RouterProvider router={router} />
    </AuthListener>
  )
}
```

### Step 9 — Tests (30 min)

#### `src/pages/Login.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devrait afficher une erreur si email invalide', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText(/email/i), 'pas-un-email')
    await user.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(await screen.findByText(/email invalide/i)).toBeInTheDocument()
  })

  it('devrait afficher la confirmation après envoi réussi', async () => {
    const { supabase } = await import('@/lib/supabase')
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'alice@example.com',
      options: { emailRedirectTo: expect.any(String) },
    })
    expect(await screen.findByText(/lien magique envoyé/i)).toBeInTheDocument()
  })
})
```

#### `src/components/auth/ProtectedRoute.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { ProtectedRoute } from './ProtectedRoute'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, user: null, loading: false })
  })

  it('devrait rediriger vers /login si pas de session', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it("devrait afficher l'enfant si session active", () => {
    useAuthStore.setState({
      session: { access_token: 'x', user: { id: 'u1', email: 'a@b.c' } } as never,
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('devrait afficher Chargement si loading', () => {
    useAuthStore.setState({ session: null, loading: true })

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
  })
})
```

## Test strategy

| Couche               | Outil                       | Couverture cible                                                       |
| -------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Form validation      | Vitest + RTL                | Login email regex + erreur affichée                                    |
| Side-effect Supabase | Vitest mock                 | `signInWithOtp` appelé avec bon payload                                |
| Route guard          | Vitest + RTL + MemoryRouter | redirect /login, render enfant si session, fallback loading            |
| E2E manuel           | Inbucket local              | Magic link reçu → click → session active (post-task validation Xavier) |

Les E2E auto avec Playwright/Cypress sont **out of scope V1** (cf. PRD § Out of Scope).

## Non-Goals (explicites)

- ❌ **OAuth providers** (Google/GitHub/Discord) — magic link suffisant V1, simplicité fork-and-go.
- ❌ **Multi-user dans une instance** — 1 fork = 1 user (cf. PRD).
- ❌ **Profile / avatar / display name custom** — `user.email` suffit (settings page gère le branding instance, pas le profil user).
- ❌ **Reset password / change email flow** — pas de password donc N/A.
- ❌ **Confirmation email custom (template HTML)** — défaut Supabase OK V1, custom = V2.
- ❌ **Rate limiting côté client** — Supabase rate-limit déjà côté serveur.
- ❌ **Persistence custom (cookies httpOnly)** — `localStorage` Supabase suffit pour SPA fork-and-go (pas de SSR à protéger).
- ❌ **E2E auto Playwright** — V1.1.

## Risques & décisions

| #   | Sujet                             | Décision                                                                                                                                                                                          |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Magic link expiré ou déjà utilisé | UX : afficher l'erreur Supabase via toast (`error.message`), proposer "Renvoyer un nouveau lien". Code prévu dans Login.tsx.                                                                      |
| 2   | Inbucket local vs SMTP prod       | Dev local : `supabase start` → Inbucket sur `:54324`. Prod : SMTP custom Resend (5K emails/mois free) à configurer dashboard Supabase. **Hors scope build, à faire au déploiement (task 12).**    |
| 3   | `emailRedirectTo` URL             | `window.location.origin` en V1. En prod Vercel preview deploys, l'URL change → ajouter les domaines preview dans Supabase Auth → URL Allow List dashboard. **Hors scope build, à faire task 12.** |
| 4   | Session loading flicker           | `loading: true` initial dans store → `<ProtectedRoute>` montre "Chargement…" tant que `getSession()` n'a pas répondu. Pas de redirect prématuré.                                                  |
| 5   | Token refresh failure             | `autoRefreshToken: true` dans supabase.ts gère. Si refresh fail, `onAuthStateChange` fire `'SIGNED_OUT'` → user retombe sur `/login`. Comportement OK.                                            |
| 6   | Observability                     | **RISK V1.1** : pas de Sentry/logger configuré pour capturer les erreurs auth client-side. À ajouter post-V1 (cf. invariants checklist).                                                          |
| 7   | Pre-fill email après envoi        | Si user clique "Renvoyer", on garde la valeur du form (`form.reset()` non appelé). OK.                                                                                                            |

## Acceptance (grep-testable)

- [ ] `bun run typecheck` → exit 0
- [ ] `bun run lint` → exit 0 (max-warnings 0)
- [ ] `bun run test` → 5 tests passent (2 cn + 2 Login + 3 ProtectedRoute = 7 total)
- [ ] `grep -r "use client" src/` → no match (Vite SPA, pas Next.js)
- [ ] `grep -r "console.log" src/ --include='*.ts' --include='*.tsx'` → no match (rule `no-console`)
- [ ] `grep -rn "any" src/ --include='*.ts' --include='*.tsx' | grep -v "// eslint-disable" | grep -v ".test.ts"` → idéalement aucun `any` non documenté
- [ ] `grep -E "VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY" src/lib/supabase.ts` → 2 matches (env vars utilisées)
- [ ] `grep -rE "service_role|SERVICE_ROLE" src/` → no match (jamais service_role côté client)
- [ ] `bun run build` → exit 0, bundle < 250KB gzip
- [ ] **Manuel** : `bun dev`, ouvrir `/`, redirect `/login`, soumettre email valide, ouvrir Inbucket, clic lien → redirect `/` avec session, click logout → retour `/login`

## Definition of done

- [ ] Steps 1-9 exécutés
- [ ] Tous les tests passent (`bun run test`)
- [ ] Build prod passe (`bun run build`)
- [ ] Smoke manuel auth funnel OK (avec Docker + supabase start, ou sur instance distante)
- [ ] Pas de regression sur tests existants (`utils.test.ts`)
- [ ] Spec déplacée dans `specs/done/03-auth-magic-link.md` avec frontmatter `status: done` + commit hash
- [ ] Commit conventional via `/XD-commit "feat(auth): magic link login + protected routes"`
