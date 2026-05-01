# Spec — Pages Logs + Monitoring

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/11-pages-logs-monitoring.md`
**Estimation** : 2h · **Bloqué par** : 02 ✅ 03 ✅ 08 ✅
**Dépendances** : RPC `costs_by_day` (Task 02 done — migration `20260430000004_costs_by_day.sql`), `recharts` déjà dans deps.

## Objectif

2 pages read-only :

- **`/logs`** — table des actions récentes (purgées <24h via pg_cron), refresh auto 30s, status badge color-coded.
- **`/monitoring`** — KPI total cost 7j + delta vs 7j précédents, line chart Recharts par task, table breakdown model × task.

## Décisions clés

1. **2 hooks séparés** : `useLogs` + `useLLMCosts` (raw last 7d et previous 7d en parallèle pour le delta).
2. Chart : appel RPC `costs_by_day(7)` Supabase (déjà migrée Task 02). RPC retourne `{day: date, task: enum, total_cost: numeric}`. Group côté client par task → 3 séries Recharts.
3. KPI total : `SUM(cost)` last 7d / previous 7d → delta % (color : vert si baisse, rouge si hausse).
4. Breakdown : query `llm_costs last 7d`, group côté client par `(model, task)` → table sort by cost DESC.
5. Logs refetch : `refetchInterval: 30000` dans `useLogs`.
6. Status badge : `'ok'` vert, `'error'` rouge, `'degraded'` orange, `'start'` slate, fallback slate.
7. Payload JSON : afficher avec `<details><summary>` natif HTML (collapse/expand sans Radix).
8. Empty states : "Pas de logs (purgés < 24h)" + "Pas encore de coûts — lance un pipeline".
9. Tests : 1 fichier `Monitoring.test.tsx` qui mock les hooks, asserte total + presence chart container.
10. **Pas de Recharts dans le bundle main si possible** — `recharts` est lourd (~100KB). V1 acceptable, code-splitting V1.1.

## Structure

```
src/
├── hooks/
│   ├── useLogs.ts                  # CREATE — TanStack Query + refetchInterval 30s
│   └── useLLMCosts.ts              # CREATE — fetch raw + computed total/delta/breakdown
├── components/features/
│   ├── LogsTable.tsx               # CREATE
│   ├── TotalCostCard.tsx           # CREATE — KPI + delta
│   ├── CostChart.tsx               # CREATE — Recharts LineChart
│   └── CostBreakdown.tsx           # CREATE — table model × task
├── pages/
│   ├── Logs.tsx                    # REWRITE
│   ├── Monitoring.tsx              # REWRITE
│   └── Monitoring.test.tsx         # CREATE
```

## Code condensé

### `src/hooks/useLogs.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface LogRow {
  id: number
  user_id: string | null
  action: string
  payload: Record<string, unknown> | null
  status: string | null
  ts: string
}

export function useLogs() {
  return useQuery<LogRow[]>({
    queryKey: ['logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .order('ts', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as LogRow[]
    },
    refetchInterval: 30_000,
  })
}
```

### `src/hooks/useLLMCosts.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type LLMTask = 'scraping' | 'scoring' | 'monitoring'

export interface CostRow {
  task: LLMTask
  model: string
  prompt_tokens: number
  completion_tokens: number
  cost: number
  ts: string
}

export interface CostByDayRow {
  day: string // YYYY-MM-DD
  task: LLMTask
  total_cost: number
}

export interface BreakdownRow {
  model: string
  task: LLMTask
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost: number
}

export function useCostsByDay(days = 7) {
  return useQuery<CostByDayRow[]>({
    queryKey: ['costs_by_day', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('costs_by_day', { days })
      if (error) throw error
      return (data ?? []) as CostByDayRow[]
    },
  })
}

export function useLLMCostsRecent(days = 14) {
  return useQuery<CostRow[]>({
    queryKey: ['llm_costs', 'recent', days],
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('llm_costs')
        .select('task, model, prompt_tokens, completion_tokens, cost, ts')
        .gte('ts', sinceIso)
        .order('ts', { ascending: false })
      if (error) throw error
      return (data ?? []) as CostRow[]
    },
  })
}

export function computeTotals(rows: CostRow[]): {
  total7d: number
  previous7d: number
  delta: number
} {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86_400_000
  const fourteenDaysAgo = now - 14 * 86_400_000
  let total7d = 0
  let previous7d = 0
  for (const r of rows) {
    const t = new Date(r.ts).getTime()
    if (t >= sevenDaysAgo) total7d += Number(r.cost)
    else if (t >= fourteenDaysAgo) previous7d += Number(r.cost)
  }
  const delta = previous7d === 0 ? 0 : ((total7d - previous7d) / previous7d) * 100
  return { total7d, previous7d, delta }
}

export function computeBreakdown(rows: CostRow[]): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>()
  for (const r of rows) {
    const key = `${r.model}__${r.task}`
    const existing = map.get(key)
    if (existing) {
      existing.calls++
      existing.prompt_tokens += r.prompt_tokens
      existing.completion_tokens += r.completion_tokens
      existing.cost += Number(r.cost)
    } else {
      map.set(key, {
        model: r.model,
        task: r.task,
        calls: 1,
        prompt_tokens: r.prompt_tokens,
        completion_tokens: r.completion_tokens,
        cost: Number(r.cost),
      })
    }
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}
```

> Note : `Date.now()` dans `computeTotals` est appelé en dehors de render (fonction pure utilisée dans `useMemo` côté composant ou directement). Pas de violation `react-hooks/purity`.

### `src/components/features/LogsTable.tsx`

```tsx
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LogRow } from '@/hooks/useLogs'

const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  error: 'bg-red-100 text-red-800',
  degraded: 'bg-amber-100 text-amber-800',
  start: 'bg-slate-100 text-slate-700',
}

interface Props {
  rows: LogRow[] | undefined
  isLoading: boolean
}

export function LogsTable({ rows, isLoading }: Props) {
  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  if (!rows || rows.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Pas de logs (purgés &lt; 24h)
      </div>
    )

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="w-32 px-4 py-2.5">Quand</th>
            <th className="w-40 px-4 py-2.5">Action</th>
            <th className="w-24 px-4 py-2.5">Statut</th>
            <th className="px-4 py-2.5">Payload</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-3 text-xs text-slate-500">
                {formatDistanceToNow(new Date(r.ts), { addSuffix: true, locale: fr })}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.action}</td>
              <td className="px-4 py-3">
                <Badge
                  className={cn(
                    'font-normal',
                    STATUS_CLASS[r.status ?? ''] ?? 'bg-slate-100 text-slate-600',
                  )}
                >
                  {r.status ?? '—'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {r.payload ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900">
                      voir le payload
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### `src/components/features/TotalCostCard.tsx`

```tsx
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  total7d: number
  delta: number
}

export function TotalCostCard({ total7d, delta }: Props) {
  const Icon = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus
  const deltaColor = delta > 1 ? 'text-red-600' : delta < -1 ? 'text-emerald-600' : 'text-slate-500'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <p className="text-xs tracking-wide text-slate-500 uppercase">
        Coût total · 7 derniers jours
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-3xl font-semibold text-slate-900">${total7d.toFixed(4)}</p>
        <p className={cn('flex items-center gap-1 text-sm', deltaColor)}>
          <Icon className="h-4 w-4" />
          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
          <span className="text-slate-400">vs 7j précédents</span>
        </p>
      </div>
    </div>
  )
}
```

### `src/components/features/CostChart.tsx`

```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { CostByDayRow, LLMTask } from '@/hooks/useLLMCosts'

const TASK_COLORS: Record<LLMTask, string> = {
  scoring: '#3b82f6',
  scraping: '#10b981',
  monitoring: '#f59e0b',
}
const TASKS: LLMTask[] = ['scoring', 'scraping', 'monitoring']

interface Props {
  data: CostByDayRow[] | undefined
}

export function CostChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-sm text-slate-500">
        Pas encore de coûts — lance un pipeline.
      </div>
    )
  }

  // Pivot par day → { day, scoring, scraping, monitoring }
  const dayMap = new Map<string, Record<string, number | string>>()
  for (const r of data) {
    const row = dayMap.get(r.day) ?? { day: r.day, scoring: 0, scraping: 0, monitoring: 0 }
    row[r.task] = Number(r.total_cost)
    dayMap.set(r.day, row)
  }
  const pivoted = [...dayMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-medium text-slate-900">Coût par jour & tâche</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={pivoted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(3)}`} />
          <Tooltip formatter={(v: number) => `$${v.toFixed(5)}`} />
          <Legend />
          {TASKS.map((t) => (
            <Line
              key={t}
              type="monotone"
              dataKey={t}
              stroke={TASK_COLORS[t]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### `src/components/features/CostBreakdown.tsx`

```tsx
import type { BreakdownRow } from '@/hooks/useLLMCosts'

interface Props {
  rows: BreakdownRow[]
}

export function CostBreakdown({ rows }: Props) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2.5">Modèle</th>
            <th className="px-4 py-2.5">Tâche</th>
            <th className="px-4 py-2.5 text-right">Calls</th>
            <th className="px-4 py-2.5 text-right">Tokens (in/out)</th>
            <th className="px-4 py-2.5 text-right">Coût</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.model}-${r.task}`}>
              <td className="px-4 py-3 font-mono text-xs">{r.model}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{r.task}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{r.calls}</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                {r.prompt_tokens.toLocaleString()} / {r.completion_tokens.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                ${r.cost.toFixed(5)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### `src/pages/Logs.tsx` (rewrite)

```tsx
import { LogsTable } from '@/components/features/LogsTable'
import { useLogs } from '@/hooks/useLogs'

export default function Logs() {
  const { data, isLoading } = useLogs()
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Logs</h2>
        <p className="text-sm text-slate-500">
          Actions récentes du pipeline. Auto-refresh 30s. Purgés automatiquement après 24h.
        </p>
      </div>
      <LogsTable rows={data} isLoading={isLoading} />
    </div>
  )
}
```

### `src/pages/Monitoring.tsx` (rewrite)

```tsx
import { useMemo } from 'react'
import { CostBreakdown } from '@/components/features/CostBreakdown'
import { CostChart } from '@/components/features/CostChart'
import { TotalCostCard } from '@/components/features/TotalCostCard'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computeBreakdown,
  computeTotals,
  useCostsByDay,
  useLLMCostsRecent,
} from '@/hooks/useLLMCosts'

export default function Monitoring() {
  const { data: costsByDay } = useCostsByDay(7)
  const { data: recent, isLoading } = useLLMCostsRecent(14)

  const totals = useMemo(() => (recent ? computeTotals(recent) : null), [recent])
  const breakdown = useMemo(() => {
    if (!recent) return []
    const sevenDaysAgo = Date.now() - 7 * 86_400_000
    return computeBreakdown(recent.filter((r) => new Date(r.ts).getTime() >= sevenDaysAgo))
  }, [recent])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Monitoring</h2>
        <p className="text-sm text-slate-500">Coûts LLM des 7 derniers jours.</p>
      </div>
      {totals && <TotalCostCard total7d={totals.total7d} delta={totals.delta} />}
      <CostChart data={costsByDay} />
      <CostBreakdown rows={breakdown} />
    </div>
  )
}
```

### `src/pages/Monitoring.test.tsx`

Mock `useCostsByDay` + `useLLMCostsRecent` + `useLogs`. Assert h2 + total card + breakdown table render.

```tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import Monitoring from './Monitoring'
import type { CostRow, CostByDayRow } from '@/hooks/useLLMCosts'

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

function renderMonitoring() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <Monitoring />
    </QueryClientProvider>,
  )
}

describe('Monitoring', () => {
  it('rend le titre + total cost card + breakdown table', () => {
    renderMonitoring()
    expect(screen.getByRole('heading', { level: 2, name: /monitoring/i })).toBeInTheDocument()
    expect(screen.getByText(/Coût total/i)).toBeInTheDocument()
    expect(screen.getByText(/anthropic\/claude-haiku-4\.5/)).toBeInTheDocument()
  })
})
```

## Steps

1. Pas de shadcn add nécessaire (Badge, Skeleton, Card déjà présents).
2. Créer `hooks/useLogs.ts` + `hooks/useLLMCosts.ts`.
3. Créer 4 composants features.
4. Réécrire `pages/Logs.tsx` + `pages/Monitoring.tsx`.
5. Créer `pages/Monitoring.test.tsx`.
6. Validation 4/4 vert, 13+ tests passing.
7. Move spec.

## Non-Goals

- ❌ Filtres date custom (calendar picker) — V1 = 7d fixe.
- ❌ Export CSV des coûts — V1.1.
- ❌ Drilldown click-on-line → modal détail journée — V1.1.
- ❌ Sentry / error tracking — V2.

## Acceptance grep-testable

- [ ] `bun run typecheck`/`lint`/`build` 0 erreur.
- [ ] `bun run test` 13+ passed.
- [ ] `grep -r "console.log" src/pages/Logs.tsx src/pages/Monitoring.tsx src/hooks/useLogs.ts src/hooks/useLLMCosts.ts src/components/features/{LogsTable,TotalCostCard,CostChart,CostBreakdown}.tsx` → vide.
- [ ] `grep " any" src/hooks/useLogs.ts src/hooks/useLLMCosts.ts` → vide.

## Fichiers

- CREATE: 2 hooks, 4 features, 1 test
- REWRITE: pages/Logs.tsx, pages/Monitoring.tsx
- MOVE spec
