import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Logs from './Logs'
import type { LogRow } from '@/hooks/useLogs'

const MOCK_LOGS: LogRow[] = [
  {
    id: 1,
    user_id: 'user-1',
    action: 'scrape:reddit',
    payload: { sub: 'MachineLearning' },
    status: 'ok',
    ts: new Date().toISOString(),
  },
  {
    id: 2,
    user_id: 'user-1',
    action: 'llm:score',
    payload: null,
    status: 'error',
    ts: new Date().toISOString(),
  },
]

vi.mock('@/hooks/useLogs', () => ({
  useLogs: () => ({ data: MOCK_LOGS, isLoading: false }),
}))

vi.mock('@/hooks/useLLMCostsDetailed', () => ({
  useLLMCostsDetailed: () => ({ data: [], isLoading: false }),
}))

function renderLogs() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <Logs />
    </QueryClientProvider>,
  )
}

describe('Logs', () => {
  it('rend les 2 onglets', () => {
    renderLogs()
    expect(screen.getByRole('tab', { name: /activite/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /openrouter/i })).toBeInTheDocument()
  })

  it('affiche les filtres et les logs dans l onglet activite', () => {
    renderLogs()
    expect(screen.getAllByText('scrape:reddit').length).toBeGreaterThan(0)
    expect(screen.getAllByText('llm:score').length).toBeGreaterThan(0)
  })

  it('switch vers onglet OpenRouter', async () => {
    const user = userEvent.setup()
    renderLogs()
    await user.click(screen.getByRole('tab', { name: /openrouter/i }))
    expect(screen.getByText(/Derniers appels LLM/i)).toBeInTheDocument()
  })
})
