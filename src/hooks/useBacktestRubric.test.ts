import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useBacktestRubric } from './useBacktestRubric'

// Mock sonner pour éviter les erreurs de rendu dans les tests
vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockGetSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useBacktestRubric', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
    vi.clearAllMocks()
    // Restaurer les mocks de session après clearAllMocks
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: retourne les résultats avec delta', async () => {
    const mockResults = [
      {
        signal_id: 'sig-1',
        title: 'Signal A',
        current_score: 50,
        backtested_score: 80,
        delta: 30,
        reasoning_new: 'Très pertinent',
      },
      {
        signal_id: 'sig-2',
        title: 'Signal B',
        current_score: 70,
        backtested_score: 60,
        delta: -10,
        reasoning_new: 'Moins pertinent',
      },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, results: mockResults }),
    })

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        rubric_prompt: 'Score this signal for AI relevance',
        max_signals: 50,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0]?.delta).toBe(30)
    expect(result.current.data?.[1]?.delta).toBe(-10)
  })

  it('409 backtest_in_progress → erreur backtest_in_progress', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ ok: false, error: 'backtest_in_progress' }),
    })

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    let caughtError: Error | null = null
    await act(async () => {
      try {
        await result.current.mutateAsync({ rubric_prompt: 'Test prompt' })
      } catch (e) {
        caughtError = e as Error
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(caughtError?.message).toBe('backtest_in_progress')
  })

  it('erreur générique → isError avec message approprié', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ ok: false, error: 'internal_error' }),
    })

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    let caughtError: Error | null = null
    await act(async () => {
      try {
        await result.current.mutateAsync({ rubric_prompt: 'Test prompt' })
      } catch (e) {
        caughtError = e as Error
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(caughtError?.message).toBe('internal_error')
  })

  it('non authentifié → erreur not_authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    })

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    let caughtError: Error | null = null
    await act(async () => {
      try {
        await result.current.mutateAsync({ rubric_prompt: 'Test prompt' })
      } catch (e) {
        caughtError = e as Error
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(caughtError?.message).toBe('not_authenticated')
  })

  // ─── US-9.2.5 : Cap simultané + cancel ────────────────────────────────────

  it('409 → toast warning affiché', async () => {
    const { toast } = await import('sonner')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ ok: false, error: 'backtest_in_progress' }),
    })

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ rubric_prompt: 'Test prompt' }).catch(() => {})
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.warning).toHaveBeenCalledWith(
      'Un backtest est déjà en cours pour ce compte.',
    )
  })

  it('cancel: reset mutation → isIdle', async () => {
    // Simuler un fetch qui ne se résout jamais (requête en cours)
    let resolvePromise: (() => void) | null = null
    mockFetch.mockReturnValueOnce(
      new Promise((_resolve) => {
        resolvePromise = () =>
          _resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: true, results: [] }),
          })
      }),
    )

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    // Lance la mutation sans attendre
    act(() => {
      result.current.mutate({ rubric_prompt: 'Test prompt' })
    })

    await waitFor(() => expect(result.current.isPending).toBe(true))

    // Annule via cancel
    act(() => {
      result.current.cancel()
    })

    await waitFor(() => expect(result.current.isIdle).toBe(true))

    // Nettoyage : on résout quand même la promesse
    resolvePromise?.()
  })

  it('AbortSignal: fetch receive signal dans les options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, results: [] }),
    })

    const { result } = renderHook(() => useBacktestRubric(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ rubric_prompt: 'Test prompt' })
    })

    // Vérifier que fetch a été appelé avec un signal AbortController
    expect(mockFetch).toHaveBeenCalledOnce()
    const callArgs = mockFetch.mock.calls[0][1] as RequestInit
    expect(callArgs.signal).toBeDefined()
    expect(callArgs.signal).toBeInstanceOf(AbortSignal)
  })

  it('hook expose cancel function', () => {
    const { result } = renderHook(() => useBacktestRubric(), { wrapper })
    expect(typeof result.current.cancel).toBe('function')
  })
})
