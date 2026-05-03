import { CircleAlert, CircleCheck, CircleHelp, ShieldCheck, ShieldQuestion } from 'lucide-react'

import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '@/lib/confidence-levels'
import { cn } from '@/lib/utils'

/**
 * Wave 10.0 — Words of Estimative Probability rendering.
 *
 * Rendu visuel des 5 niveaux de confiance dans le digest stratégique. La logique
 * (META + détection) vit dans `src/lib/confidence-levels.ts`. Ce composant ne fait
 * que le mapping niveau → icône + classes Tailwind/Material You.
 */

const ICON_BY_LEVEL: Record<ConfidenceLevel, typeof CircleCheck> = {
  'almost-certain': ShieldCheck,
  'very-likely': CircleCheck,
  likely: ShieldQuestion,
  possible: CircleHelp,
  speculative: CircleAlert,
}

const CLASSES_BY_LEVEL: Record<ConfidenceLevel, string> = {
  'almost-certain':
    'border-primary-fixed bg-primary-fixed text-on-primary-fixed [&_svg]:text-primary',
  'very-likely':
    'border-tertiary-fixed bg-tertiary-fixed text-on-tertiary-fixed [&_svg]:text-tertiary',
  likely:
    'border-secondary-fixed-dim bg-secondary-fixed text-on-secondary-fixed [&_svg]:text-secondary',
  possible:
    'border-outline-variant bg-surface-container text-on-surface-variant [&_svg]:text-on-surface-variant',
  speculative: 'border-error/30 bg-error-container/40 text-on-error-container [&_svg]:text-error',
}

interface Props {
  level: ConfidenceLevel
  language?: 'fr' | 'en' | 'es'
  className?: string
}

export function ConfidenceBadge({
  level,
  language = 'fr',
  className,
}: Props): React.ReactElement | null {
  const meta = CONFIDENCE_LEVELS.find((m) => m.level === level)
  if (!meta) return null
  const Icon = ICON_BY_LEVEL[level]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-[10px] font-bold tracking-wider uppercase',
        CLASSES_BY_LEVEL[level],
        className,
      )}
      title={meta.description[language]}
      data-confidence={level}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {meta.label[language]}
    </span>
  )
}
