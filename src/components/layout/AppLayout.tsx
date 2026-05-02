import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BrandedHeader } from './BrandedHeader'
import { useOrganizations } from '@/hooks/useOrganizations'

export function AppLayout() {
  // Bootstrap : fetch the user's organizations on every mount of an
  // auth-protected layout. The hook syncs the result into `useOrgStore`
  // so all data hooks downstream can read `currentOrgId` reactively.
  useOrganizations()

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
