# Spec — Layout + Sidebar + BrandedHeader

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/08-layout-sidebar-branding.md`
**Estimation** : 1h30 · **Bloque** : 09, 10, 11 · **Bloqué par** : 03 ✅
**Owner contexte** : François dans le plan d'origine — exécution locale par Xavier (parallèle Task 07).

## Problème & Objectifs

Donner aux 4 pages protégées (Dashboard, Settings, Logs, Monitoring) un layout commun :

1. **Sidebar 256px** à gauche : navigation 4 entrées avec highlight de la route active, footer avec email user + bouton logout.
2. **Header brandé** au-dessus du contenu : logo (depuis `settings.branding.logo_url` ou fallback icône) + nom (`branding.name`) + couleur primaire (`branding.primary`) appliquée comme CSS var globale → utilisable par les boutons V1.
3. **Hook `useSettings()`** TanStack Query pour lire la ligne `settings` du user courant (cache partagé toutes pages).

Les 4 pages stubs deviennent visuellement utilisables — pré-requis Tasks 09, 10, 11.

## Non-Goals

- ❌ Édition du branding — c'est Task 10 (Settings page). Ici on consomme `settings`, on ne le modifie pas.
- ❌ Sidebar collapsible / responsive mobile — V1 desktop-first, sidebar fixe 256px. Mobile = hors scope.
- ❌ Notifications / toasts utilitaires — Sonner déjà wiré dans `main.tsx`, on s'en sert mais on n'ajoute pas de centre de notif.
- ❌ Breadcrumbs — la sidebar suffit pour V1 (4 routes plates).
- ❌ Theme switcher (light/dark) — la primary color du branding suffit pour V1.
- ❌ Skeleton du `BrandedHeader` pendant chargement settings — affichage par défaut (fallback icône + nom "zlatan-scrap") qui se met à jour silencieusement quand `useSettings()` résout. Évite un flash visible sur navigation rapide.
- ❌ shadcn/ui sidebar block (CLI `add sidebar`) — V1 = sidebar custom 30 lignes. Plus simple, zéro dépendance Radix supplémentaire pour V1. Refactor vers shadcn block en V1.1 si ergonomie déçoit.

## Approche technique

### Architecture routes (react-router 7)

Actuellement `ProtectedRoute` rend directement `<Outlet/>`. On insère `<AppLayout/>` comme **layout route** entre `ProtectedRoute` et les pages enfants → séparation claire :

- `ProtectedRoute` = auth gate (redirige vers `/login` si pas de session)
- `AppLayout` = chrome visuel (sidebar + header + outlet)

```tsx
// src/routes.tsx (modifié)
{
  element: <ProtectedRoute />,
  children: [
    {
      element: <AppLayout />,           // ← nouveau wrapper
      children: [
        { path: '/', element: <Dashboard /> },
        { path: '/settings', element: <Settings /> },
        { path: '/logs', element: <Logs /> },
        { path: '/monitoring', element: <Monitoring /> },
      ],
    },
  ],
}
```

### Structure fichiers

```
src/
├── components/
│   └── layout/
│       ├── AppLayout.tsx          # CREATE — flex container + Sidebar + main(Outlet)
│       ├── Sidebar.tsx            # CREATE — nav + footer user/logout
│       └── BrandedHeader.tsx      # CREATE — logo + nom + CSS var injection
├── hooks/
│   └── useSettings.ts             # CREATE — TanStack Query
├── routes.tsx                     # EDIT — wire AppLayout
└── components/layout/AppLayout.test.tsx  # CREATE — smoke test (3 routes rendent header+sidebar)
```

### Décisions clés

| #   | Décision                                                                                                                                            | Justification                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Sidebar custom 30 lignes (pas shadcn `add sidebar`)                                                                                                 | V1 simple, refactor V1.1 si besoin (cf. Non-Goals)                                                                                                                                                                 |
| D2  | `useSettings()` TanStack Query, key `['settings']`, staleTime hérite global 30s                                                                     | Settings change rarement (1 ligne user, modifs via Task 10). Pas besoin de polling                                                                                                                                 |
| D3  | `AppLayout` injecte `--brand-primary` sur `<html>` via `useEffect`                                                                                  | Atteint root, accessible partout (`var(--brand-primary)`) — pour boutons custom future. Plus propre que sur `<body>` (CSP safer)                                                                                   |
| D4  | Fallback branding hardcoded si `useSettings()` est `loading`/`error` : `{name:'zlatan-scrap', primary:'#3b82f6', logo_url:null}`                    | Évite un blank flash + matches le DEFAULT côté DB (Task 02 migration). Pas de skeleton UI nécessaire (cf. Non-Goals D6)                                                                                            |
| D5  | Bouton logout dans Sidebar footer (pas dans header)                                                                                                 | Pattern dashboard standard, cohérent avec l'email user. Ne pollue pas le header brandé                                                                                                                             |
| D6  | `Sidebar` highlight active via `useLocation().pathname === to` exact-match                                                                          | 4 routes plates, pas de sous-routes en V1 → exact-match suffit. Pour `/` on accepte aussi `/index` (pas de sous-cas)                                                                                               |
| D7  | `BrandedHeader` : logo `<img>` lazy si `logo_url`, sinon `<Sparkles/>` lucide-react                                                                 | Évite layout shift via `width/height` figés (32×32). Fallback icône lucide cohérente avec le reste shadcn                                                                                                          |
| D8  | Pas de modif de `ProtectedRoute` (zero scope creep)                                                                                                 | Sa responsabilité reste auth. Layout = autre couche                                                                                                                                                                |
| D9  | Test Vitest minimal : `AppLayout.test.tsx` qui render le layout + un mock du `useSettings` → assert sidebar links visible + role banner pour header | Couvre la régression "le layout ne casse pas l'auth flow". Pas de snapshot complet (fragile)                                                                                                                       |
| D10 | `signOut` du store déjà existant — on l'invoque directement, pas de refactor                                                                        | Le store auth.ts a `signOut: () => Promise<void>` (vérifié). Le listener `onAuthStateChange` déclenche la redirection automatique via le `<Navigate to="/login">` de `ProtectedRoute` quand `session` devient null |
| D11 | Aucun changement de `routes.tsx` autre que l'ajout du wrapper `<AppLayout/>`                                                                        | Pas de changement d'URL, pas de redirect — les pages existantes restent atteignables aux mêmes paths                                                                                                               |
| D12 | `useSettings` n'utilise PAS `.eq('user_id', user.id)` — RLS filtre déjà via `auth.uid()`                                                            | Idiomatique Supabase, allège le code, cohérent avec les rules `supabase.md`                                                                                                                                        |

### Code

#### `src/hooks/useSettings.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Branding {
  name: string
  primary: string
  logo_url: string | null
}

export interface Settings {
  user_id: string
  model_scraping: string
  model_scoring: string
  model_monitoring: string
  prompt_scoring: string
  reddit_subs: string[]
  arxiv_categories: string[]
  x_queries: string[]
  branding: Branding
  daily_budget_usd: number
  updated_at: string
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single()
      if (error) throw error
      return data as Settings
    },
  })
}

export const DEFAULT_BRANDING: Branding = {
  name: 'zlatan-scrap',
  primary: '#3b82f6',
  logo_url: null,
}
```

#### `src/components/layout/Sidebar.tsx`

```tsx
import {
  LayoutDashboard,
  Settings as SettingsIcon,
  ScrollText,
  BarChart3,
  LogOut,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/monitoring', label: 'Monitoring', icon: BarChart3 },
] as const

export function Sidebar() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-slate-50">
      <nav className="flex-1 space-y-1 p-4">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-slate-200 font-medium text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <p className="mb-2 truncate text-xs text-slate-500" title={user?.email ?? ''}>
          {user?.email ?? ''}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </aside>
  )
}
```

#### `src/components/layout/BrandedHeader.tsx`

```tsx
import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { DEFAULT_BRANDING, useSettings } from '@/hooks/useSettings'

export function BrandedHeader() {
  const { data: settings } = useSettings()
  const branding = settings?.branding ?? DEFAULT_BRANDING

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', branding.primary)
  }, [branding.primary])

  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-6">
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 rounded object-cover"
        />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded text-white"
          style={{ backgroundColor: branding.primary }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <h1 className="text-lg font-semibold text-slate-900">{branding.name}</h1>
    </header>
  )
}
```

#### `src/components/layout/AppLayout.tsx`

```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BrandedHeader } from './BrandedHeader'

export function AppLayout() {
  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <BrandedHeader />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

#### `src/routes.tsx` (modifié)

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
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
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/settings', element: <Settings /> },
          { path: '/logs', element: <Logs /> },
          { path: '/monitoring', element: <Monitoring /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
```

#### `src/components/layout/AppLayout.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppLayout } from './AppLayout'

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    data: {
      branding: { name: 'Test Brand', primary: '#ff00ff', logo_url: null },
    },
  }),
  DEFAULT_BRANDING: { name: 'fallback', primary: '#3b82f6', logo_url: null },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { email: 'alice@test.local' }, signOut: vi.fn() }),
}))

function renderAt(path: string) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>dashboard-stub</div>} />
            <Route path="/settings" element={<div>settings-stub</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppLayout', () => {
  it('rend le branding nom + tous les liens sidebar + email user', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Test Brand' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /logs/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /monitoring/i })).toBeInTheDocument()
    expect(screen.getByText('alice@test.local')).toBeInTheDocument()
    expect(screen.getByText('dashboard-stub')).toBeInTheDocument()
  })

  it('marque la route active avec aria-current', () => {
    renderAt('/settings')
    const settingsLink = screen.getByRole('link', { name: /settings/i })
    expect(settingsLink).toHaveAttribute('aria-current', 'page')
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    expect(dashboardLink).not.toHaveAttribute('aria-current')
  })
})
```

## Implementation steps

### Phase 1 — Hook useSettings (10 min)

1. Créer `src/hooks/useSettings.ts` avec types `Branding`, `Settings`, hook + export `DEFAULT_BRANDING`.
2. Vérifier que `lib/supabase.ts` exporte bien `supabase` (déjà fait Tasks précédentes).

### Phase 2 — Composants layout (30 min)

1. Créer `src/components/layout/Sidebar.tsx` (nav + footer user + logout).
2. Créer `src/components/layout/BrandedHeader.tsx` (logo + nom + CSS var injection).
3. Créer `src/components/layout/AppLayout.tsx` (flex container).
4. Vérifier `lib/utils.ts` exporte `cn` (déjà fait, sinon `bunx shadcn@latest add button` l'aurait fait).

### Phase 3 — Wire dans routes (5 min)

1. Modifier `src/routes.tsx` : insérer `<AppLayout/>` comme layout route enfant de `ProtectedRoute`.
2. Vérifier les imports.

### Phase 4 — Tests Vitest (15 min)

1. Créer `src/components/layout/AppLayout.test.tsx` (2 tests : rendu + active route).
2. `bun run test` → 9 tests passent (7 existants + 2 nouveaux).

### Phase 5 — Smoke visuel local (15 min)

1. Stack déjà up sur `localhost:5180` (cf. session courante).
2. Hard refresh la page.
3. Login si besoin via Mailpit.
4. Vérifier visuellement :
   - Sidebar 256px à gauche, 4 liens.
   - Header en haut avec icône Sparkles bleu (couleur #3b82f6 default) + "zlatan-scrap".
   - Click chaque lien → URL change + lien actif mis en évidence (bg-slate-200).
   - Click "Déconnexion" → redirige vers `/login`.

### Phase 6 — Cleanup + commit (10 min)

1. `/XD-validate` — typecheck/lint/tests/build verts (9 tests).
2. `git status` :
   - 4 fichiers créés (`useSettings.ts`, `Sidebar.tsx`, `BrandedHeader.tsx`, `AppLayout.tsx`)
   - 1 test créé (`AppLayout.test.tsx`)
   - 1 fichier modifié (`routes.tsx`)
   - Spec move `specs/todo` → `specs/done`
3. `/XD-commit` :
   ```
   feat(layout): app shell with sidebar + branded header (task 08)
   ```

## Test strategy

| Niveau       | Quoi                                    | Comment                              |
| ------------ | --------------------------------------- | ------------------------------------ |
| Compile      | tsconfig front                          | `bun run typecheck` 0 erreur         |
| Lint         | eslint + prettier                       | OK                                   |
| Unit         | `AppLayout.test.tsx` (2 tests)          | render + assert links + active route |
| Smoke visuel | Phase 5                                 | Browser localhost:5180               |
| Régression   | Tests existants (Login, ProtectedRoute) | Doivent rester green                 |

**Pas de test E2E** (Playwright pas dans la stack V1, cf. Non-Goals).

## Success criteria (acceptance grep-testable)

- [ ] `ls src/components/layout/{AppLayout,Sidebar,BrandedHeader}.tsx src/hooks/useSettings.ts` existe.
- [ ] `bun run typecheck` 0 erreur.
- [ ] `bun run lint` 0 erreur (warnings shadcn ok).
- [ ] `bun run test` 9 tests passed.
- [ ] `bun run build` OK (taille < 400 KB main bundle, +10 KB max vs avant).
- [ ] `grep -r "console.log" src/components/layout/ src/hooks/useSettings.ts` → vide.
- [ ] `grep "AppLayout" src/routes.tsx` → 2+ matches (import + usage).
- [ ] Browser `localhost:5180/` après login : sidebar visible 256px à gauche, header en haut, 4 liens nav fonctionnels.
- [ ] Click lien `/settings` → URL change + `aria-current="page"` sur ce lien.
- [ ] Click "Déconnexion" → redirect `/login` après 100ms (auth listener).
- [ ] DevTools : `getComputedStyle(document.documentElement).getPropertyValue('--brand-primary')` retourne `#3b82f6` (ou la valeur DB).

## Risques & décisions

| Risque                                                                                           | Mitigation                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`useSettings()` retourne `error` au 1er render avant que la session soit prête**               | TanStack Query retry default 3× + `BrandedHeader` fallback à `DEFAULT_BRANDING`. Pas de UI cassée                                                                                                      |
| **Trigger DB `init_user_settings` n'a pas tourné pour Alice/Bob** (créés via signup REST direct) | `useSettings` retournera 404 (pas de ligne pour ce user). Le fallback `DEFAULT_BRANDING` cache le pb visuellement. Vérifier en Phase 5 que la ligne settings existe bien (sinon fix migration trigger) |
| **CSS var `--brand-primary` non utilisée par les boutons V1**                                    | C'est OK V1 — les boutons shadcn utilisent les vars Tailwind. La var sert pour Task 10 (preview branding live) et boutons custom V1.1                                                                  |
| **Sidebar `<Link>` cause un re-render qui démonte AppLayout**                                    | Non — react-router 7 garde le layout route monté quand seuls les enfants changent. Vérifié par design                                                                                                  |
| **`signOut` async, mais bouton non disabled pendant l'op**                                       | Sortie immédiate via `onAuthStateChange` listener qui set session=null → `<Navigate>` redirige. UX OK même sans pending state                                                                          |
| **Route `*` reste à `<Navigate to="/" replace>`** alors que `/` est protégé → boucle ?           | Non — `ProtectedRoute` redirige vers `/login` si pas de session, pas vers `/`. Pas de loop                                                                                                             |
| **Test Vitest mock `useSettings` ne respecte pas le shape complet**                              | Mock minimal volontaire (juste `branding`). Le composant ne lit que ça                                                                                                                                 |
| **react-router `useLocation()` dans Sidebar déclenche re-render à chaque navigation**            | OK — c'est le but pour highlight active. Coût négligeable                                                                                                                                              |

**RISK V1.1 — Skeleton loading** : si réseau lent ou Supabase distant, `useSettings` peut prendre 2-3s. Le user verra "zlatan-scrap" puis flash vers son nom custom. Acceptable V1, à améliorer V1.1 avec un Skeleton shadcn.

## Fichiers modifiés / créés

| Path                                                             | Action                                           |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| `src/hooks/useSettings.ts`                                       | **CREATE**                                       |
| `src/components/layout/Sidebar.tsx`                              | **CREATE**                                       |
| `src/components/layout/BrandedHeader.tsx`                        | **CREATE**                                       |
| `src/components/layout/AppLayout.tsx`                            | **CREATE**                                       |
| `src/components/layout/AppLayout.test.tsx`                       | **CREATE**                                       |
| `src/routes.tsx`                                                 | **EDIT** (insertion `<AppLayout/>` layout route) |
| `specs/todo/08-layout-sidebar-branding.md` → `specs/done/08-...` | **MOVE**                                         |

Aucun changement DB, aucune nouvelle dépendance npm (lucide-react, sonner, tanstack-query, react-router déjà présents).

## Estimation détaillée

| Phase                                                | Durée    |
| ---------------------------------------------------- | -------- |
| 1. Hook useSettings                                  | 10 min   |
| 2. Composants layout (3 fichiers)                    | 30 min   |
| 3. Wire routes                                       | 5 min    |
| 4. Tests Vitest (2 tests)                            | 15 min   |
| 5. Smoke visuel local                                | 15 min   |
| 6. Cleanup + commit                                  | 10 min   |
| **Tampon styling Tailwind v4 + ajustements visuels** | 10 min   |
| **Total**                                            | **1h35** |

Cohérent estimation source (1h30) — léger overshoot 5min couvert par le tampon styling (Tailwind v4 + ajustements color tokens slate vs gray peuvent friction).

## Note pour parallélisation Task 07

**Aucun chevauchement de fichier** avec Task 07 :

- Task 07 modifie : `supabase/functions/{llm-score,run-pipeline}/`, `supabase/migrations/20260430000005_*.sql`, `supabase/.env.local`.
- Task 08 modifie : `src/hooks/`, `src/components/layout/`, `src/routes.tsx`.

Merge propre garanti. Task 09 (Dashboard) consommera ensuite **les deux** : appelle `run-pipeline` (Task 07) depuis le `<RunPipelineButton/>` placé dans le `<AppLayout/>` (Task 08).
