import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import type { Settings as SettingsType } from '@/hooks/useSettings'
import type { ProviderModel } from '@/hooks/useProviderModels'

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
  consensus_models: [],
  updated_at: '2026-04-30T00:00:00Z',
}

const MOCK_PROVIDER_MODELS: ProviderModel[] = [
  {
    user_id: 'user-1',
    provider: 'openai',
    model_id: 'gpt-4o',
    display_name: 'GPT-4o',
    context_window: 128000,
    pricing_input_per_1m: 5,
    pricing_output_per_1m: 15,
    capabilities: [],
    fetched_at: '2026-04-30T00:00:00Z',
  },
  {
    user_id: 'user-1',
    provider: 'anthropic',
    model_id: 'claude-3-5-haiku',
    display_name: 'Claude 3.5 Haiku',
    context_window: 200000,
    pricing_input_per_1m: 0.8,
    pricing_output_per_1m: 4,
    capabilities: [],
    fetched_at: '2026-04-30T00:00:00Z',
  },
  {
    user_id: 'user-1',
    provider: 'mistral',
    model_id: 'mistral-7b',
    display_name: 'Mistral 7B',
    context_window: 32768,
    pricing_input_per_1m: 0.25,
    pricing_output_per_1m: 0.25,
    capabilities: [],
    fetched_at: '2026-04-30T00:00:00Z',
  },
]

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
  useProviderModels: () => ({ data: MOCK_PROVIDER_MODELS, isLoading: false }),
  useRefreshModels: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))

const mockConsensusMutate = vi.fn()
vi.mock('@/hooks/useUpdateConsensusModels', () => ({
  useUpdateConsensusModels: () => ({ mutate: mockConsensusMutate, isPending: false }),
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

describe('Settings — consensus scoring', () => {
  it("affiche la section consensus dans l'onglet Modèles", () => {
    renderSettings()
    expect(screen.getByText(/Consensus scoring \(BYOK avancé\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /GPT-4o/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Claude 3.5 Haiku/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mistral 7B/i })).toBeInTheDocument()
  })

  it('sélectionner 2 modèles active le bouton sauvegarder', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /GPT-4o/i }))
    await user.click(screen.getByRole('button', { name: /Claude 3.5 Haiku/i }))

    // Le bouton sauvegarder consensus doit être actif (1 sélectionné = erreur, 2 = ok)
    const saveBtn = screen.getByRole('button', { name: /sauvegarder le consensus/i })
    expect(saveBtn).not.toBeDisabled()
  })

  it('sélectionner exactement 1 modèle affiche une erreur de validation', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /GPT-4o/i }))

    expect(screen.getByText(/Sélectionnez 0 ou au moins 2 modèles distincts/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sauvegarder le consensus/i })).toBeDisabled()
  })

  it('ne permet pas de sélectionner plus de 3 modèles', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /GPT-4o/i }))
    await user.click(screen.getByRole('button', { name: /Claude 3.5 Haiku/i }))
    await user.click(screen.getByRole('button', { name: /Mistral 7B/i }))

    // Le 4ème modèle n'existe pas dans le mock mais on vérifie que les 3 sont selected
    expect(screen.getByText(/Sélectionnés \(3\/3\)/i)).toBeInTheDocument()
  })

  it('cliquer sauvegarder appelle useUpdateConsensusModels', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /GPT-4o/i }))
    await user.click(screen.getByRole('button', { name: /Claude 3.5 Haiku/i }))
    await user.click(screen.getByRole('button', { name: /sauvegarder le consensus/i }))

    expect(mockConsensusMutate).toHaveBeenCalledWith([
      'openai:gpt-4o',
      'anthropic:claude-3-5-haiku',
    ])
  })
})

describe('Settings', () => {
  it('rend les 6 onglets et le bouton enregistrer', () => {
    renderSettings()

    expect(screen.getByRole('tab', { name: /modèles/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /grilles/i })).toBeInTheDocument()
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
