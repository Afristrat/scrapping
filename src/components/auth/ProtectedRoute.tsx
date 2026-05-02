import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export function ProtectedRoute(): React.ReactElement {
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
    const next = `${location.pathname}${location.search}${location.hash}`
    const search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''
    return <Navigate to={`/login${search}`} replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
