import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useScoreConsensus } from './useScoreConsensus'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useCurrentOrgId', () => ({
  useCurrentOrgId: () => 'org-test',
}))

type ScoreRow = {
  score_consensus: number | null
  score_variance: number | null
  models_used: string[] | null
}

type ScoreRunRow = {
  model: string
  provider: string
  score: number
  reasoning: string | null
}

const mockMaybeSingle = vi.fn<[], Promise<{ data: ScoreRow | null; error: null }>>()
const mockOrder = vi.fn<[], Promise<{ data: ScoreRunRow[]; error: null }>>()

/**
 * Le mock supabase supporte les deux patterns :
 *   1. scores → .select().eq().eq().maybeSingle()
 *   2. score_runs → .select().eq().eq().order()
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          eq: (_col2: string, _val2: string) => ({
            maybeSingle:
              table === 'scores'
                ? mockMaybeSingle
                : vi.fn().mockResolvedValue({ data: null, error: null }),
            order:
              table === 'score_runs'
                ? mockOrder
                : vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}))

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderConsensus(signalId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
  return renderHook(() => useScoreConsensus(signalId), { wrapper })
}

function mockScore(scoreRow: ScoreRow | null, runs: ScoreRunRow[] = []) {
  mockMaybeSingle.mockResolvedValueOnce({ data: scoreRow, error: null })
  mockOrder.mockResolvedValueOnce({ data: runs, error: null })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useScoreConsensus', () => {
  it('retourne agreement=high quand variance < 10', async () => {
    mockScore({ score_consensus: 82, score_variance: 5.5, models_used: ['gpt-4o', 'claude'] }, [
      { model: 'gpt-4o', provider: 'openai', score: 80, reasoning: 'OK' },
      { model: 'claude', provider: 'anthropic', score: 84, reasoning: 'Bon' },
    ])

    const { result } = renderConsensus('sig-1')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('high')
    expect(result.current.data?.consensus).toBe(82)
    expect(result.current.data?.models).toEqual(['gpt-4o', 'claude'])
    expect(result.current.data?.runs).toHaveLength(2)
  })

  it('retourne agreement=medium quand variance entre 10 et 25', async () => {
    mockScore({ score_consensus: 75, score_variance: 18.3, models_used: ['gpt-4o', 'mistral'] })

    const { result } = renderConsensus('sig-2')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('medium')
  })

  it('retourne agreement=low quand variance > 25', async () => {
    mockScore({
      score_consensus: 60,
      score_variance: 44.2,
      models_used: ['gpt-4o', 'claude', 'mistral'],
    })

    const { result } = renderConsensus('sig-3')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('low')
  })

  it('retourne agreement=null quand pas de données consensus', async () => {
    mockScore({ score_consensus: null, score_variance: null, models_used: null })

    const { result } = renderConsensus('sig-4')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBeNull()
    expect(result.current.data?.consensus).toBeNull()
    expect(result.current.data?.models).toEqual([])
  })

  it('retourne null agreement quand data est null', async () => {
    mockScore(null)

    const { result } = renderConsensus('sig-5')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBeNull()
    expect(result.current.data?.consensus).toBeNull()
  })

  it('variance exactement 10 → medium', async () => {
    mockScore({ score_consensus: 70, score_variance: 10, models_used: ['gpt-4o', 'claude'] })

    const { result } = renderConsensus('sig-6')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('medium')
  })

  it('variance exactement 25 → medium (borne incluse)', async () => {
    mockScore({ score_consensus: 65, score_variance: 25, models_used: ['gpt-4o', 'claude'] })

    const { result } = renderConsensus('sig-7')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('medium')
  })
})
