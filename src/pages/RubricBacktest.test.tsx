import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import RubricBacktest from './RubricBacktest'
import type { BacktestResult } from '@/hooks/useBacktestRubric'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    data: {
      model_config: { scoring: { provider: 'openrouter', model: 'anthropic/claude-haiku-4.5' } },
      daily_budget_usd: 5,
    },
    isLoading: false,
  }),
}))

const mockBacktestMutate = vi.fn()
const mockIsPending = { value: false }
const mockIsSuccess = { value: false }
const mockData = { value: null as BacktestResult[] | null }

vi.mock('@/hooks/useBacktestRubric', () => ({
  useBacktestRubric: () => ({
    mutate: mockBacktestMutate,
    mutateAsync: mockBacktestMutate,
    isPending: mockIsPending.value,
    isSuccess: mockIsSuccess.value,
    data: mockData.value,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}))

const mockEstimatedCost = { value: 0 }

vi.mock('@/hooks/useBacktestCostEstimate', () => ({
  useBacktestCostEstimate: () => ({
    estimatedCost: mockEstimatedCost.value,
    tokensIn: 3000,
    tokensOut: 1000,
  }),
}))

vi.mock('@/hooks/useFormatCost', () => ({
  useFormatCost: () => (usd: number) => `$${usd.toFixed(2)}`,
}))

vi.mock('@/hooks/useRubrics', () => ({
  useCreateRubric: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/components/features/BacktestComparator', () => ({
  BacktestComparator: ({ results }: { results: BacktestResult[] }) => (
    <div data-testid="backtest-comparator">Results: {results.length}</div>
  ),
}))

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RubricBacktest />
    </QueryClientProvider>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RubricBacktest', () => {
  beforeEach(() => {
    mockBacktestMutate.mockReset()
    mockIsPending.value = false
    mockIsSuccess.value = false
    mockData.value = null
    mockEstimatedCost.value = 0
  })

  it('rend le formulaire avec les éléments principaux', () => {
    renderPage()

    expect(screen.getByText('Backtest de rubric')).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt de scoring')).toBeInTheDocument()
    expect(screen.getByText(/Critères pondérés/)).toBeInTheDocument()
    expect(screen.getByText('Lancer le backtest')).toBeInTheDocument()
    expect(screen.getByText('Coût estimé')).toBeInTheDocument()
  })

  it('bouton désactivé si prompt vide', () => {
    renderPage()
    const btn = screen.getByRole('button', { name: /lancer le backtest/i })
    expect(btn).toBeDisabled()
  })

  it('bouton activé quand prompt renseigné', () => {
    renderPage()
    const textarea = screen.getByLabelText('Prompt de scoring')
    fireEvent.change(textarea, { target: { value: 'Mon prompt de scoring IA' } })
    const btn = screen.getByRole('button', { name: /lancer le backtest/i })
    expect(btn).not.toBeDisabled()
  })

  it('lancer backtest sans confirm si coût <= seuil', async () => {
    mockEstimatedCost.value = 1.0 // < 5.5 USD
    renderPage()

    const textarea = screen.getByLabelText('Prompt de scoring')
    fireEvent.change(textarea, { target: { value: 'Mon prompt de scoring IA' } })

    const btn = screen.getByRole('button', { name: /lancer le backtest/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockBacktestMutate).toHaveBeenCalledOnce()
    })

    // Pas de dialog de confirmation
    expect(screen.queryByText(/Coût estimé élevé/)).not.toBeInTheDocument()
  })

  it('coût > seuil → AlertDialog de confirmation affiché', async () => {
    mockEstimatedCost.value = 8.0 // > 5.5 USD
    renderPage()

    const textarea = screen.getByLabelText('Prompt de scoring')
    fireEvent.change(textarea, { target: { value: 'Mon prompt de scoring IA très long' } })

    const btn = screen.getByRole('button', { name: /lancer le backtest/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByText('Coût estimé élevé')).toBeInTheDocument()
    })

    // Le backtest ne doit pas avoir été lancé sans confirmation
    expect(mockBacktestMutate).not.toHaveBeenCalled()
  })

  it('confirm dialog → lancer backtest après confirmation', async () => {
    mockEstimatedCost.value = 8.0
    renderPage()

    const textarea = screen.getByLabelText('Prompt de scoring')
    fireEvent.change(textarea, { target: { value: 'Mon prompt de scoring IA très long' } })

    fireEvent.click(screen.getByRole('button', { name: /lancer le backtest/i }))

    await waitFor(() => {
      expect(screen.getByText('Coût estimé élevé')).toBeInTheDocument()
    })

    // Clic sur "Lancer quand même"
    fireEvent.click(screen.getByRole('button', { name: /lancer quand même/i }))

    await waitFor(() => {
      expect(mockBacktestMutate).toHaveBeenCalledOnce()
    })
  })

  it('JSON criteria invalide → message d\'erreur', async () => {
    renderPage()

    const criteriaTextarea = screen.getByPlaceholderText(/label.*weight/i)
    fireEvent.change(criteriaTextarea, { target: { value: 'invalid json {[' } })

    const promptTextarea = screen.getByLabelText('Prompt de scoring')
    fireEvent.change(promptTextarea, { target: { value: 'Mon prompt' } })

    fireEvent.click(screen.getByRole('button', { name: /lancer le backtest/i }))

    await waitFor(() => {
      expect(screen.getByText('JSON invalide')).toBeInTheDocument()
    })
    expect(mockBacktestMutate).not.toHaveBeenCalled()
  })
})
