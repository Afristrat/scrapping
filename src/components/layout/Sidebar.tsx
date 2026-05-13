import {
  Activity,
  LayoutDashboard,
  Settings as SettingsIcon,
  ScrollText,
  DollarSign,
  FlaskConical,
  ListChecks,
  LogOut,
  Sparkles,
  Table2,
  TrendingUp,
  UserPlus,
  Users,
  ShieldCheck,
  Crown,
  Sliders,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useIsAppAdmin } from '@/hooks/useIsAppAdmin'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/digest', label: 'Brief', icon: Sparkles },
  { to: '/topics', label: 'Topics', icon: TrendingUp },
  { to: '/explorer', label: 'Explorer', icon: Table2 },
  { to: '/costs', label: 'Coûts', icon: DollarSign },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Paramètres', icon: SettingsIcon },
  { to: '/settings/team', label: 'Équipe', icon: Users },
  { to: '/settings/audit', label: 'Audit log', icon: ShieldCheck },
  { to: '/settings/rubrics/backtest', label: 'Backtest rubriques', icon: FlaskConical },
] as const

export function Sidebar() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const { data: isAdmin = false } = useIsAppAdmin()

  return (
    <aside className="bg-surface-container-low border-outline-variant flex h-screen w-64 flex-col border-r">
      <nav className="flex-1 space-y-1 p-4">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-fixed text-on-primary-fixed border-primary border-r-2'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}

        {isAdmin && (
          <>
            <div className="border-outline-variant my-3 border-t" aria-hidden="true" />
            <Link
              to="/admin"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === '/admin'
                  ? 'bg-primary-fixed text-on-primary-fixed border-primary border-r-2'
                  : 'text-primary hover:bg-primary-fixed/40',
              )}
              aria-current={pathname === '/admin' ? 'page' : undefined}
              title="Réservé aux administrateurs Kairos"
            >
              <Crown className="h-4 w-4" />
              Admin Kairos
            </Link>
            <Link
              to="/admin/settings"
              className={cn(
                'ml-9 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                pathname === '/admin/settings'
                  ? 'bg-primary-fixed text-on-primary-fixed border-primary border-r-2'
                  : 'text-on-surface-variant hover:text-primary hover:bg-primary-fixed/30',
              )}
              aria-current={pathname === '/admin/settings' ? 'page' : undefined}
              title="Paramètres globaux de l'application"
            >
              <Sliders className="h-3.5 w-3.5" />
              Paramètres app
            </Link>
            <Link
              to="/admin/csm"
              className={cn(
                'ml-9 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                pathname === '/admin/csm'
                  ? 'bg-primary-fixed text-on-primary-fixed border-primary border-r-2'
                  : 'text-on-surface-variant hover:text-primary hover:bg-primary-fixed/30',
              )}
              aria-current={pathname === '/admin/csm' ? 'page' : undefined}
              title="Onboarding clients Enterprise"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Onboarding CSM
            </Link>
            <Link
              to="/admin/queue"
              className={cn(
                'ml-9 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                pathname === '/admin/queue'
                  ? 'bg-primary-fixed text-on-primary-fixed border-primary border-r-2'
                  : 'text-on-surface-variant hover:text-primary hover:bg-primary-fixed/30',
              )}
              aria-current={pathname === '/admin/queue' ? 'page' : undefined}
              title="Monitoring de la queue d'enrichissement"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Queue enrichissement
            </Link>
            <Link
              to="/admin/api-inbound"
              className={cn(
                'ml-9 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                pathname === '/admin/api-inbound'
                  ? 'bg-primary-fixed text-on-primary-fixed border-primary border-r-2'
                  : 'text-on-surface-variant hover:text-primary hover:bg-primary-fixed/30',
              )}
              aria-current={pathname === '/admin/api-inbound' ? 'page' : undefined}
              title="Observabilité des appels API entrants (research-from-seed)"
            >
              <Activity className="h-3.5 w-3.5" />
              API Inbound
            </Link>
          </>
        )}
      </nav>

      <div className="border-outline-variant border-t p-4">
        <p className="text-on-surface-variant mb-2 truncate text-xs" title={user?.email ?? ''}>
          {user?.email ?? ''}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-outline-variant text-on-surface w-full justify-start gap-2"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </aside>
  )
}
