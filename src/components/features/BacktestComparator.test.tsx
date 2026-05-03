import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BacktestComparator } from './BacktestComparator'
import type { BacktestResult } from '@/hooks/useBacktestRubric'

// Mock Recharts pour éviter les erreurs jsdom avec SVG
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  Cell: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RESULTS: BacktestResult[] = [
  {
    signal_id: 'sig-1',
    title: 'Signal A — IA générative',
    current_score: 50,
    backtested_score: 80,
    delta: 30,
    reasoning_new: "Très pertinent pour l'IA",
  },
  {
    signal_id: 'sig-2',
    title: 'Signal B — Machine Learning',
    current_score: 75,
    backtested_score: 55,
    delta: -20,
    reasoning_new: 'Moins pertinent que prévu',
  },
  {
    signal_id: 'sig-3',
    title: 'Signal C — Robotique',
    current_score: null,
    backtested_score: 65,
    delta: 0,
    reasoning_new: 'Nouveau signal sans score actuel',
  },
  {
    signal_id: 'sig-4',
    title: 'Signal D — NLP avancé',
    current_score: 60,
    backtested_score: 85,
    delta: 25,
    reasoning_new: 'Fortement promu',
  },
  {
    signal_id: 'sig-5',
    title: 'Signal E — Computer Vision',
    current_score: 80,
    backtested_score: 45,
    delta: -35,
    reasoning_new: 'Fortement rétrogradé',
  },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BacktestComparator', () => {
  it('rend les 4 KPI cards', () => {
    render(<BacktestComparator results={RESULTS} />)

    expect(screen.getByText('Moyenne delta')).toBeInTheDocument()
    expect(screen.getByText(/nouveaux.*70/i)).toBeInTheDocument()
    expect(screen.getByText(/rétrogradés.*70/i)).toBeInTheDocument()
    expect(screen.getByText('Total signaux')).toBeInTheDocument()
  })

  it('calcule la moyenne delta correctement', () => {
    render(<BacktestComparator results={RESULTS} />)
    // deltas: 30 + (-20) + 0 + 25 + (-35) = 0 → moyenne = 0.0
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })

  it('calcule "Nouveaux > 70" : signaux passant de < 70 à >= 70', () => {
    render(<BacktestComparator results={RESULTS} />)
    // sig-1: current=50 < 70, backtested=80 >= 70 → promu ✓
    // sig-4: current=60 < 70, backtested=85 >= 70 → promu ✓
    // = 2 promus
    expect(screen.getByTestId('kpi-promoted').textContent).toBe('2')
  })

  it('calcule "Rétrogradés < 70" : signaux passant de >= 70 à < 70', () => {
    render(<BacktestComparator results={RESULTS} />)
    // sig-2: current=75 >= 70, backtested=55 < 70 → rétrogradé ✓
    // sig-5: current=80 >= 70, backtested=45 < 70 → rétrogradé ✓
    // = 2 rétrogradés
    expect(screen.getByTestId('kpi-demoted').textContent).toBe('2')
  })

  it('affiche le total des signaux', () => {
    render(<BacktestComparator results={RESULTS} />)
    // Total = 5
    expect(screen.getByTestId('kpi-total').textContent).toBe('5')
  })

  it('trie les résultats par |delta| décroissant', () => {
    render(<BacktestComparator results={RESULTS} />)
    // sig-5: |delta|=35, sig-1: |delta|=30, sig-4: |delta|=25, sig-2: |delta|=20, sig-3: |delta|=0
    const rows = screen.getAllByRole('row').slice(1) // Skip header
    expect(rows[0]).toHaveTextContent('Signal E')
    expect(rows[1]).toHaveTextContent('Signal A')
    expect(rows[2]).toHaveTextContent('Signal D')
  })

  it('delta positif → couleur verte', () => {
    render(<BacktestComparator results={RESULTS} />)
    // sig-1 a delta=+30 (affiché en vert)
    const deltaSpans = screen.getAllByText(/^\+\d+$/)
    const positive = deltaSpans.find((el) => el.textContent === '+30')
    expect(positive?.className).toMatch(/green/)
  })

  it('delta négatif → couleur rouge', () => {
    render(<BacktestComparator results={RESULTS} />)
    // sig-5 a delta=-35 (affiché en rouge)
    const negativeDeltas = screen.getAllByText(/-\d+/)
    const negative = negativeDeltas.find((el) => el.textContent === '-35')
    expect(negative?.className).toMatch(/red/)
  })

  it('current_score null → affiche "—"', () => {
    render(<BacktestComparator results={RESULTS} />)
    // sig-3 a current_score = null
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('tableau vide → message "Aucun résultat"', () => {
    render(<BacktestComparator results={[]} />)
    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument()
  })

  it('KPIs à 0 quand liste vide', () => {
    render(<BacktestComparator results={[]} />)
    // Tous les KPIs doivent être 0
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(3)
  })
})
