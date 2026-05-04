import { RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { usePersonas } from '@/hooks/usePersonas'
import { useTopicsTaxonomy } from '@/hooks/useTopicsTaxonomy'
import { SOURCES, SOURCE_META } from '@/lib/source-meta'
import { cn } from '@/lib/utils'
import { type SignalFilters, isFiltersEmpty } from '@/lib/signal-filters'

// ---------------------------------------------------------------------------
// Fenêtres temporelles
// ---------------------------------------------------------------------------

const WINDOW_OPTIONS: Array<{ label: string; hours: number | null }> = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7j', hours: 168 },
  { label: '30j', hours: 720 },
  { label: '90j', hours: 2160 },
  { label: 'Tout', hours: null },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardFiltersProps {
  filters: SignalFilters
  onChange: (f: SignalFilters) => void
  onReset: () => void
  /** Nombre de signaux actuellement affichés, pour le compteur dynamique */
  resultCount?: number
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function DashboardFilters({
  filters,
  onChange,
  onReset,
  resultCount,
}: DashboardFiltersProps) {
  const { data: topics } = useTopicsTaxonomy()
  const { data: personas } = usePersonas()

  const filtersActive = !isFiltersEmpty(filters)

  // --- Toggles ---
  const toggleTopic = (slug: string) => {
    const next = filters.topicSlugs.includes(slug)
      ? filters.topicSlugs.filter((s: string) => s !== slug)
      : [...filters.topicSlugs, slug]
    onChange({ ...filters, topicSlugs: next })
  }

  const togglePersona = (key: string) => {
    const next = filters.personaKeys.includes(key)
      ? filters.personaKeys.filter((k: string) => k !== key)
      : [...filters.personaKeys, key]
    onChange({ ...filters, personaKeys: next })
  }

  const toggleSource = (source: string) => {
    const next = filters.sources.includes(source)
      ? filters.sources.filter((s: string) => s !== source)
      : [...filters.sources, source]
    onChange({ ...filters, sources: next })
  }

  const handleScoreChange = (value: number[]) => {
    const v = value[0] ?? 0
    onChange({ ...filters, minScore: v === 0 ? null : v })
  }

  const handleWindowChange = (hours: number | null) => {
    onChange({ ...filters, windowHours: hours })
  }

  const scoreValue = filters.minScore ?? 0

  return (
    <div
      data-testid="dashboard-filters"
      className="border-outline-variant bg-surface-container-lowest flex flex-col gap-5 rounded-xl border p-4 shadow-sm"
    >
      {/* En-tête avec compteur et bouton reset */}
      <div className="flex items-center justify-between">
        <span className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
          Filtres
          {resultCount !== undefined && (
            <span className="text-on-surface ml-2 font-mono normal-case">
              — {resultCount} signal{resultCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            className="text-on-surface-variant hover:text-on-surface h-7 gap-1.5 text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Multi-select sources */}
      <div>
        <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
          Sources
        </p>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => {
            const active = filters.sources.includes(s)
            const { label, Icon } = SOURCE_META[s]
            return (
              <Button
                key={s}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => toggleSource(s)}
                aria-pressed={active}
                data-testid={`source-toggle-${s}`}
                className={cn('gap-1.5', !active && 'text-on-surface-variant')}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Multi-select topics */}
      {topics && topics.length > 0 && (
        <div>
          <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
            Topics
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((topic) => {
              const active = filters.topicSlugs.includes(topic.slug)
              return (
                <Badge
                  key={topic.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  data-testid={`topic-badge-${topic.slug}`}
                  onClick={() => toggleTopic(topic.slug)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleTopic(topic.slug)
                    }
                  }}
                  className={cn(
                    'cursor-pointer transition-colors select-none',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {topic.name}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Multi-select personas */}
      {personas && personas.length > 0 && (
        <div>
          <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
            Personas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {personas.map((persona) => {
              const active = filters.personaKeys.includes(persona.key)
              return (
                <Badge
                  key={persona.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  data-testid={`persona-badge-${persona.key}`}
                  onClick={() => togglePersona(persona.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      togglePersona(persona.key)
                    }
                  }}
                  className={cn(
                    'cursor-pointer transition-colors select-none',
                    active
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {persona.name}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Slider score minimum */}
      <div>
        <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
          Score ≥{' '}
          <span className="text-on-surface font-mono">{scoreValue === 0 ? '—' : scoreValue}</span>
        </p>
        <Slider
          value={[scoreValue]}
          min={0}
          max={100}
          step={5}
          onValueChange={handleScoreChange}
          aria-label="Score minimum"
        />
      </div>

      {/* Sélecteur fenêtre temporelle */}
      <div>
        <p className="text-on-surface-variant mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
          Fenêtre
        </p>
        <div className="flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map((opt) => {
            const active = filters.windowHours === opt.hours
            return (
              <Button
                key={opt.label}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => handleWindowChange(opt.hours)}
                aria-pressed={active}
                data-testid={`window-btn-${opt.label}`}
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
