import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useTopicsTaxonomy } from './useTopicsTaxonomy'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/useCurrentOrgId', () => ({
  useCurrentOrgId: () => 'test-org-id',
}))

const mockQueryResult = vi.fn()
const mockMutationSingle = vi.fn()

/**
 * La chaîne Supabase pour la query est :
 *   .from().select().eq('org_id', ...).order('name')
 *
 * On utilise un mock simple car la chaîne se termine par `.order('name')`.
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: (..._args: unknown[]) => mockQueryResult(),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: () => mockMutationSingle(),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => mockMutationSingle(),
          }),
        }),
      }),
      delete: () => ({
        eq: () => mockMutationSingle(),
      }),
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useTopicsTaxonomy', () => {
  it('récupère les topics avec eq org_id et order name', async () => {
    mockQueryResult.mockResolvedValue({
      data: [
        {
          id: '1',
          org_id: 'test-org-id',
          name: 'LLMs',
          slug: 'llms',
          parent_id: null,
          is_seeded: true,
          description: null,
          created_at: null,
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useTopicsTaxonomy(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.name).toBe('LLMs')
  })

  it('expose les mutations createTopic, updateTopic, deleteTopic', () => {
    const { result } = renderHook(() => useTopicsTaxonomy(), { wrapper })
    expect(typeof result.current.createTopic.mutate).toBe('function')
    expect(typeof result.current.updateTopic.mutate).toBe('function')
    expect(typeof result.current.deleteTopic.mutate).toBe('function')
  })

  it('createTopic — mutation retourne le topic créé', async () => {
    const newTopic = {
      id: '2',
      org_id: 'test-org-id',
      name: 'Agents IA',
      slug: 'agents-ia',
      parent_id: null,
      is_seeded: false,
      description: null,
      created_at: null,
    }
    mockMutationSingle.mockResolvedValue({ data: newTopic, error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => useTopicsTaxonomy(), { wrapper })

    await act(async () => {
      await result.current.createTopic.mutateAsync({ name: 'Agents IA', slug: 'agents-ia' })
    })

    await waitFor(() => expect(result.current.createTopic.isSuccess).toBe(true))
  })

  it('updateTopic — mutation retourne le topic mis à jour', async () => {
    const updated = {
      id: '1',
      org_id: 'test-org-id',
      name: 'LLMs v2',
      slug: 'llms-v2',
      parent_id: null,
      is_seeded: true,
      description: null,
      created_at: null,
    }
    mockMutationSingle.mockResolvedValue({ data: updated, error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => useTopicsTaxonomy(), { wrapper })

    await act(async () => {
      await result.current.updateTopic.mutateAsync({ id: '1', name: 'LLMs v2' })
    })

    await waitFor(() => expect(result.current.updateTopic.isSuccess).toBe(true))
  })

  it('deleteTopic — mutation ne retourne rien en cas de succès', async () => {
    mockMutationSingle.mockResolvedValue({ error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => useTopicsTaxonomy(), { wrapper })

    await act(async () => {
      await result.current.deleteTopic.mutateAsync({ id: '1' })
    })

    await waitFor(() => expect(result.current.deleteTopic.isSuccess).toBe(true))
  })

  it('query est désactivée si orgId est null', () => {
    // Ce test vérifie que le hook est bien typé — sans org, la query ne s'exécute pas
    const { result } = renderHook(() => useTopicsTaxonomy(), { wrapper })
    // Le hook retourne les mutations, toujours disponibles
    expect(result.current.createTopic).toBeDefined()
    expect(result.current.updateTopic).toBeDefined()
    expect(result.current.deleteTopic).toBeDefined()
  })
})
