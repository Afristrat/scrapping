import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { usePersonas } from './usePersonas'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'test-user-id' } }),
  },
}))

vi.mock('@/hooks/useCurrentOrgId', () => ({
  useCurrentOrgId: () => 'test-org-id',
}))

const mockQueryResult = vi.fn()
const mockMutationSingle = vi.fn()

/**
 * La chaîne Supabase pour la query est :
 *   .from().select().eq(org_id).order('kind').order('name')[.eq(is_archived)]
 *
 * On construit un proxy fluent qui résout à la fin de la chaîne.
 */
function makeFluentChain(terminal: () => Promise<unknown>): unknown {
  const proxy: Record<string, unknown> = {}
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        // Permet d'utiliser l'objet directement dans un await
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          terminal().then(resolve, reject)
      }
      // Toute méthode intermédiaire retourne le même proxy
      return (..._args: unknown[]) => new Proxy(proxy, handler)
    },
  }
  return new Proxy(proxy, handler)
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (_table: string) => ({
      select: () => makeFluentChain(mockQueryResult),
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

const mockPersona = {
  id: '1',
  org_id: 'test-org-id',
  user_id: 'test-user-id',
  kind: 'hat' as const,
  name: 'Analyste',
  key: 'analyste',
  context_md: null,
  date_start: null,
  date_end: null,
  is_archived: false,
  created_at: null,
  updated_at: null,
}

describe('usePersonas', () => {
  it('récupère les personas avec eq org_id et order kind + name', async () => {
    mockQueryResult.mockResolvedValue({ data: [mockPersona], error: null })

    const { result } = renderHook(() => usePersonas(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.name).toBe('Analyste')
  })

  it('expose les mutations createPersona, updatePersona, archivePersona, deletePersona', () => {
    const { result } = renderHook(() => usePersonas(), { wrapper })
    expect(typeof result.current.createPersona.mutate).toBe('function')
    expect(typeof result.current.updatePersona.mutate).toBe('function')
    expect(typeof result.current.archivePersona.mutate).toBe('function')
    expect(typeof result.current.deletePersona.mutate).toBe('function')
  })

  it('createPersona — mutation retourne la persona créée', async () => {
    mockMutationSingle.mockResolvedValue({ data: mockPersona, error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => usePersonas(), { wrapper })

    await act(async () => {
      await result.current.createPersona.mutateAsync({
        kind: 'hat',
        name: 'Analyste',
        key: 'analyste',
      })
    })

    await waitFor(() => expect(result.current.createPersona.isSuccess).toBe(true))
  })

  it('createPersona avec is_shared=true est acceptée sans erreur', async () => {
    const sharedPersona = { ...mockPersona, user_id: null }
    mockMutationSingle.mockResolvedValue({ data: sharedPersona, error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => usePersonas(), { wrapper })

    await act(async () => {
      await result.current.createPersona.mutateAsync({
        kind: 'resource',
        name: 'Ressource partagée',
        key: 'ressource-partagee',
        is_shared: true,
      })
    })

    await waitFor(() => expect(result.current.createPersona.isSuccess).toBe(true))
  })

  it('archivePersona — mutation accepte archived=true', async () => {
    mockMutationSingle.mockResolvedValue({ error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => usePersonas(), { wrapper })

    await act(async () => {
      await result.current.archivePersona.mutateAsync({ id: '1', archived: true })
    })

    await waitFor(() => expect(result.current.archivePersona.isSuccess).toBe(true))
  })

  it('deletePersona — mutation ne retourne rien en cas de succès', async () => {
    mockMutationSingle.mockResolvedValue({ error: null })
    mockQueryResult.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => usePersonas(), { wrapper })

    await act(async () => {
      await result.current.deletePersona.mutateAsync({ id: '1' })
    })

    await waitFor(() => expect(result.current.deletePersona.isSuccess).toBe(true))
  })

  it('showArchived=false — la query est bien activée', async () => {
    mockQueryResult.mockResolvedValue({ data: [mockPersona], error: null })

    const { result } = renderHook(() => usePersonas(false), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeDefined()
  })

  it('showArchived=true — la query retourne aussi les archivées', async () => {
    const archivedPersona = { ...mockPersona, id: '2', is_archived: true }
    mockQueryResult.mockResolvedValue({ data: [mockPersona, archivedPersona], error: null })

    const { result } = renderHook(() => usePersonas(true), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })
})
