import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { useTopics, type TopicWithRuns } from '@/hooks/useTopics'
import { cn } from '@/lib/utils'

const MAX_ROWS = 4

function trendOrderKey(t: TopicWithRuns): number {
  if (t.trend === 'emerging') return 0
  if (t.trend === 'declining') return 1
  return 2
}

export function TopicsWidget() {
  const { data, isLoading } = useTopics({ runsLimit: 1 })

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Chargement des topics…</div>
  }

  const visible = (data ?? [])
    .filter((t) => t.trend === 'emerging' || t.trend === 'declining')
    .sort((a, b) => {
      const order = trendOrderKey(a) - trendOrderKey(b)
      if (order !== 0) return order
      return Math.abs(b.z_score) - Math.abs(a.z_score)
    })
    .slice(0, MAX_ROWS)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold tracking-wide text-foreground">TOPICS</span>
        <Link to="/topics" className="text-[10px] text-primary hover:underline">
          Voir tout →
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          Aucun topic actif (en hausse ou en baisse) pour le moment.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((t) => {
            const isUp = t.trend === 'emerging'
            const isDown = t.trend === 'declining'
            const sourcesUsed = Array.from(
              new Set(t.runs[0] ? Object.keys(t.runs[0].sources) : []),
            ).join(' · ')
            return (
              <div
                key={t.id}
                data-testid="topic-row"
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/40 border-l-[3px]',
                  isUp && 'border-l-green-600',
                  isDown && 'border-l-red-600',
                )}
              >
                <div className="flex items-center gap-2">
                  {isUp && <ArrowUp className="h-3 w-3 text-green-600" />}
                  {isDown && <ArrowDown className="h-3 w-3 text-red-600" />}
                  {!isUp && !isDown && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-xs">{t.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{sourcesUsed}</span>
                  <span
                    className={cn(
                      'text-[11px] font-semibold',
                      isUp && 'text-green-600',
                      isDown && 'text-red-600',
                    )}
                  >
                    z={t.z_score.toFixed(1)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
