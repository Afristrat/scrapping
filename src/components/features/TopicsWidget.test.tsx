import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TopicsWidget } from './TopicsWidget'
import * as useTopicsModule from '@/hooks/useTopics'

function renderWidget() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TopicsWidget />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TopicsWidget', () => {
  it('affiche les emerging puis declining, masque les stable', () => {
    vi.spyOn(useTopicsModule, 'useTopics').mockReturnValue({
      data: [
        {
          id: '1',
          name: 'stable topic',
          slug: 'stable-topic',
          is_seed: true,
          is_emerging: false,
          trend: 'stable',
          baseline_mean: 5,
          baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 50,
          runs: [],
          z_score: 0.3,
        },
        {
          id: '2',
          name: 'inference on-device',
          slug: 'inference-on-device',
          is_seed: true,
          is_emerging: false,
          trend: 'emerging',
          baseline_mean: 2,
          baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 30,
          runs: [],
          z_score: 3.2,
        },
        {
          id: '3',
          name: 'old hype',
          slug: 'old-hype',
          is_seed: false,
          is_emerging: false,
          trend: 'declining',
          baseline_mean: 8,
          baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 80,
          runs: [],
          z_score: -2.1,
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useTopicsModule.useTopics>)

    renderWidget()
    const items = screen.getAllByTestId('topic-row')
    expect(items[0]).toHaveTextContent('inference on-device')
    expect(items[1]).toHaveTextContent('old hype')
    expect(items.length).toBe(2)
  })

  it('affiche un message quand aucun topic actif', () => {
    vi.spyOn(useTopicsModule, 'useTopics').mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useTopicsModule.useTopics>)

    renderWidget()
    expect(screen.getByText(/aucun topic/i)).toBeInTheDocument()
  })
})
