import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { CostBreakdown } from '@/components/features/CostBreakdown'
import { CostChart } from '@/components/features/CostChart'
import { TotalCostCard } from '@/components/features/TotalCostCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computeBreakdown,
  computeTotals,
  useCostsByDay,
  useLLMCostsRecent,
  type LLMTask,
} from '@/hooks/useLLMCosts'
import { useSettings } from '@/hooks/useSettings'
import { useTokensSummary } from '@/hooks/useTokensSummary'
import { cn } from '@/lib/utils'

type PeriodKey = 7 | 14 | 30 | 90
const PERIODS: Array<{ label: string; days: PeriodKey }> = [
  { label: '7j', days: 7 },
  { label: '14j', days: 14 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
]

export default function Costs() {
  const [period, setPeriod] = useState<PeriodKey>(7)
  const { data: settings } = useSettings()
  const { data: costsByDay } = useCostsByDay(period)
  const { data: recent, isLoading } = useLLMCostsRecent(period)
  const { data: tokensSummary } = useTokensSummary(period)

  const totals = useMemo(() => (recent ? computeTotals(recent) : null), [recent])
  const breakdown = useMemo(() => (recent ? computeBreakdown(recent, period) : []), [recent, period])

  const dailyBudget = settings?.daily_budget_usd ?? 5
  const avgDaily = totals ? totals.total7d / 7 : 0
  const isOverBudget = avgDaily > dailyBudget * 1.1

  // Stable "now" snapshot — captured once on mount to avoid impure call during render.
  const [nowMs] = useState(() => Date.now())

  // Cost by task
  const costByTask = useMemo(() => {
    if (!recent) return { scraping: 0, scoring: 0, monitoring: 0 }
    const sinceMs = nowMs - period * 86_400_000
    const filtered = recent.filter((r) => new Date(r.ts).getTime() >= sinceMs)
    const map: Record<LLMTask, number> = { scraping: 0, scoring: 0, monitoring: 0 }
    for (const r of filtered) {
      map[r.task] += Number(r.cost)
    }
    return map
  }, [recent, period, nowMs])

  const totalTaskCost = costByTask.scraping + costByTask.scoring + costByTask.monitoring

  // Aggregate tokens summary by model
  const modelSummary = useMemo(() => {
    if (!tokensSummary) return []
    const map = new Map<
      string,
      { model: string; calls: number; prompt_tokens: number; completion_tokens: number; total_cost: number }
    >()
    for (const row of tokensSummary) {
      const existing = map.get(row.model)
      if (existing) {
        existing.calls += row.calls
        existing.prompt_tokens += row.prompt_tokens
        existing.completion_tokens += row.completion_tokens
        existing.total_cost += Number(row.total_cost)
      } else {
        map.set(row.model, {
          model: row.model,
          calls: row.calls,
          prompt_tokens: row.prompt_tokens,
          completion_tokens: row.completion_tokens,
          total_cost: Number(row.total_cost),
        })
      }
    }
    return [...map.values()].sort((a, b) => b.total_cost - a.total_cost)
  }, [tokensSummary])

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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Couts</h2>
          <p className="text-sm text-slate-500">Suivi detaille des depenses LLM.</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant={period === p.days ? 'default' : 'outline'}
              onClick={() => setPeriod(p.days)}
              aria-pressed={period === p.days}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Alert overshoot */}
      {isOverBudget && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Depense moyenne quotidienne (${avgDaily.toFixed(4)}) depasse le budget de{' '}
            ${dailyBudget.toFixed(2)}/jour de plus de 10%.
          </span>
        </div>
      )}

      {totals && <TotalCostCard total7d={totals.total7d} delta={totals.delta} />}

      <CostChart data={costsByDay} />

      {/* Cost by task */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cout par tache</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['scraping', 'scoring', 'monitoring'] as const).map((task) => {
            const pct = totalTaskCost > 0 ? (costByTask[task] / totalTaskCost) * 100 : 0
            return (
              <div key={task} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize text-slate-700">{task}</span>
                  <span className="font-mono text-xs text-slate-600">
                    ${costByTask[task].toFixed(5)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      task === 'scraping' && 'bg-emerald-500',
                      task === 'scoring' && 'bg-blue-500',
                      task === 'monitoring' && 'bg-amber-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          <p className="pt-1 text-right text-xs text-slate-500">
            Budget quotidien : ${dailyBudget.toFixed(2)}
          </p>
        </CardContent>
      </Card>

      {/* Cost by model (tokens summary) */}
      {modelSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cout par modele</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Modele</th>
                    <th className="px-4 py-2.5 text-right">Calls</th>
                    <th className="px-4 py-2.5 text-right">Tokens in</th>
                    <th className="px-4 py-2.5 text-right">Tokens out</th>
                    <th className="px-4 py-2.5 text-right">Cout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modelSummary.map((row) => (
                    <tr key={row.model}>
                      <td className="px-4 py-3 font-mono text-xs">{row.model}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{row.calls}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {row.prompt_tokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {row.completion_tokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                        ${row.total_cost.toFixed(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <CostBreakdown rows={breakdown} />
    </div>
  )
}
