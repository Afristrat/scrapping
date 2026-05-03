import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BacktestResult } from '@/hooks/useBacktestRubric'

interface Props {
  results: BacktestResult[]
}

interface BinData {
  range: string
  count: number
  center: number
}

function buildHistogramBins(results: BacktestResult[]): BinData[] {
  // Bins de 10 de -50 à +50
  const bins: BinData[] = []
  for (let i = -50; i < 50; i += 10) {
    bins.push({
      range: `${i >= 0 ? '+' : ''}${i} à ${i + 9 >= 0 ? '+' : ''}${i + 9}`,
      count: 0,
      center: i + 5,
    })
  }

  for (const r of results) {
    const clamped = Math.max(-50, Math.min(49, r.delta))
    const binIndex = Math.floor((clamped + 50) / 10)
    if (binIndex >= 0 && binIndex < bins.length) {
      bins[binIndex].count++
    }
  }

  return bins
}

export function BacktestComparator({ results }: Props) {
  const kpis = useMemo(() => {
    if (results.length === 0) {
      return { avgDelta: 0, promoted: 0, demoted: 0, total: 0 }
    }

    const sumDelta = results.reduce((acc, r) => acc + r.delta, 0)
    const avgDelta = sumDelta / results.length

    const promoted = results.filter(
      (r) => r.backtested_score >= 70 && (r.current_score ?? 0) < 70,
    ).length

    const demoted = results.filter(
      (r) => r.backtested_score < 70 && r.current_score !== null && r.current_score >= 70,
    ).length

    return { avgDelta, promoted, demoted, total: results.length }
  }, [results])

  const histogramData = useMemo(() => buildHistogramBins(results), [results])

  // Top 40 : top 20 promus (delta le plus positif) + top 20 rétrogradés (delta le plus négatif)
  const displayedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => b.delta - a.delta)
    const top20Promoted = sorted.slice(0, 20)
    const top20Demoted = sorted.slice(-20).reverse()

    // Fusion sans doublons (si < 40 résultats total)
    const seen = new Set<string>()
    const merged: BacktestResult[] = []
    for (const r of [...top20Promoted, ...top20Demoted]) {
      if (!seen.has(r.signal_id)) {
        seen.add(r.signal_id)
        merged.push(r)
      }
    }

    // Re-trier par |delta| desc pour l'affichage
    return merged.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  }, [results])

  const avgDeltaSign = kpis.avgDelta > 0 ? '+' : ''

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-muted-foreground text-xs">Moyenne delta</p>
            <p
              data-testid="kpi-avg-delta"
              className={`mt-1 text-2xl font-bold ${
                kpis.avgDelta > 0
                  ? 'text-green-600 dark:text-green-400'
                  : kpis.avgDelta < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-foreground'
              }`}
            >
              {avgDeltaSign}
              {kpis.avgDelta.toFixed(1)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-muted-foreground text-xs">Nouveaux &gt; 70</p>
            <p
              data-testid="kpi-promoted"
              className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400"
            >
              {kpis.promoted}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-muted-foreground text-xs">Rétrogradés &lt; 70</p>
            <p
              data-testid="kpi-demoted"
              className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400"
            >
              {kpis.demoted}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-muted-foreground text-xs">Total signaux</p>
            <p data-testid="kpi-total" className="text-foreground mt-1 text-2xl font-bold">
              {kpis.total}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Histogramme distribution delta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Distribution des deltas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={histogramData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 10 }}
                angle={-30}
                textAnchor="end"
                height={48}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip formatter={(value) => [`${String(value)} signal(s)`, 'Nombre']} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {histogramData.map((entry) => (
                  <Cell
                    key={entry.range}
                    fill={
                      entry.center > 0
                        ? 'rgb(22, 163, 74)'
                        : entry.center < 0
                          ? 'rgb(220, 38, 38)'
                          : 'rgb(107, 114, 128)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tableau comparatif */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Comparaison détaillée{' '}
            <span className="text-muted-foreground font-normal">
              (top {displayedResults.length} par |delta|)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-2 text-left font-medium">Signal</th>
                  <th className="w-24 px-4 py-2 text-center font-medium">Score actuel</th>
                  <th className="w-24 px-4 py-2 text-center font-medium">Score backtest</th>
                  <th className="w-24 px-4 py-2 text-center font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {displayedResults.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground px-4 py-8 text-center text-sm">
                      Aucun résultat à afficher
                    </td>
                  </tr>
                ) : (
                  displayedResults.map((r) => (
                    <tr key={r.signal_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <p className="line-clamp-1 max-w-sm font-medium">{r.title}</p>
                        {r.reasoning_new && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                            {r.reasoning_new}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.current_score !== null ? (
                          <span className="text-muted-foreground">{r.current_score}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center font-medium">
                        {r.backtested_score}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                            r.delta > 0
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : r.delta < 0
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {r.delta > 0 ? '+' : ''}
                          {r.delta}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
