import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { useTopics, type TopicWithRuns } from '@/hooks/useTopics'
import { TopicSparklines } from '@/components/features/TopicSparklines'
import { cn } from '@/lib/utils'

function trendBadge(t: TopicWithRuns) {
  if (t.trend === 'emerging') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-950 px-2 py-0.5 text-[10px] font-semibold text-green-400">
        <ArrowUp className="h-3 w-3" /> EMERGING z={t.z_score.toFixed(1)}
      </span>
    )
  }
  if (t.trend === 'declining') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-950 px-2 py-0.5 text-[10px] font-semibold text-red-400">
        <ArrowDown className="h-3 w-3" /> DECLINING z={t.z_score.toFixed(1)}
      </span>
    )
  }
  if (t.trend === 'warming_up') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
        warming up ({t.baseline_n}/10)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
      <ArrowRight className="h-3 w-3" /> stable
    </span>
  )
}

export default function Topics() {
  const { data, isLoading } = useTopics({ runsLimit: 30 })
  const sorted = [...(data ?? [])].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="text-xl font-bold mb-4">Topics — {sorted.length} actifs</h1>

      {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!isLoading && sorted.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Aucun topic encore identifié. Lance le pipeline pour générer des signaux.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((t) => {
          const lastRun = t.runs[0]
          return (
            <div
              key={t.id}
              data-testid="topic-card"
              className={cn(
                'rounded-lg border bg-card p-3',
                t.trend === 'emerging' && 'border-l-[3px] border-l-green-600',
                t.trend === 'declining' && 'border-l-[3px] border-l-red-600',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {trendBadge(t)}
                  <span className="text-sm font-semibold">{t.name}</span>
                  {t.is_seed && <span className="text-[10px] text-muted-foreground">seed</span>}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t.total_signal_count} signaux
                </span>
              </div>

              {t.runs.length > 0 && <TopicSparklines runs={t.runs} />}

              {lastRun?.top_signal_title && (
                <div className="text-[11px] text-muted-foreground mt-2 truncate">
                  Top signal : « {lastRun.top_signal_title} » — score{' '}
                  {lastRun.top_signal_score?.toFixed(0) ?? '?'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
