import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import Costs from './Costs'
import type { CostByDayRow, CostRow } from '@/hooks/useLLMCosts'

const NOW = Date.now()
const RECENT: CostRow[] = [
  {
    task: 'scoring',
    model: 'anthropic/claude-haiku-4.5',
    prompt_tokens: 1000,
    completion_tokens: 200,
    cost: 0.0012,
    ts: new Date(NOW - 86_400_000).toISOString(),
  },
  {
    task: 'scoring',
    model: 'anthropic/claude-haiku-4.5',
    prompt_tokens: 800,
    completion_tokens: 150,
    cost: 0.0009,
    ts: new Date(NOW - 2 * 86_400_000).toISOString(),
  },
]
const BY_DAY: CostByDayRow[] = [
  { day: '2026-04-29', task: 'scoring', total_cost: 0.0012 },
  { day: '2026-04-28', task: 'scoring', total_cost: 0.0009 },
]

vi.mock('@/hooks/useLLMCosts', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useLLMCosts')>('@/hooks/useLLMCosts')
  return {
    ...actual,
    useCostsByDay: () => ({ data: BY_DAY, isLoading: false }),
    useLLMCostsRecent: () => ({ data: RECENT, isLoading: false }),
  }
})

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    data: { daily_budget_usd: 5 },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/useTokensSummary', () => ({
  useTokensSummary: () => ({
    data: [
      {
        day: '2026-04-29',
        model: 'anthropic/claude-haiku-4.5',
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_cost: 0.0012,
        calls: 1,
      },
    ],
    isLoading: false,
  }),
}))

function renderCosts() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <Costs />
    </QueryClientProvider>,
  )
}

describe('Costs', () => {
  it('rend le titre, le total cost card et le breakdown', () => {
    renderCosts()
    expect(screen.getByRole('heading', { level: 2, name: /co.ts/i })).toBeInTheDocument()
    expect(screen.getByText(/Coût total/i)).toBeInTheDocument()
    expect(screen.getAllByText(/anthropic\/claude-haiku-4\.5/).length).toBeGreaterThan(0)
  })

  it('affiche les boutons de periode', () => {
    renderCosts()
    expect(screen.getByRole('button', { name: '7j' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30j' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '90j' })).toBeInTheDocument()
  })
})
