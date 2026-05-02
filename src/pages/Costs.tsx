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
import { useFormatCost } from '@/hooks/useFormatCost'
import { useProviderModels } from '@/hooks/useProviderModels'
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
  const { data: providerModels } = useProviderModels()
  const formatCost = useFormatCost()

  const totals = useMemo(() => (recent ? computeTotals(recent) : null), [recent])
  const breakdown = useMemo(
    () => (recent ? computeBreakdown(recent, period) : []),
    [recent, period],
  )

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
      {
        model: string
        calls: number
        prompt_tokens: number
        completion_tokens: number
        total_cost: number
      }
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

  // "Tarifs par modèle" — show every cached provider_models row with input/output
  // pricing per 1M tokens. Ordered by total cost desc (models actually used first),
  // then by provider/model_id alphabetically for the long tail with cost = 0.
  const pricingTable = useMemo(() => {
    if (!providerModels) return []
    const costByModel = new Map<string, number>()
    for (const m of modelSummary) costByModel.set(m.model, m.total_cost)
    return [...providerModels]
      .map((m) => ({ ...m, total_cost: costByModel.get(m.model_id) ?? 0 }))
      .sort((a, b) => {
        if (b.total_cost !== a.total_cost) return b.total_cost - a.total_cost
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)
        return a.model_id.localeCompare(b.model_id)
      })
  }, [providerModels, modelSummary])

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
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-on-surface text-3xl font-bold tracking-tight">Couts</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            Tracez chaque euro depense en LLM et scraping.
          </p>
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
      </header>

      {/* Alert overshoot */}
      {isOverBudget && (
        <div className="border-tertiary-fixed-dim bg-tertiary-fixed text-on-tertiary-fixed flex items-center gap-2 rounded-xl border p-4 text-sm shadow-sm">
          <AlertTriangle className="text-tertiary h-4 w-4 shrink-0" />
          <span>
            Depense moyenne quotidienne ({formatCost(avgDaily)}) depasse le budget de{' '}
            {formatCost(dailyBudget, 2)}/jour de plus de 10%.
          </span>
        </div>
      )}

      {totals && <TotalCostCard total7d={totals.total7d} delta={totals.delta} />}

      <CostChart data={costsByDay} />

      {/* Cost by task */}
      <Card className="border-outline-variant bg-surface-container-lowest rounded-xl shadow-md">
        <CardHeader>
          <CardTitle className="text-on-surface text-lg font-semibold">Cout par tache</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(['scraping', 'scoring', 'monitoring'] as const).map((task) => {
            const pct = totalTaskCost > 0 ? (costByTask[task] / totalTaskCost) * 100 : 0
            return (
              <div key={task} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface capitalize">{task}</span>
                  <span className="text-on-surface-variant font-mono text-xs">
                    {formatCost(costByTask[task], 5)}
                  </span>
                </div>
                <div className="bg-surface-variant h-3 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      task === 'scraping' && 'bg-primary',
                      task === 'scoring' && 'bg-secondary-container',
                      task === 'monitoring' && 'bg-tertiary',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          <p className="text-on-surface-variant pt-1 text-right text-xs">
            Budget quotidien : {formatCost(dailyBudget, 2)}
          </p>
        </CardContent>
      </Card>

      {/* Cost by model (tokens summary) */}
      {modelSummary.length > 0 && (
        <Card className="border-outline-variant bg-surface-container-lowest rounded-xl shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface text-lg font-semibold">Cout par modele</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-outline-variant overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant border-outline-variant border-b text-left text-xs font-semibold tracking-[0.05em] uppercase">
                  <tr>
                    <th className="px-4 py-3">Modele</th>
                    <th className="px-4 py-3 text-right">Calls</th>
                    <th className="px-4 py-3 text-right">Tokens in</th>
                    <th className="px-4 py-3 text-right">Tokens out</th>
                    <th className="px-4 py-3 text-right">Cout</th>
                  </tr>
                </thead>
                <tbody className="divide-outline-variant/40 divide-y">
                  {modelSummary.map((row) => (
                    <tr key={row.model} className="even:bg-surface-container-low/40">
                      <td className="text-on-surface px-4 py-3 font-mono text-xs">{row.model}</td>
                      <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                        {row.calls}
                      </td>
                      <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                        {row.prompt_tokens.toLocaleString()}
                      </td>
                      <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                        {row.completion_tokens.toLocaleString()}
                      </td>
                      <td className="text-primary px-4 py-3 text-right font-mono text-xs font-semibold">
                        {formatCost(row.total_cost, 5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tarifs par modele (catalogue) */}
      {pricingTable.length > 0 && (
        <Card className="border-outline-variant bg-surface-container-lowest rounded-xl shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface text-lg font-semibold">
              Tarifs par modele
            </CardTitle>
            <p className="text-on-surface-variant text-xs">
              Prix unitaires par 1M tokens — tires de provider_models, convertis depuis USD vers
              votre devise via les taux ECB du jour. Actualises via Reglages -&gt; Modeles.
            </p>
          </CardHeader>
          <CardContent>
            <div className="border-outline-variant overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant border-outline-variant border-b text-left text-xs font-semibold tracking-[0.05em] uppercase">
                  <tr>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Modele</th>
                    <th className="px-4 py-3 text-right">Context</th>
                    <th className="px-4 py-3 text-right">Input / 1M</th>
                    <th className="px-4 py-3 text-right">Output / 1M</th>
                  </tr>
                </thead>
                <tbody className="divide-outline-variant/40 divide-y">
                  {pricingTable.map((row) => (
                    <tr
                      key={`${row.provider}:${row.model_id}`}
                      className="even:bg-surface-container-low/40"
                    >
                      <td className="text-on-surface px-4 py-3 text-xs font-semibold uppercase">
                        {row.provider}
                      </td>
                      <td className="text-on-surface px-4 py-3 font-mono text-xs">
                        {row.model_id}
                      </td>
                      <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                        {row.context_window != null ? row.context_window.toLocaleString() : '—'}
                      </td>
                      <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                        {row.pricing_input_per_1m != null
                          ? formatCost(row.pricing_input_per_1m, 4)
                          : '—'}
                      </td>
                      <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                        {row.pricing_output_per_1m != null
                          ? formatCost(row.pricing_output_per_1m, 4)
                          : '—'}
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
