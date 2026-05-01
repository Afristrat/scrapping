import {
  LayoutDashboard,
  Settings as SettingsIcon,
  ScrollText,
  DollarSign,
  LogOut,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/digest', label: 'Brief', icon: Sparkles },
  { to: '/topics', label: 'Topics', icon: TrendingUp },
  { to: '/costs', label: 'Coûts', icon: DollarSign },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Paramètres', icon: SettingsIcon },
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
