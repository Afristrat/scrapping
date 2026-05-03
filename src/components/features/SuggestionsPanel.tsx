import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface SuggestedHat {
  name: string
  key: string
  context_md: string
}

export interface SuggestedProject {
  name: string
  key: string
  context_md: string
  date_start: string
  date_end: string
}

export interface Suggestions {
  hats: SuggestedHat[]
  projects: SuggestedProject[]
}

interface SuggestionCardProps {
  name: string
  slug: string
  contextMd: string
  badge: string
  badgeVariant?: 'default' | 'outline' | 'secondary'
  meta?: string
  onAccept: () => void
  onIgnore: () => void
}

function SuggestionCard({
  name,
  slug,
  contextMd,
  badge,
  meta,
  onAccept,
  onIgnore,
}: SuggestionCardProps) {
  return (
    <div className="border-outline-variant bg-surface-container-low flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-on-surface text-sm font-medium">{name}</span>
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          </div>
          <span className="text-on-surface-variant text-xs tabular-nums">{slug}</span>
          {meta && <p className="text-on-surface-variant mt-0.5 text-xs">{meta}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
            onClick={onAccept}
            aria-label={`Ajouter ${name}`}
            title="Ajouter"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onIgnore}
            aria-label={`Ignorer ${name}`}
            title="Ignorer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {contextMd && (
        <p className="text-on-surface-variant line-clamp-3 text-xs leading-relaxed">{contextMd}</p>
      )}
    </div>
  )
}

interface SuggestionsPanelProps {
  suggestions: Suggestions
  /** Appelé quand l'utilisateur accepte un Hat */
  onAcceptHat: (hat: SuggestedHat) => void
  /** Appelé quand l'utilisateur accepte un Project */
  onAcceptProject: (project: SuggestedProject) => void
  /** Appelé quand l'utilisateur ignore une suggestion (retire de l'UI) */
  onIgnore: (kind: 'hat' | 'project', key: string) => void
}

/**
 * Panneau des suggestions de personas générées par l'IA.
 * Affiche les Hats et Projects suggérés avec des boutons Ajouter / Ignorer.
 */
export function SuggestionsPanel({
  suggestions,
  onAcceptHat,
  onAcceptProject,
  onIgnore,
}: SuggestionsPanelProps) {
  const totalCount = suggestions.hats.length + suggestions.projects.length

  if (totalCount === 0) {
    return (
      <div className="border-outline-variant rounded-lg border border-dashed py-6 text-center">
        <p className="text-on-surface-variant text-sm">Aucune suggestion disponible.</p>
      </div>
    )
  }

  return (
    <div className="border-primary/30 bg-primary/5 space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-on-surface text-sm font-semibold">
          Suggestions IA{' '}
          <span className="text-on-surface-variant font-normal">({totalCount} suggestions)</span>
        </h3>
      </div>

      {/* Hats */}
      {suggestions.hats.length > 0 && (
        <div className="space-y-2">
          <p className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
            Hats ({suggestions.hats.length})
          </p>
          {suggestions.hats.map((hat) => (
            <SuggestionCard
              key={hat.key}
              name={hat.name}
              slug={hat.key}
              contextMd={hat.context_md}
              badge="Hat"
              onAccept={() => onAcceptHat(hat)}
              onIgnore={() => onIgnore('hat', hat.key)}
            />
          ))}
        </div>
      )}

      {/* Projects */}
      {suggestions.projects.length > 0 && (
        <div className="space-y-2">
          <p className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">
            Projects ({suggestions.projects.length})
          </p>
          {suggestions.projects.map((project) => (
            <SuggestionCard
              key={project.key}
              name={project.name}
              slug={project.key}
              contextMd={project.context_md}
              badge="Project"
              meta={
                project.date_start || project.date_end
                  ? `${project.date_start || '?'} → ${project.date_end || '?'}`
                  : undefined
              }
              onAccept={() => onAcceptProject(project)}
              onIgnore={() => onIgnore('project', project.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
