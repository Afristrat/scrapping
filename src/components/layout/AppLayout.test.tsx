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
    expect(screen.getByRole('link', { name: /costs/i })).toBeInTheDocument()
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
