import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { INITIAL_SIGNAL_FILTERS } from '@/lib/signal-filters'
import type { SignalFilters } from '@/lib/signal-filters'
import { DashboardFilters } from './DashboardFilters'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useTopicsTaxonomy', () => ({
  useTopicsTaxonomy: () => ({
    data: [
      {
        id: 't1',
        slug: 'llm',
        name: 'LLM',
        org_id: 'org1',
        description: null,
        parent_id: null,
        created_at: '',
      },
      {
        id: 't2',
        slug: 'agents',
        name: 'Agents',
        org_id: 'org1',
        description: null,
        parent_id: null,
        created_at: '',
      },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/hooks/usePersonas', () => ({
  usePersonas: () => ({
    data: [
      {
        id: 'p1',
        key: 'founder',
        name: 'Fondateur',
        org_id: 'org1',
        kind: 'investor',
        context_md: null,
        is_archived: false,
        date_start: null,
        date_end: null,
        user_id: null,
        created_at: '',
      },
      {
        id: 'p2',
        key: 'cto',
        name: 'CTO',
        org_id: 'org1',
        kind: 'operator',
        context_md: null,
        is_archived: false,
        date_start: null,
        date_end: null,
        user_id: null,
        created_at: '',
      },
    ],
    isLoading: false,
  }),
}))

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderFilters(
  filters: SignalFilters = INITIAL_SIGNAL_FILTERS,
  onChange = vi.fn(),
  onReset = vi.fn(),
  resultCount?: number,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onChange,
    onReset,
    ...render(
      <QueryClientProvider client={qc}>
        <DashboardFilters
          filters={filters}
          onChange={onChange}
          onReset={onReset}
          resultCount={resultCount}
        />
      </QueryClientProvider>,
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardFilters', () => {
  it('render sans crash et affiche les sections attendues', () => {
    renderFilters()

    // Sections principales présentes
    expect(screen.getByText(/sources/i)).toBeInTheDocument()
    expect(screen.getByText(/topics/i)).toBeInTheDocument()
    expect(screen.getByText(/personas/i)).toBeInTheDocument()
    expect(screen.getByText(/fenêtre/i)).toBeInTheDocument()

    // Boutons sources
    expect(screen.getByRole('button', { name: /reddit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /arxiv/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^x$/i })).toBeInTheDocument()

    // Topics
    expect(screen.getByText('LLM')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()

    // Compteur si fourni — texte réparti sur plusieurs nœuds React (interpolation JSX)
    // → on vérifie que le container inclut le chiffre "42" dans son textContent global
    const { container: c2 } = renderFilters(INITIAL_SIGNAL_FILTERS, vi.fn(), vi.fn(), 42)
    expect(c2.textContent).toMatch(/42 signal/i)
  })

  it('clic sur un topic toggle sa sélection via onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFilters(INITIAL_SIGNAL_FILTERS, onChange)

    const llmBadge = screen.getByTestId('topic-badge-llm')
    await user.click(llmBadge)

    expect(onChange).toHaveBeenCalledTimes(1)
    const called = onChange.mock.calls[0][0] as SignalFilters
    expect(called.topicSlugs).toContain('llm')

    // Deuxième clic : dé-sélectionne — rendu isolé dans un container dédié
    const onChange2 = vi.fn()
    const { container: c2 } = renderFilters(
      { ...INITIAL_SIGNAL_FILTERS, topicSlugs: ['llm'] },
      onChange2,
    )
    const llmBadge2 = within(c2).getByTestId('topic-badge-llm')
    await user.click(llmBadge2)
    const called2 = onChange2.mock.calls[0][0] as SignalFilters
    expect(called2.topicSlugs).not.toContain('llm')
  })

  it('clic sur un bouton source toggle via onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFilters(INITIAL_SIGNAL_FILTERS, onChange)

    const redditBtn = screen.getByTestId('source-toggle-reddit')
    await user.click(redditBtn)

    expect(onChange).toHaveBeenCalledTimes(1)
    const called = onChange.mock.calls[0][0] as SignalFilters
    expect(called.sources).toContain('reddit')
  })

  it('bouton Réinitialiser visible seulement si filtres actifs', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()

    // Aucun filtre actif → bouton absent
    const { rerender } = renderFilters(INITIAL_SIGNAL_FILTERS, vi.fn(), onReset)
    expect(screen.queryByRole('button', { name: /réinitialiser/i })).not.toBeInTheDocument()

    // Avec un filtre actif → bouton présent
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      <QueryClientProvider client={qc}>
        <DashboardFilters
          filters={{ ...INITIAL_SIGNAL_FILTERS, sources: ['reddit'] }}
          onChange={vi.fn()}
          onReset={onReset}
        />
      </QueryClientProvider>,
    )
    const resetBtn = screen.getByRole('button', { name: /réinitialiser/i })
    expect(resetBtn).toBeInTheDocument()
    await user.click(resetBtn)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('onChange est appelé lors du changement de fenêtre temporelle', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFilters(INITIAL_SIGNAL_FILTERS, onChange)

    const btn24h = screen.getByTestId('window-btn-24h')
    await user.click(btn24h)

    expect(onChange).toHaveBeenCalledTimes(1)
    const called = onChange.mock.calls[0][0] as SignalFilters
    expect(called.windowHours).toBe(24)
  })
})
