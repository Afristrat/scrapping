import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConsensusBadge } from './ConsensusBadge'
import type { ScoreConsensus } from '@/types/scoring'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseScoreConsensus = vi.fn<
  [string | null | undefined],
  { data: ScoreConsensus | undefined }
>()

vi.mock('@/hooks/useScoreConsensus', () => ({
  useScoreConsensus: (signalId: string | null | undefined) => mockUseScoreConsensus(signalId),
}))

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderBadge(signalId = 'sig-test') {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ConsensusBadge signalId={signalId} />
    </QueryClientProvider>,
  )
}

function makeConsensus(override: Partial<ScoreConsensus>): ScoreConsensus {
  return {
    consensus: 80,
    variance: 5,
    models: ['gpt-4o', 'claude'],
    agreement: 'high',
    runs: [],
    ...override,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConsensusBadge', () => {
  it('retourne null quand agreement est null (pas affiché)', () => {
    mockUseScoreConsensus.mockReturnValue({
      data: makeConsensus({ agreement: null }),
    })

    const { container } = renderBadge()
    expect(container.firstChild).toBeNull()
  })

  it('retourne null quand data est undefined', () => {
    mockUseScoreConsensus.mockReturnValue({ data: undefined })

    const { container } = renderBadge()
    expect(container.firstChild).toBeNull()
  })

  it('affiche un badge vert "Consensus" quand agreement=high', () => {
    mockUseScoreConsensus.mockReturnValue({
      data: makeConsensus({ agreement: 'high', variance: 5 }),
    })

    renderBadge()

    const badge = screen.getByRole('generic', { name: /Consensus scoring : Consensus/i })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('Consensus')
    // Classe verte
    expect(badge.className).toMatch(/emerald/)
  })

  it('affiche un badge jaune "Partiel" quand agreement=medium', () => {
    mockUseScoreConsensus.mockReturnValue({
      data: makeConsensus({ agreement: 'medium', variance: 15 }),
    })

    renderBadge()

    const badge = screen.getByRole('generic', { name: /Consensus scoring : Partiel/i })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('Partiel')
    expect(badge.className).toMatch(/amber/)
  })

  it('affiche un badge rouge "Polarisant" quand agreement=low', () => {
    mockUseScoreConsensus.mockReturnValue({
      data: makeConsensus({ agreement: 'low', variance: 40 }),
    })

    renderBadge()

    const badge = screen.getByRole('generic', { name: /Consensus scoring : Polarisant/i })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('Polarisant')
    expect(badge.className).toMatch(/red/)
  })
})
