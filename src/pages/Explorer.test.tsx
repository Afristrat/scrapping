import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Explorer from './Explorer'
import type { EnrichedSignal } from '@/hooks/useSignalsEnriched'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const NOW = new Date('2026-05-03T10:00:00Z').toISOString()

const MOCK_SIGNALS: EnrichedSignal[] = [
  {
    id: '1',
    org_id: 'org-1',
    user_id: 'user-1',
    source: 'arxiv',
    external_id: 'arxiv-1',
    url: 'https://arxiv.org/abs/1',
    title: 'Signal ArXiv haute score',
    raw_payload: {},
    scraped_at: NOW,
    enriched_at: NOW,
    weight: 1,
    editorial_kind: null,
    topic_slugs: ['ai-infra'],
    top_personas: ['builder'],
    top_entities: [],
    score: 85,
    reasoning: 'Very relevant',
    model_used: 'anthropic/claude-haiku-4.5',
  },
  {
    id: '2',
    org_id: 'org-1',
    user_id: 'user-1',
    source: 'reddit',
    external_id: 'reddit-1',
    url: 'https://reddit.com/r/test/1',
    title: 'Signal Reddit moyen score',
    raw_payload: {},
    scraped_at: NOW,
    enriched_at: NOW,
    weight: 1,
    editorial_kind: null,
    topic_slugs: ['ai-infra'],
    top_personas: ['operator'],
    top_entities: [],
    score: 55,
    reasoning: 'Somewhat relevant',
    model_used: 'anthropic/claude-haiku-4.5',
  },
  {
    id: '3',
    org_id: 'org-1',
    user_id: 'user-1',
    source: 'x',
    external_id: 'x-1',
    url: 'https://x.com/1',
    title: 'Signal X bas score',
    raw_payload: {},
    scraped_at: NOW,
    enriched_at: NOW,
    weight: 1,
    editorial_kind: null,
    topic_slugs: [],
    top_personas: [],
    top_entities: [],
    score: 20,
    reasoning: 'Not very relevant',
    model_used: 'anthropic/claude-haiku-4.5',
  },
]

vi.mock('@/hooks/useSignalsEnriched', () => ({
  useSignalsEnriched: () => ({ data: MOCK_SIGNALS, isLoading: false }),
}))

vi.mock('@/hooks/useTopicsTaxonomy', () => ({
  useTopicsTaxonomy: () => ({
    data: [
      {
        id: 't-1',
        org_id: 'org-1',
        slug: 'ai-infra',
        name: 'AI Infrastructure',
        description: null,
        parent_id: null,
        created_at: NOW,
      },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/hooks/usePersonas', () => ({
  usePersonas: () => ({
    data: [
      {
        id: 'p-1',
        org_id: 'org-1',
        user_id: 'user-1',
        kind: 'buyer',
        name: 'Builder',
        key: 'builder',
        context_md: null,
        date_start: null,
        date_end: null,
        is_archived: false,
        created_at: NOW,
      },
      {
        id: 'p-2',
        org_id: 'org-1',
        user_id: 'user-1',
        kind: 'buyer',
        name: 'Operator',
        key: 'operator',
        context_md: null,
        date_start: null,
        date_end: null,
        is_archived: false,
        created_at: NOW,
      },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/hooks/useCurrentOrgId', () => ({
  useCurrentOrgId: () => 'org-1',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderExplorer(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Explorer />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Explorer page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('se rend sans crash et affiche le titre et le tableau pivot', () => {
    renderExplorer()

    // Titre principal
    expect(screen.getByRole('heading', { level: 1, name: /explorer/i })).toBeInTheDocument()

    // Sélecteurs d'axes
    expect(screen.getByTestId('row-axis-select')).toBeInTheDocument()
    expect(screen.getByTestId('col-axis-select')).toBeInTheDocument()

    // Tableau pivot présent
    expect(screen.getByTestId('pivot-table')).toBeInTheDocument()

    // Bouton export CSV
    expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument()

    // Les 3 sources devraient apparaître en lignes (axe row = source par défaut)
    expect(screen.getByText('arxiv')).toBeInTheDocument()
    expect(screen.getByText('reddit')).toBeInTheDocument()
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('clic sur une cellule affiche le panneau drill-down avec les signaux', () => {
    renderExplorer()

    // Par défaut : lignes = source, colonnes = score_range
    // Signal arxiv a score 85 → plage 70–100
    const cell = screen.getByTestId('cell-arxiv-70–100')
    expect(cell).toBeInTheDocument()

    fireEvent.click(cell)

    // Le panneau de preview doit s'ouvrir
    const panel = screen.getByTestId('signal-preview-panel')
    expect(panel).toBeInTheDocument()

    // Le signal ArXiv doit être visible
    expect(screen.getByText('Signal ArXiv haute score')).toBeInTheDocument()
  })

  it('export CSV crée un élément <a> et déclenche le téléchargement', () => {
    // Espionner URL.createObjectURL + document.createElement
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    const clickMock = vi.fn()

    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })

    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = origCreate('a')
        vi.spyOn(el, 'click').mockImplementation(clickMock)
        return el
      }
      return origCreate(tag)
    })

    renderExplorer()

    const exportBtn = screen.getByTestId('export-csv-btn')
    fireEvent.click(exportBtn)

    // createObjectURL doit avoir été appelé avec un Blob
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    // Le clic sur le lien doit avoir été simulé
    expect(clickMock).toHaveBeenCalledTimes(1)
    // Nettoyage de l'URL
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})
