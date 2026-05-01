import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import type { SignalRow } from '@/hooks/useSignals'

const NOW = new Date('2026-04-30T10:00:00Z').toISOString()

const SIGNALS: SignalRow[] = [
  {
    id: '1',
    source: 'arxiv',
    external_id: 'http://arxiv.org/abs/2604.1',
    url: 'http://arxiv.org/abs/2604.1',
    title: 'Test paper one',
    raw_payload: { authors: ['Alice'] },
    scraped_at: NOW,
    signal_date: '2026-04-29T12:00:00Z',
    score: 87,
    reasoning: 'Pertinent pour les builders IA',
    model_used: 'anthropic/claude-haiku-4.5',
    cost: 0.0012,
  },
  {
    id: '2',
    source: 'reddit',
    external_id: 'r1',
    url: 'https://reddit.com/r/test/1',
    title: 'Test reddit post',
    raw_payload: { subreddit: 'test' },
    scraped_at: NOW,
    signal_date: null,
    score: null,
    reasoning: null,
    model_used: null,
    cost: null,
  },
]

vi.mock('@/hooks/useSignals', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSignals')>('@/hooks/useSignals')
  return {
    ...actual,
    useSignals: () => ({ data: SIGNALS, isLoading: false }),
  }
})

vi.mock('@/hooks/useRunPipeline', () => ({
  useRunPipeline: () => ({ mutate: vi.fn(), isPending: false }),
}))

function renderDashboard() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  )
}

describe('Dashboard', () => {
  it('rend les signaux avec score + bouton Run pipeline', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 2, name: /signaux/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run pipeline/i })).toBeInTheDocument()
    expect(screen.getByText('Test paper one')).toBeInTheDocument()
    expect(screen.getByText('Test reddit post')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('ouvre le modal au click sur une row', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await user.click(screen.getByText('Test paper one'))
    expect(await screen.findByText('Pertinent pour les builders IA')).toBeInTheDocument()
    expect(screen.getAllByText(/anthropic\/claude-haiku-4\.5/).length).toBeGreaterThan(0)
  })

  it('toggle le filtre source Reddit (aria-pressed)', async () => {
    const user = userEvent.setup()
    renderDashboard()
    const redditBtn = screen.getByRole('button', { name: /reddit/i })
    expect(redditBtn).toHaveAttribute('aria-pressed', 'false')
    await user.click(redditBtn)
    expect(redditBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
