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
