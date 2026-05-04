import { Outlet } from 'react-router-dom'
import { CommandPalette } from '@/components/features/CommandPalette'
import { Sidebar } from './Sidebar'
import { BrandedHeader } from './BrandedHeader'
import { useOrganizations } from '@/hooks/useOrganizations'

export function AppLayout() {
  // Bootstrap : fetch the user's organizations on every mount of an
  // auth-protected layout. The hook syncs the result into `useOrgStore`
  // so all data hooks downstream can read `currentOrgId` reactively.
  useOrganizations()

  return (
    <div className="bg-surface text-on-surface flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <BrandedHeader />
        <main className="bg-surface flex-1 overflow-auto px-6 py-8">
          <div className="mx-auto w-full max-w-[80rem]">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
