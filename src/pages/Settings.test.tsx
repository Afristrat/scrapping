import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import type { Settings as SettingsType } from '@/hooks/useSettings'

const MOCK_SETTINGS: SettingsType = {
  user_id: 'user-1',
  prompt_scoring: 'Score ce signal de 0 a 100 selon sa pertinence pour un builder IA.',
  reddit_subs: ['MachineLearning', 'LocalLLaMA'],
  arxiv_categories: ['cs.AI'],
  x_queries: ['#LLM'],
  topic_seeds: [],
  model_config: {},
  branding: {
    name: 'Mon Dashboard',
    primary: '#3b82f6',
    logo_url: null,
  },
  daily_budget_usd: 5,
  active_rubric_id: null,
  source_priority: { reddit: 1, arxiv: 1, x: 1 },
  apify_config: {
    x_list_ids: [],
    x_max_items: 50,
    reddit_actor: 'automation-lab/reddit-scraper',
    reddit_sort: 'hot',
    reddit_time_filter: 'week',
    reddit_max_per_sub: 25,
  },
  language: 'fr',
  score_concurrency: 20,
  updated_at: '2026-04-30T00:00:00Z',
}

const mockMutate = vi.fn()

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ data: MOCK_SETTINGS, isLoading: false }),
}))

vi.mock('@/hooks/useUpdateSettings', () => ({
  useUpdateSettings: () => ({ mutate: mockMutate, isPending: false }),
}))

vi.mock('@/hooks/useApiKeys', () => ({
  useApiKeys: () => ({ data: [], isLoading: false }),
  useUpsertApiKey: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteApiKey: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateApiKeyValidation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/useLLMProviders', () => ({
  useLLMProviders: () => ({ data: [], isLoading: false }),
}))

vi.mock('@/hooks/useProviderModels', () => ({
  useProviderModels: () => ({ data: [], isLoading: false }),
  useRefreshModels: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/useValidateApiKey', () => ({
  useValidateApiKey: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  toDbValidationStatus: (s: string) =>
    s === 'verified' ? 'valid' : s === 'invalid' ? 'invalid' : 'unknown',
}))

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ data: [], isLoading: false }),
  useCreateRubric: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRubric: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRubric: () => ({ mutate: vi.fn(), isPending: false }),
  useSetActiveRubric: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        neq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: 'https://example.com/logo.png' } }),
      }),
    },
  },
}))

function renderSettings() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <Settings />
    </QueryClientProvider>,
  )
}

describe('Settings', () => {
  it('rend les 6 onglets et le bouton enregistrer', () => {
    renderSettings()

    expect(screen.getByRole('tab', { name: /modèles/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /rubriques/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /sources/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /clés api/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /branding/i })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument()
  })

  it('switch entre onglets', async () => {
    const user = userEvent.setup()
    renderSettings()

    // Default tab is Models, should show BYOK card
    expect(screen.getByText(/Modèles par tâche \(BYOK\)/)).toBeInTheDocument()

    // Click Sources tab
    await user.click(screen.getByRole('tab', { name: /sources/i }))
    expect(screen.getByText(/sources de donn/i)).toBeInTheDocument()

    // Click Branding tab
    await user.click(screen.getByRole('tab', { name: /branding/i }))
    expect(screen.getByText('Budget quotidien')).toBeInTheDocument()
  })
})
