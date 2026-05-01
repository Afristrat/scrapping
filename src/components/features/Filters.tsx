import { ArrowDownAZ, Calendar, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { SOURCES, SOURCE_META, type SignalSource } from '@/lib/source-meta'
import { cn } from '@/lib/utils'
import type { PeriodKey, SignalFilters, SortKey } from '@/hooks/useSignals'

const PERIODS: Array<{ label: string; key: PeriodKey }> = [
  { label: '24h', key: '24h' },
  { label: '7j', key: '7j' },
  { label: '30j', key: '30j' },
  { label: 'tout', key: 'all' },
]

const SORTS: Array<{ label: string; key: SortKey; Icon: typeof Calendar }> = [
  { label: 'Score', key: 'score', Icon: TrendingDown },
  { label: 'Date', key: 'date', Icon: Calendar },
]

interface Props {
  value: SignalFilters
  onChange: (next: SignalFilters) => void
}

export function Filters({ value, onChange }: Props) {
  const toggleSource = (s: SignalSource) => {
    const next = value.sources.includes(s)
      ? value.sources.filter((x) => x !== s)
      : [...value.sources, s]
    onChange({ ...value, sources: next })
  }

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Sources</p>
        <div className="flex gap-2">
          {SOURCES.map((s) => {
            const active = value.sources.includes(s)
            const { label, Icon } = SOURCE_META[s]
            return (
              <Button
                key={s}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => toggleSource(s)}
                aria-pressed={active}
                className={cn('gap-1.5', !active && 'text-slate-600')}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Période</p>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={value.period === p.key ? 'default' : 'outline'}
              onClick={() => onChange({ ...value, period: p.key })}
              aria-pressed={value.period === p.key}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-w-[220px] flex-1">
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Score minimum : <span className="font-mono">{value.minScore}</span>
          {value.minScore === 0 && (
            <span className="ml-2 text-[10px] text-slate-400 normal-case">
              (inclut les zéros — passe à 1+ pour cacher)
            </span>
          )}
        </p>
        <Slider
          value={[value.minScore]}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => onChange({ ...value, minScore: v[0] })}
        />
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
          <ArrowDownAZ className="h-3 w-3" />
          Trier par
        </p>
        <div className="flex gap-2">
          {SORTS.map((s) => {
            const active = value.sortBy === s.key
            return (
              <Button
                key={s.key}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => onChange({ ...value, sortBy: s.key })}
                aria-pressed={active}
                className="gap-1.5"
              >
                <s.Icon className="h-3.5 w-3.5" />
                {s.label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
