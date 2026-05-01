import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Topics from './Topics'
import * as useTopicsModule from '@/hooks/useTopics'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Topics />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Topics page', () => {
  it('liste tous les topics triés par |z-score|', () => {
    vi.spyOn(useTopicsModule, 'useTopics').mockReturnValue({
      data: [
        {
          id: '1',
          name: 'A topic',
          slug: 'a-topic',
          is_seed: true,
          is_emerging: false,
          trend: 'stable',
          baseline_mean: 5,
          baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 10,
          runs: [
            {
              id: 'r',
              topic_id: '1',
              run_at: '2026-05-01T00:00:00Z',
              signal_count: 5,
              sources: {},
              top_signal_title: null,
              top_signal_score: null,
            },
          ],
          z_score: 0.5,
        },
        {
          id: '2',
          name: 'big mover',
          slug: 'big-mover',
          is_seed: true,
          is_emerging: false,
          trend: 'emerging',
          baseline_mean: 2,
          baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 30,
          runs: [
            {
              id: 'r2',
              topic_id: '2',
              run_at: '2026-05-01T00:00:00Z',
              signal_count: 8,
              sources: {},
              top_signal_title: null,
              top_signal_score: null,
            },
          ],
          z_score: 3.2,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useTopicsModule.useTopics>)

    renderPage()
    expect(screen.getByText(/2 actifs/i)).toBeInTheDocument()
    const rows = screen.getAllByTestId('topic-card')
    expect(rows[0]).toHaveTextContent('big mover')
    expect(rows[1]).toHaveTextContent('A topic')
  })
})
