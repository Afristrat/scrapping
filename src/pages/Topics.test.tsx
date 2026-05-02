import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Topics from './Topics'
import * as useTopicsModule from '@/hooks/useTopics'

function renderPage(): ReturnType<typeof render> {
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
  it('groupe les topics par trend (emerging avant stable) et trie par |z-score|', () => {
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
          baseline_m2: 4,
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
          baseline_m2: 1,
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
        {
          id: '3',
          name: 'tiny seed',
          slug: 'tiny-seed',
          is_seed: false,
          is_emerging: false,
          trend: 'warming_up',
          baseline_mean: 1,
          baseline_m2: 0,
          baseline_n: 3,
          last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 4,
          runs: [
            {
              id: 'r3',
              topic_id: '3',
              run_at: '2026-05-01T00:00:00Z',
              signal_count: 2,
              sources: {},
              top_signal_title: null,
              top_signal_score: null,
            },
          ],
          z_score: 0,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useTopicsModule.useTopics>)

    renderPage()

    // Les 4 sections trend doivent toutes apparaître (helpers pédagogiques visibles)
    expect(screen.getByTestId('trend-section-emerging')).toBeTruthy()
    expect(screen.getByTestId('trend-section-declining')).toBeTruthy()
    expect(screen.getByTestId('trend-section-stable')).toBeTruthy()
    expect(screen.getByTestId('trend-section-warming_up')).toBeTruthy()

    // Header avec le compteur total
    expect(screen.getByText(/3 actifs/i)).toBeTruthy()

    // Help dialog trigger présent
    expect(screen.getByRole('button', { name: /comment lire cette page/i })).toBeTruthy()

    // Topic cards rendus dans l'ordre des sections : emerging puis stable puis warming_up
    const rows = screen.getAllByTestId('topic-card')
    expect(rows.length).toBe(3)
    expect(rows[0].textContent ?? '').toContain('big mover')
    expect(rows[1].textContent ?? '').toContain('A topic')
    expect(rows[2].textContent ?? '').toContain('tiny seed')

    // Action suggérée pour le topic emerging : lien "Explorer les signaux" vers le slug
    const exploreLink = screen.getByRole('link', { name: /explorer les signaux/i })
    expect(exploreLink.getAttribute('href')).toBe('/?topic=big-mover')

    // Action suggérée pour le topic en calibrage
    expect(screen.getByText(/continuer à laisser tourner/i)).toBeTruthy()
  })
})
