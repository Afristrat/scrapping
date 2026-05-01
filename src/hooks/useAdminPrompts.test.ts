import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useAdminPrompts } from './useAdminPrompts'

const mockOrder = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: (...args: unknown[]) => mockOrder(...args),
      }),
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useAdminPrompts', () => {
  it('fetches admin prompts ordered by display_order', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: '1', name: 'Reddit', task_kind: 'reddit', is_seed: true, display_order: 10 },
      ],
      error: null,
    })

    const { result } = renderHook(() => useAdminPrompts(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.task_kind).toBe('reddit')
    expect(mockOrder).toHaveBeenCalledWith('display_order', { ascending: true })
  })
})
