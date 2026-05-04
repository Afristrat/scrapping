import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DigestScopePanel, type DigestScope } from './DigestScopePanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useTopicsTaxonomy', () => ({
  useTopicsTaxonomy: () => ({
    data: [
      { id: 'topic-1', name: 'LLMs', slug: 'llms', description: null, parent_id: null },
      { id: 'topic-2', name: 'Agents', slug: 'agents', description: null, parent_id: null },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/hooks/usePersonas', () => ({
  usePersonas: () => ({
    data: [
      {
        id: 'persona-1',
        name: 'CTO',
        key: 'cto',
        kind: 'buyer' as const,
        context_md: null,
        date_start: null,
        date_end: null,
        is_archived: false,
        is_shared: false,
      },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/hooks/useCurrentOrgId', () => ({
  useCurrentOrgId: () => 'org-1',
}))

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeQC(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel(props: Partial<React.ComponentProps<typeof DigestScopePanel>> = {}) {
  const qc = makeQC()
  const onGenerate = props.onGenerate ?? vi.fn()
  return {
    onGenerate,
    ...render(
      <QueryClientProvider client={qc}>
        <DigestScopePanel onGenerate={onGenerate} isGenerating={false} {...props} />
      </QueryClientProvider>,
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DigestScopePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('se rend sans crash', () => {
    renderPanel()
    expect(screen.getByTestId('digest-scope-panel')).toBeDefined()
  })

  it('bouton désactivé si aucun topic ni persona sélectionné', () => {
    renderPanel()
    const btn = screen.getByTestId('generate-button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    // Le message d'aide doit être visible
    expect(screen.getByText('Sélectionne au moins 1 topic ou 1 persona')).toBeDefined()
  })

  it('bouton actif si au moins un topic est sélectionné', () => {
    renderPanel()
    // Clic sur le premier badge topic (LLMs)
    const badge = screen.getByTestId('topic-badge-topic-1')
    fireEvent.click(badge)

    const btn = screen.getByTestId('generate-button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    // Le message d'alerte disparaît
    expect(screen.queryByText('Sélectionne au moins 1 topic ou 1 persona')).toBeNull()
  })

  it('onGenerate appelé avec le bon scope quand un topic est sélectionné', () => {
    const onGenerate = vi.fn()
    renderPanel({ onGenerate })

    // Sélectionner le topic "LLMs"
    fireEvent.click(screen.getByTestId('topic-badge-topic-1'))

    // Cliquer sur Générer
    fireEvent.click(screen.getByTestId('generate-button'))

    expect(onGenerate).toHaveBeenCalledOnce()
    const scope = onGenerate.mock.calls[0][0] as DigestScope
    expect(scope.topicIds).toContain('topic-1')
    expect(scope.language).toBe('fr')
    expect(typeof scope.windowHours).toBe('number')
    expect(['score', 'freshness']).toContain(scope.prioritize)
  })

  it("estimation de coût affichée avec '~' et '€'", () => {
    renderPanel()
    const estimate = screen.getByTestId('cost-estimate')
    expect(estimate.textContent).toMatch(/~\d+ signaux/)
    expect(estimate.textContent).toMatch(/€/)
  })
})
