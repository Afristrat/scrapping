import { CircleAlert, CircleCheck, Circle } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { useScoreConsensus } from '@/hooks/useScoreConsensus'
import { cn } from '@/lib/utils'

interface Props {
  signalId: string
}

/**
 * Affiche un badge de consensus à côté du score.
 * - agreement=high   → vert    + CircleCheck  + « Consensus »
 * - agreement=medium → jaune   + Circle       + « Partiel »
 * - agreement=low    → rouge   + CircleAlert  + « Polarisant »
 * - agreement=null   → rien (null retourné — pas de breaking)
 *
 * Tooltip au hover : détail des scores par modèle + variance.
 */
export function ConsensusBadge({ signalId }: Props) {
  const { data } = useScoreConsensus(signalId)

  if (!data || data.agreement === null) return null

  const config = {
    high: {
      label: 'Consensus',
      icon: CircleCheck,
      className:
        'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    },
    medium: {
      label: 'Partiel',
      icon: Circle,
      className:
        'border-amber-400/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    },
    low: {
      label: 'Polarisant',
      icon: CircleAlert,
      className: 'border-red-400/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    },
  } as const

  const { label, icon: Icon, className } = config[data.agreement]

  const tooltipContent = (
    <div className="space-y-2 text-xs">
      <p className="text-on-surface font-semibold">
        {data.models.length} modèle{data.models.length > 1 ? 's' : ''} — consensus{' '}
        {data.consensus !== null ? Math.round(data.consensus) : '—'}/100
      </p>
      {data.runs.length > 0 && (
        <dl className="border-outline-variant grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t pt-1.5">
          {data.runs.map((run, i) => (
            <div key={`${run.model}-${i}`} className="contents">
              <dt className="text-on-surface-variant truncate font-mono">{run.model}</dt>
              <dd className="text-on-surface text-right font-semibold tabular-nums">{run.score}</dd>
            </div>
          ))}
        </dl>
      )}
      {data.variance !== null && (
        <p className="text-on-surface-variant border-outline-variant border-t pt-1.5">
          Variance : {Math.round(data.variance * 10) / 10}
        </p>
      )}
    </div>
  )

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-help items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            className,
          )}
          aria-label={`Consensus scoring : ${label}`}
        >
          <Icon className="h-3 w-3 shrink-0" />
          {label}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-52 text-xs">
        {tooltipContent}
      </HoverCardContent>
    </HoverCard>
  )
}
