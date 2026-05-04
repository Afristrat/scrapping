import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import QueueMonitor from './QueueMonitor'
import type { PendingEnrichment, QueueStats } from '@/hooks/usePendingEnrichments'

// ---------------------------------------------------------------------------
// Données de test
// ---------------------------------------------------------------------------

const MOCK_STATS: QueueStats = {
  entities: { pending: 3, in_progress: 1, completed: 42, failed: 0 },
  reputation: { pending: 0, in_progress: 0, completed: 18, failed: 2 },
  clustering: { pending: 5, in_progress: 0, completed: 10, failed: 0 },
  neo4j_push: { pending: 0, in_progress: 0, completed: 30, failed: 1 },
}

const MOCK_FAILED: PendingEnrichment[] = [
  {
    id: 'aabbccdd-0000-0000-0000-000000000001',
    signal_id: '11223344-0000-0000-0000-000000000001',
    org_id: 'org-1',
    pass_kind: 'reputation',
    status: 'failed',
    attempts: 3,
    last_error: 'Connection timeout after 30s',
    scheduled_at: '2026-05-01T10:00:00.000Z',
    started_at: null,
    completed_at: null,
    created_at: '2026-05-01T09:59:00.000Z',
  },
  {
    id: 'aabbccdd-0000-0000-0000-000000000002',
    signal_id: '11223344-0000-0000-0000-000000000002',
    org_id: 'org-1',
    pass_kind: 'neo4j_push',
    status: 'failed',
    attempts: 1,
    last_error: 'Neo4j unreachable',
    scheduled_at: '2026-05-01T11:00:00.000Z',
    started_at: null,
    completed_at: null,
    created_at: '2026-05-01T10:59:00.000Z',
  },
]

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/usePendingEnrichments', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/usePendingEnrichments')>(
    '@/hooks/usePendingEnrichments',
  )
  return {
    ...actual,
    useQueueStats: () => ({ data: MOCK_STATS, isLoading: false, isError: false }),
    useFailedJobs: () => ({ data: MOCK_FAILED, isLoading: false, isError: false }),
    useRetryJob: () => ({ mutate: vi.fn(), isPending: false }),
    useRetryAllFailed: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <QueueMonitor />
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueueMonitor', () => {
  it('se rend sans crash', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /queue d.enrichissement/i }),
    ).toBeInTheDocument()
  })

  it('affiche les 4 cartes KPI (une par pass_kind)', () => {
    renderPage()
    // getAllByText car les labels peuvent apparaître aussi dans la table des jobs échoués
    expect(screen.getAllByText('Entités').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Réputation').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Clustering').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Neo4j Push').length).toBeGreaterThanOrEqual(1)
  })

  it('affiche les boutons "Réessayer" pour les jobs échoués', () => {
    renderPage()
    const retryButtons = screen.getAllByRole('button', { name: /réessayer le job/i })
    expect(retryButtons).toHaveLength(MOCK_FAILED.length)
  })
})
