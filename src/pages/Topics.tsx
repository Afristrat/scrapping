import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Flame,
  LineChart as LineChartIcon,
  Sprout,
  TrendingDown,
} from 'lucide-react'
import { useTopics, type TopicWithRuns } from '@/hooks/useTopics'
import { TopicSparklines } from '@/components/features/TopicSparklines'
import { TopicHelpDialog } from '@/components/features/TopicHelpDialog'
import { Button } from '@/components/ui/button'
import { SOURCES, SOURCE_META } from '@/lib/source-meta'
import { cn } from '@/lib/utils'

type TrendKey = TopicWithRuns['trend']

interface TrendSection {
  key: TrendKey
  title: string
  Icon: typeof Flame
  iconClass: string
  helper: string
  emptyMessage: string
}

const TREND_SECTIONS: TrendSection[] = [
  {
    key: 'emerging',
    title: 'Émergents',
    Icon: Flame,
    iconClass: 'text-green-600',
    helper: 'Sujets en hausse anormale (z > 2). À investiguer en priorité.',
    emptyMessage: 'Aucun topic émergent pour le moment.',
  },
  {
    key: 'declining',
    title: 'En déclin',
    Icon: TrendingDown,
    iconClass: 'text-red-600',
    helper: 'Sujets en chute anormale (z < -2). Peut indiquer une feature à dé-prioriser.',
    emptyMessage: 'Aucun topic en déclin pour le moment.',
  },
  {
    key: 'stable',
    title: 'Stables',
    Icon: LineChartIcon,
    iconClass: 'text-muted-foreground',
    helper: 'Sujets bien établis dans leur baseline normale.',
    emptyMessage: 'Aucun topic stable détecté.',
  },
  {
    key: 'warming_up',
    title: 'En calibrage',
    Icon: Sprout,
    iconClass: 'text-amber-600',
    helper: 'Moins de 10 runs : pas encore assez de données pour juger une tendance.',
    emptyMessage: 'Aucun topic en calibrage.',
  },
]

function formatPercentDelta(t: TopicWithRuns): string | null {
  if (t.baseline_n < 2 || t.baseline_mean <= 0) return null
  const lastRun = t.runs[0]
  if (!lastRun) return null
  const delta = ((lastRun.signal_count - t.baseline_mean) / t.baseline_mean) * 100
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(0)}%`
}

function zScoreTooltip(t: TopicWithRuns): string {
  if (t.trend === 'warming_up') {
    return `Topic en calibrage : ${t.baseline_n}/10 runs accumulés. Le z-score n'est pas encore fiable.`
  }
  const pct = formatPercentDelta(t)
  const direction = t.z_score >= 0 ? 'au-dessus' : 'en-dessous'
  if (pct) {
    return `z=${t.z_score.toFixed(2)} → ${pct} ${direction} de la baseline historique (${t.baseline_mean.toFixed(1)} signaux/run en moyenne sur ${t.baseline_n} runs).`
  }
  return `z=${t.z_score.toFixed(2)} → ${direction} de la baseline (${t.baseline_n} runs accumulés).`
}

function trendBadge(t: TopicWithRuns): React.ReactElement {
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
      <ArrowRight className="h-3 w-3" /> stable z={t.z_score.toFixed(1)}
    </span>
  )
}

function SuggestedAction({ topic }: { topic: TopicWithRuns }): React.ReactElement | null {
  if (topic.trend === 'emerging') {
    return (
      <Button asChild size="sm" variant="default" className="h-7 text-[11px]">
        <Link to={`/?topic=${encodeURIComponent(topic.slug)}`}>Explorer les signaux</Link>
      </Button>
    )
  }
  if (topic.trend === 'declining') {
    return (
      <span className="text-[11px] text-muted-foreground italic">
        Action suggérée : ignorer pour l&apos;instant.
      </span>
    )
  }
  if (topic.trend === 'warming_up') {
    return (
      <span className="text-[11px] text-muted-foreground italic">
        Action suggérée : continuer à laisser tourner.
      </span>
    )
  }
  return null
}

function TopicCard({ topic }: { topic: TopicWithRuns }): React.ReactElement {
  const lastRun = topic.runs[0]
  return (
    <div
      data-testid="topic-card"
      className={cn(
        'rounded-lg border bg-card p-3',
        topic.trend === 'emerging' && 'border-l-[3px] border-l-green-600',
        topic.trend === 'declining' && 'border-l-[3px] border-l-red-600',
        topic.trend === 'warming_up' && 'border-l-[3px] border-l-amber-500',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span title={zScoreTooltip(topic)} className="cursor-help">
            {trendBadge(topic)}
          </span>
          <span className="text-sm font-semibold">{topic.name}</span>
          {topic.is_seed && <span className="text-[10px] text-muted-foreground">seed</span>}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {topic.total_signal_count} signaux
        </span>
      </div>

      {topic.runs.length > 0 && <TopicSparklines runs={topic.runs} />}

      {lastRun?.top_signal_title && (
        <div className="text-[11px] text-muted-foreground mt-2 truncate">
          Top signal : « {lastRun.top_signal_title} » — score{' '}
          {lastRun.top_signal_score?.toFixed(0) ?? '?'}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground" title={zScoreTooltip(topic)}>
          {(() => {
            const pct = formatPercentDelta(topic)
            if (topic.trend === 'warming_up') {
              return `Calibrage : ${topic.baseline_n}/10 runs.`
            }
            if (pct) {
              return `${pct} vs baseline (${topic.baseline_mean.toFixed(1)} signaux/run sur ${topic.baseline_n} runs).`
            }
            return `Baseline : ${topic.baseline_n} runs accumulés.`
          })()}
        </span>
        <SuggestedAction topic={topic} />
      </div>
    </div>
  )
}

function SourcesLegend(): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sources
      </span>
      {SOURCES.map((s) => {
        const meta = SOURCE_META[s]
        return (
          <span
            key={s}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
              meta.badgeClass,
            )}
          >
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </span>
        )
      })}
      <span className="text-[10px] text-muted-foreground">
        Les sparklines de chaque card affichent l&apos;évolution par source sur les 30 derniers
        runs.
      </span>
    </div>
  )
}

export default function Topics(): React.ReactElement {
  const { data, isLoading } = useTopics({ runsLimit: 30 })
  const topics = data ?? []

  const grouped: Record<TrendKey, TopicWithRuns[]> = {
    emerging: [],
    declining: [],
    stable: [],
    warming_up: [],
  }
  for (const t of topics) grouped[t.trend].push(t)
  for (const key of Object.keys(grouped) as TrendKey[]) {
    grouped[key].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Topics — {topics.length} actifs</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Les topics sont des regroupements thématiques de tes signaux scrapés. Un topic en
              hausse (<span className="font-mono">z &gt; 2</span>) signale un sujet qui sort du
              bruit habituel — c&apos;est ton signal d&apos;opportunité. Un topic en baisse (
              <span className="font-mono">z &lt; -2</span>) reflète un sujet qui retombe — peut
              indiquer une mode passagère.
            </p>
          </div>
          <TopicHelpDialog />
        </div>

        <SourcesLegend />
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!isLoading && topics.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Aucun topic encore identifié. Lance le pipeline pour générer des signaux.
        </div>
      )}

      {!isLoading &&
        topics.length > 0 &&
        TREND_SECTIONS.map((section) => {
          const items = grouped[section.key]
          return (
            <section
              key={section.key}
              data-testid={`trend-section-${section.key}`}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <section.Icon className={cn('h-4 w-4', section.iconClass)} />
                <h2 className="text-sm font-semibold">{section.title}</h2>
                <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{section.helper}</p>
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card/50 p-4 text-xs italic text-muted-foreground">
                  {section.emptyMessage}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {items.map((t) => (
                    <TopicCard key={t.id} topic={t} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
    </div>
  )
}
