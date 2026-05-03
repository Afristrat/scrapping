import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useScoreConsensus } from './useScoreConsensus'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useCurrentOrgId', () => ({
  useCurrentOrgId: () => 'org-test',
}))

type MaybeSingleReturn = {
  data: {
    score_consensus: number | null
    score_variance: number | null
    models_used: string[] | null
  } | null
  error: null
}

const mockMaybeSingle = vi.fn<[], Promise<MaybeSingleReturn>>()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          eq: (_col2: string, _val2: string) => ({
            maybeSingle: mockMaybeSingle,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useScoreConsensus', () => {
  it('retourne agreement=high quand variance < 10', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { score_consensus: 82, score_variance: 5.5, models_used: ['gpt-4o', 'claude'] },
      error: null,
    })

    const { result } = renderConsensus('sig-1')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('high')
    expect(result.current.data?.consensus).toBe(82)
    expect(result.current.data?.models).toEqual(['gpt-4o', 'claude'])
  })

  it('retourne agreement=medium quand variance entre 10 et 25', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { score_consensus: 75, score_variance: 18.3, models_used: ['gpt-4o', 'mistral'] },
      error: null,
    })

    const { result } = renderConsensus('sig-2')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('medium')
  })

  it('retourne agreement=low quand variance > 25', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        score_consensus: 60,
        score_variance: 44.2,
        models_used: ['gpt-4o', 'claude', 'mistral'],
      },
      error: null,
    })

    const { result } = renderConsensus('sig-3')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('low')
  })

  it('retourne agreement=null quand pas de données consensus', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { score_consensus: null, score_variance: null, models_used: null },
      error: null,
    })

    const { result } = renderConsensus('sig-4')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBeNull()
    expect(result.current.data?.consensus).toBeNull()
    expect(result.current.data?.models).toEqual([])
  })

  it('retourne null agreement quand data est null', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const { result } = renderConsensus('sig-5')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBeNull()
    expect(result.current.data?.consensus).toBeNull()
  })

  it('variance exactement 10 → medium', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { score_consensus: 70, score_variance: 10, models_used: ['gpt-4o', 'claude'] },
      error: null,
    })

    const { result } = renderConsensus('sig-6')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('medium')
  })

  it('variance exactement 25 → medium (borne incluse)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { score_consensus: 65, score_variance: 25, models_used: ['gpt-4o', 'claude'] },
      error: null,
    })

    const { result } = renderConsensus('sig-7')
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data?.agreement).toBe('medium')
  })
})
