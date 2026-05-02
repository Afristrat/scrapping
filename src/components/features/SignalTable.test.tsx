import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignalTable } from './SignalTable'
import type { SignalRow } from '@/hooks/useSignals'

const NOW = new Date('2026-04-30T10:00:00Z').toISOString()

const ROWS: SignalRow[] = [
  {
    id: 's1',
    source: 'arxiv',
    external_id: 'a1',
    url: 'http://arxiv.org/abs/1',
    title: 'Premier signal',
    raw_payload: {},
    scraped_at: NOW,
    signal_date: NOW,
    score: 88,
    reasoning: 'r1',
    model_used: 'claude',
    cost: 0.001,
  },
  {
    id: 's2',
    source: 'reddit',
    external_id: 'r1',
    url: 'https://reddit.com/r/test/2',
    title: 'Second signal',
    raw_payload: {},
    scraped_at: NOW,
    signal_date: null,
    score: null,
    reasoning: null,
    model_used: null,
    cost: null,
  },
]

const deleteOneMutate = vi.fn()
const deleteBulkMutate = vi.fn()

vi.mock('@/hooks/useSignals', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSignals')>('@/hooks/useSignals')
  return {
    ...actual,
    useDeleteSignal: () => ({
      mutate: deleteOneMutate,
      isPending: false,
    }),
    useDeleteSignalsBulk: () => ({
      mutate: deleteBulkMutate,
      isPending: false,
    }),
  }
})

afterEach(() => {
  deleteOneMutate.mockReset()
  deleteBulkMutate.mockReset()
})

function renderTable(rows: SignalRow[] = ROWS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SignalTable rows={rows} isLoading={false} onRowClick={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('SignalTable', () => {
  it('le bouton supprimer inline appelle useDeleteSignal après confirmation', async () => {
    const user = userEvent.setup()
    renderTable()

    const deleteButtons = screen.getAllByRole('button', { name: /supprimer ce signal/i })
    expect(deleteButtons).toHaveLength(2)
    await user.click(deleteButtons[0])

    // AlertDialog ouvert
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Supprimer ce signal/i)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: /^supprimer$/i })
    await user.click(confirm)

    expect(deleteOneMutate).toHaveBeenCalledTimes(1)
    expect(deleteOneMutate).toHaveBeenCalledWith('s1', expect.any(Object))
  })

  it('select-all sélectionne toutes les rows affichées', async () => {
    const user = userEvent.setup()
    renderTable()

    const selectAll = screen.getByRole('checkbox', {
      name: /sélectionner tous les signaux/i,
    })
    await user.click(selectAll)

    expect(screen.getByText(/2 signaux sélectionnés/i)).toBeInTheDocument()

    // Les checkboxes individuelles doivent être cochées
    const rowCheckboxes = screen.getAllByRole('checkbox', {
      name: /^sélectionner le signal/i,
    })
    expect(rowCheckboxes).toHaveLength(2)
    rowCheckboxes.forEach((cb) => {
      expect(cb).toHaveAttribute('data-state', 'checked')
    })
  })

  it('bulk delete appelle useDeleteSignalsBulk avec les ids sélectionnés', async () => {
    const user = userEvent.setup()
    renderTable()

    // Sélectionne le premier signal seulement
    const rowCheckboxes = screen.getAllByRole('checkbox', {
      name: /^sélectionner le signal/i,
    })
    await user.click(rowCheckboxes[0])

    // La barre bulk apparaît
    expect(screen.getByText(/1 signal sélectionné/i)).toBeInTheDocument()

    // Click sur "Supprimer la sélection"
    await user.click(screen.getByRole('button', { name: /supprimer la sélection/i }))

    // AlertDialog de confirmation bulk
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: /^supprimer$/i })
    await user.click(confirm)

    expect(deleteBulkMutate).toHaveBeenCalledTimes(1)
    expect(deleteBulkMutate).toHaveBeenCalledWith(['s1'], expect.any(Object))
  })

  it('le bouton désélectionner tout vide la sélection', async () => {
    const user = userEvent.setup()
    renderTable()

    const selectAll = screen.getByRole('checkbox', {
      name: /sélectionner tous les signaux/i,
    })
    await user.click(selectAll)
    expect(screen.getByText(/2 signaux sélectionnés/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /désélectionner tout/i }))
    expect(screen.queryByText(/sélectionné/i)).not.toBeInTheDocument()
  })
})
