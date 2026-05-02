import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { RefreshCw } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { useRescoreSignal } from '@/hooks/useRescoreSignals'
import { cn } from '@/lib/utils'

interface ScoreCellProps {
  signalId: string
  score: number | null
  reasoning: string | null
  modelUsed: string | null
  scoredAt: string | null
  rubricName: string | null
  /**
   * Truthy value passed by the parent table when this signal was just
   * re-scored via a bulk action. The cell flashes green for ~1.5s when
   * this changes from null/undefined → a value, OR when its identity
   * changes (so re-scoring the same row twice still re-flashes).
   *
   * We pass the `Set` reference itself (not a derived string) so that
   * pointer equality drives the comparison and we never re-flash on a
   * pure rerender.
   */
  flashToken?: object | null
}

/**
 * Tailwind classes for the score badge, by score band.
 *
 * Brand decision (Amine):
 *   - 0  / null  → grey "—" (unscored OR legacy zero)
 *   - 1-39       → orange  (faible pertinence)
 *   - 40-69      → blue    (à surveiller)
 *   - 70-100     → emerald (à lire absolument)
 */
function scoreColorClasses(score: number | null): string {
  if (score === null || score === 0) return 'text-on-surface-variant'
  if (score <= 39) return 'text-tertiary'
  if (score <= 69) return 'text-secondary-container'
  return 'text-primary font-semibold'
}

/**
 * Detect a legacy "(LLM batch missed this signal)" row written by older
 * code paths before S-ScoreZero. The new edge function never writes
 * these — this is purely for backward compat with rows already in DB.
 */
function isLegacyMissedRow(score: number | null, reasoning: string | null): boolean {
  return score === 0 && reasoning === '(LLM batch missed this signal)'
}

export function ScoreCell({
  signalId,
  score,
  reasoning,
  modelUsed,
  scoredAt,
  rubricName,
  flashToken,
}: ScoreCellProps) {
  const rescore = useRescoreSignal()

  // Local mutation success counter — incremented when our own inline ↻
  // button finishes successfully. The value is consumed in `flashKey`
  // below to derive a unique remount-key for the flashing wrapper.
  // We bump it from `mutationKey` in `useRescoreSignal` via `data`.
  const lastInlineSuccess = rescore.isSuccess ? rescore.submittedAt : null

  // Derived state: store the most recent (flashToken, lastInlineSuccess)
  // pair we have already animated. When either changes we flip `flashing`
  // to true via the React 19 "store previous props" pattern (setState
  // during render is fine; setState inside effects is what the lint rule
  // forbids — see react-hooks/set-state-in-effect).
  const [prevToken, setPrevToken] = useState<object | null | undefined>(flashToken)
  const [prevInlineSuccess, setPrevInlineSuccess] = useState<number | null>(lastInlineSuccess)
  const [flashing, setFlashing] = useState(false)

  if (flashToken !== prevToken || lastInlineSuccess !== prevInlineSuccess) {
    setPrevToken(flashToken)
    setPrevInlineSuccess(lastInlineSuccess)
    // We only flash when a token APPEARED or a new inline success arrived,
    // not when they disappear (parent reset → no animation).
    const tokenAppeared = flashToken != null && flashToken !== prevToken
    const inlineSucceeded = lastInlineSuccess != null && lastInlineSuccess !== prevInlineSuccess
    if (tokenAppeared || inlineSucceeded) {
      setFlashing(true)
    }
  }

  // Cleanup-only effect: when `flashing` becomes true, schedule a
  // 1.5s timer to turn it off. setState here is at the END of the
  // animation lifecycle, not synchronous in render — this is the
  // sanctioned escape hatch.
  useEffect(() => {
    if (!flashing) return
    const t = window.setTimeout(() => setFlashing(false), 1500)
    return () => window.clearTimeout(t)
  }, [flashing])

  const isUnscored = score === null
  const isLegacyMissed = isLegacyMissedRow(score, reasoning)
  // Re-score CTA is shown for unscored, legacy-missed, AND zero-scored signals
  // (the bug created many of those — user wants a recovery path).
  const showRescoreButton = isUnscored || isLegacyMissed || score === 0

  const handleRescore = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (rescore.isPending) return
    rescore.mutate({ id: signalId })
  }

  const display = isUnscored ? '—' : isLegacyMissed ? '⟲' : Math.round(score as number).toString()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors duration-1000',
        flashing ? 'bg-primary-fixed' : 'bg-transparent',
      )}
    >
      <HoverCard openDelay={150} closeDelay={80}>
        <HoverCardTrigger asChild>
          <span
            className={cn(
              'inline-flex h-7 w-9 cursor-help items-center justify-center font-mono text-sm tabular-nums',
              scoreColorClasses(score),
            )}
            aria-label={isUnscored ? 'Pas encore scoré' : `Score ${display}/100`}
          >
            {display}
          </span>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="text-xs">
          <ScoreTooltipBody
            score={score}
            reasoning={reasoning}
            modelUsed={modelUsed}
            scoredAt={scoredAt}
            rubricName={rubricName}
            isLegacyMissed={isLegacyMissed}
            isUnscored={isUnscored}
          />
        </HoverCardContent>
      </HoverCard>

      {showRescoreButton && (
        <button
          type="button"
          onClick={handleRescore}
          disabled={rescore.isPending}
          aria-label="Re-scorer ce signal"
          title="Re-scorer ce signal"
          className={cn(
            'text-on-surface-variant hover:bg-surface-container hover:text-on-surface inline-flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-50',
            rescore.isPending && 'cursor-wait',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', rescore.isPending && 'animate-spin')} />
        </button>
      )}
    </div>
  )
}

interface BodyProps {
  score: number | null
  reasoning: string | null
  modelUsed: string | null
  scoredAt: string | null
  rubricName: string | null
  isLegacyMissed: boolean
  isUnscored: boolean
}

function ScoreTooltipBody({
  score,
  reasoning,
  modelUsed,
  scoredAt,
  rubricName,
  isLegacyMissed,
  isUnscored,
}: BodyProps) {
  if (isUnscored) {
    return (
      <div className="space-y-1">
        <p className="text-on-surface font-semibold">Pas encore scoré</p>
        <p className="text-on-surface-variant">
          Ce signal sera scoré au prochain run du pipeline. Tu peux aussi le re-scorer dès
          maintenant via le bouton ↻.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-on-surface text-base font-semibold">
          {score}
          <span className="text-on-surface-variant text-xs font-normal">/100</span>
        </span>
        {scoredAt && (
          <span className="text-on-surface-variant text-[11px]">
            {formatDistanceToNow(new Date(scoredAt), { addSuffix: true, locale: fr })}
          </span>
        )}
      </div>

      {(score === 0 || isLegacyMissed) && (
        <div className="border-tertiary-fixed-dim bg-tertiary-fixed text-on-tertiary-fixed rounded border p-2">
          <p className="font-medium">Ce signal n’a pas pu être scoré correctement.</p>
          <p className="text-on-tertiary-fixed-variant mt-1">
            Clique sur le bouton ↻ pour relancer le scoring.
          </p>
        </div>
      )}

      {reasoning && reasoning !== '(LLM batch missed this signal)' && (
        <div>
          <p className="text-on-surface mb-1 font-medium">Pourquoi ce score ?</p>
          <p className="text-on-surface-variant leading-snug whitespace-pre-line">{reasoning}</p>
        </div>
      )}

      <dl className="border-outline-variant grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t pt-2 text-[11px]">
        {modelUsed && (
          <>
            <dt className="text-on-surface-variant">Modèle</dt>
            <dd className="text-on-surface truncate font-mono">{modelUsed}</dd>
          </>
        )}
        {rubricName && (
          <>
            <dt className="text-on-surface-variant">Rubrique</dt>
            <dd className="text-on-surface truncate">{rubricName}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
