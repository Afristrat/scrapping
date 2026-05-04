import { useMemo, useState } from 'react'
import { Table2, Download, X } from 'lucide-react'
import { useSignalsEnriched, type EnrichedSignal } from '@/hooks/useSignalsEnriched'
import { useTopicsTaxonomy } from '@/hooks/useTopicsTaxonomy'
import { usePersonas } from '@/hooks/usePersonas'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Axis = 'source' | 'topic' | 'persona' | 'score_range' | 'window'

interface AxisOption {
  value: Axis
  label: string
}

interface CellKey {
  row: string
  col: string
}

interface DrillDownEntry {
  title: string | null
  source: string
  score: number | null
  url: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_OPTIONS: AxisOption[] = [
  { value: 'source', label: 'Source' },
  { value: 'topic', label: 'Topic' },
  { value: 'persona', label: 'Persona' },
  { value: 'score_range', label: 'Plage de score' },
  { value: 'window', label: 'Fenêtre temporelle' },
]

const SCORE_RANGES = ['0–40', '40–70', '70–100'] as const
const WINDOWS = ["Aujourd'hui", '7 jours', '30 jours'] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreRange(score: number | null): string {
  if (score === null) return '0–40'
  if (score < 40) return '0–40'
  if (score < 70) return '40–70'
  return '70–100'
}

function getWindow(scrapedAt: string): string {
  const now = Date.now()
  const ts = new Date(scrapedAt).getTime()
  const diffMs = now - ts
  if (diffMs <= 86_400_000) return "Aujourd'hui"
  if (diffMs <= 7 * 86_400_000) return '7 jours'
  return '30 jours'
}

function getAxisValues(
  signal: EnrichedSignal,
  axis: Axis,
  topicNames: Record<string, string>,
  personaNames: Record<string, string>,
): string[] {
  switch (axis) {
    case 'source':
      return [signal.source]
    case 'topic':
      return signal.topic_slugs.length > 0
        ? signal.topic_slugs.map((slug) => topicNames[slug] ?? slug)
        : ['(sans topic)']
    case 'persona':
      return signal.top_personas.length > 0
        ? signal.top_personas.map((key) => personaNames[key] ?? key)
        : ['(sans persona)']
    case 'score_range':
      return [getScoreRange(signal.score)]
    case 'window':
      return [getWindow(signal.scraped_at)]
  }
}

function getStaticOrder(axis: Axis): string[] | null {
  if (axis === 'score_range') return [...SCORE_RANGES]
  if (axis === 'window') return [...WINDOWS]
  return null
}

function downloadCSV(
  rowHeaders: string[],
  colHeaders: string[],
  pivot: Map<string, Map<string, number>>,
  rowAxis: Axis,
  colAxis: Axis,
) {
  const lines: string[] = []
  const rowLabel = AXIS_OPTIONS.find((o) => o.value === rowAxis)?.label ?? rowAxis
  const colLabel = AXIS_OPTIONS.find((o) => o.value === colAxis)?.label ?? colAxis
  lines.push([`${rowLabel} \\ ${colLabel}`, ...colHeaders].join(','))
  for (const row of rowHeaders) {
    const colMap = pivot.get(row) ?? new Map()
    const cells = colHeaders.map((col) => String(colMap.get(col) ?? 0))
    lines.push([row, ...cells].join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `explorer-${rowAxis}-x-${colAxis}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// SignalPreviewPanel
// ---------------------------------------------------------------------------

interface SignalPreviewPanelProps {
  rowLabel: string
  colLabel: string
  signals: DrillDownEntry[]
  onClose: () => void
}

function SignalPreviewPanel({
  rowLabel,
  colLabel,
  signals,
  onClose,
}: SignalPreviewPanelProps): React.ReactElement {
  return (
    <div
      data-testid="signal-preview-panel"
      className="border-outline-variant bg-surface-container-low fixed top-0 right-0 z-50 flex h-full w-96 flex-col border-l shadow-xl"
    >
      <div className="border-outline-variant flex items-center justify-between border-b p-4">
        <div>
          <p className="text-on-surface text-sm font-semibold">
            {rowLabel} × {colLabel}
          </p>
          <p className="text-on-surface-variant text-xs">
            {signals.length} signal{signals.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {signals.length === 0 ? (
          <p className="text-on-surface-variant text-sm italic">Aucun signal.</p>
        ) : (
          signals.slice(0, 10).map((s, i) => (
            <div
              key={i}
              className="border-outline-variant bg-surface-container-lowest rounded-lg border p-3"
            >
              <p className="text-on-surface line-clamp-2 text-xs font-medium">
                {s.title ?? '(sans titre)'}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="bg-surface-variant text-on-surface-variant rounded px-1.5 py-0.5 text-[10px]">
                  {s.source}
                </span>
                {s.score !== null && (
                  <span className="text-on-surface-variant text-[10px]">score {s.score}</span>
                )}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-[10px] underline"
                  >
                    Lien
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Explorer(): React.ReactElement {
  const [rowAxis, setRowAxis] = useState<Axis>('source')
  const [colAxis, setColAxis] = useState<Axis>('score_range')
  const [selectedCell, setSelectedCell] = useState<CellKey | null>(null)

  const { data: signals = [], isLoading: loadingSignals } = useSignalsEnriched({})
  const { data: topics = [], isLoading: loadingTopics } = useTopicsTaxonomy()
  const { data: personas = [], isLoading: loadingPersonas } = usePersonas()

  const isLoading = loadingSignals || loadingTopics || loadingPersonas

  // Build lookup maps slug → name
  const topicNames = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const t of topics) m[t.slug] = t.name
    return m
  }, [topics])

  const personaNames = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of personas) m[p.key] = p.name
    return m
  }, [personas])

  // Build pivot: Map<rowValue, Map<colValue, count>>
  const { pivot, rowHeaders, colHeaders } = useMemo(() => {
    const p = new Map<string, Map<string, number>>()

    for (const signal of signals) {
      const rowVals = getAxisValues(signal, rowAxis, topicNames, personaNames)
      const colVals = getAxisValues(signal, colAxis, topicNames, personaNames)

      for (const rv of rowVals) {
        if (!p.has(rv)) p.set(rv, new Map())
        const colMap = p.get(rv)!
        for (const cv of colVals) {
          colMap.set(cv, (colMap.get(cv) ?? 0) + 1)
        }
      }
    }

    // Determine ordered headers
    const rowOrder = getStaticOrder(rowAxis)
    const colOrder = getStaticOrder(colAxis)

    const allRows = rowOrder ?? [...p.keys()].sort()
    const colSet = new Set<string>()
    for (const colMap of p.values()) {
      for (const k of colMap.keys()) colSet.add(k)
    }
    const allCols = colOrder ? colOrder.filter((c) => colSet.has(c)) : [...colSet].sort()

    // Ensure all static values appear even if count = 0
    if (rowOrder) {
      for (const rv of rowOrder) {
        if (!p.has(rv)) p.set(rv, new Map())
      }
    }
    if (colOrder) {
      for (const rv of allRows) {
        const colMap = p.get(rv) ?? new Map()
        p.set(rv, colMap)
        for (const cv of colOrder) {
          if (!colMap.has(cv)) colMap.set(cv, 0)
        }
      }
    }

    return { pivot: p, rowHeaders: allRows, colHeaders: allCols }
  }, [signals, rowAxis, colAxis, topicNames, personaNames])

  // Max count for progress bar scaling
  const maxCount = useMemo(() => {
    let max = 0
    for (const colMap of pivot.values()) {
      for (const count of colMap.values()) {
        if (count > max) max = count
      }
    }
    return max
  }, [pivot])

  // Signals for drill-down panel
  const drillDownSignals = useMemo<DrillDownEntry[]>(() => {
    if (!selectedCell) return []
    return signals
      .filter((signal) => {
        const rowVals = getAxisValues(signal, rowAxis, topicNames, personaNames)
        const colVals = getAxisValues(signal, colAxis, topicNames, personaNames)
        return rowVals.includes(selectedCell.row) && colVals.includes(selectedCell.col)
      })
      .slice(0, 10)
      .map((s) => ({ title: s.title, source: s.source, score: s.score, url: s.url }))
  }, [selectedCell, signals, rowAxis, colAxis, topicNames, personaNames])

  const handleCellClick = (row: string, col: string) => {
    const count = pivot.get(row)?.get(col) ?? 0
    if (count === 0) return
    if (selectedCell?.row === row && selectedCell?.col === col) {
      setSelectedCell(null)
    } else {
      setSelectedCell({ row, col })
    }
  }

  const handleAxisChange = (axis: 'row' | 'col', value: Axis) => {
    if (axis === 'row') {
      setRowAxis(value)
      if (value === colAxis) setColAxis(value === 'source' ? 'score_range' : 'source')
    } else {
      setColAxis(value)
      if (value === rowAxis) setRowAxis(value === 'source' ? 'score_range' : 'source')
    }
    setSelectedCell(null)
  }

  const rowAxisLabel = AXIS_OPTIONS.find((o) => o.value === rowAxis)?.label ?? rowAxis
  const colAxisLabel = AXIS_OPTIONS.find((o) => o.value === colAxis)?.label ?? colAxis

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Table2 className="text-primary h-6 w-6" />
          <div>
            <h1 className="text-on-surface text-2xl font-bold tracking-tight">Explorer</h1>
            <p className="text-on-surface-variant text-sm">
              Tableau croisé dynamique — {signals.length} signaux
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-outline-variant text-on-surface gap-2"
          onClick={() => downloadCSV(rowHeaders, colHeaders, pivot, rowAxis, colAxis)}
          data-testid="export-csv-btn"
        >
          <Download className="h-4 w-4" />
          Exporter CSV
        </Button>
      </header>

      {/* Axis selectors */}
      <div className="border-outline-variant bg-surface-container-lowest flex flex-wrap items-center gap-4 rounded-xl border p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-on-surface-variant text-sm font-medium">Lignes :</span>
          <Select value={rowAxis} onValueChange={(v) => handleAxisChange('row', v as Axis)}>
            <SelectTrigger className="w-44" data-testid="row-axis-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AXIS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-on-surface-variant text-sm font-medium">Colonnes :</span>
          <Select value={colAxis} onValueChange={(v) => handleAxisChange('col', v as Axis)}>
            <SelectTrigger className="w-44" data-testid="col-axis-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AXIS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCell && (
          <Button
            variant="ghost"
            size="sm"
            className="text-on-surface-variant gap-1 text-xs"
            onClick={() => setSelectedCell(null)}
          >
            <X className="h-3 w-3" />
            Effacer sélection
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-on-surface-variant py-12 text-center text-sm">Chargement…</div>
      )}

      {/* Empty state */}
      {!isLoading && signals.length === 0 && (
        <div className="border-outline-variant bg-surface-container-lowest text-on-surface-variant rounded-xl border p-6 text-sm shadow-sm">
          Aucun signal disponible. Lance le pipeline pour générer des données.
        </div>
      )}

      {/* Pivot table */}
      {!isLoading && signals.length > 0 && (
        <div className="border-outline-variant bg-surface-container-lowest overflow-x-auto rounded-xl border shadow-sm">
          <table
            className="w-full border-collapse text-sm"
            data-testid="pivot-table"
            aria-label={`Tableau croisé ${rowAxisLabel} × ${colAxisLabel}`}
          >
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="bg-surface-container text-on-surface-variant px-4 py-3 text-left text-xs font-semibold">
                  {rowAxisLabel} \ {colAxisLabel}
                </th>
                {colHeaders.map((col) => (
                  <th
                    key={col}
                    className="bg-surface-container text-on-surface-variant px-4 py-3 text-center text-xs font-semibold"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowHeaders.map((row, ri) => {
                const colMap = pivot.get(row) ?? new Map()
                return (
                  <tr
                    key={row}
                    className={cn(
                      'border-outline-variant border-b last:border-b-0',
                      ri % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container/30',
                    )}
                  >
                    <td className="text-on-surface px-4 py-3 text-xs font-medium">{row}</td>
                    {colHeaders.map((col) => {
                      const count = colMap.get(col) ?? 0
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
                      const isSelected = selectedCell?.row === row && selectedCell?.col === col
                      return (
                        <td
                          key={col}
                          data-testid={`cell-${row}-${col}`}
                          className={cn(
                            'px-4 py-3 text-center transition-colors',
                            count > 0
                              ? 'hover:bg-primary-fixed/20 cursor-pointer'
                              : 'text-on-surface-variant/40',
                            isSelected && 'bg-primary-fixed/30 ring-primary ring-2 ring-inset',
                          )}
                          onClick={() => handleCellClick(row, col)}
                          aria-label={`${row} × ${col} : ${count} signal${count !== 1 ? 's' : ''}`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-on-surface font-semibold">{count}</span>
                            {count > 0 && (
                              <div className="bg-surface-variant h-1.5 w-full max-w-[60px] rounded-full">
                                <div
                                  className="bg-primary h-full rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down panel */}
      {selectedCell && (
        <SignalPreviewPanel
          rowLabel={selectedCell.row}
          colLabel={selectedCell.col}
          signals={drillDownSignals}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  )
}
