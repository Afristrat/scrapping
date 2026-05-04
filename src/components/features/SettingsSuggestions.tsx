import { CheckCircle, Lightbulb } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useSettingsSuggestions,
  type Suggestion,
  type SuggestionType,
} from '@/hooks/useSettingsSuggestions'

interface SettingsSuggestionsProps {
  /** Callback pour naviguer vers un onglet Settings */
  onNavigate?: (tab: string) => void
}

function typeBadgeClass(type: SuggestionType): string {
  switch (type) {
    case 'warning':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
    case 'info':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'tip':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
}

function typeLabel(type: SuggestionType): string {
  switch (type) {
    case 'warning':
      return 'Attention'
    case 'info':
      return 'Info'
    case 'tip':
      return 'Conseil'
  }
}

function SuggestionItem({
  suggestion,
  onNavigate,
}: {
  suggestion: Suggestion
  onNavigate?: (tab: string) => void
}) {
  return (
    <li className="border-outline-variant flex flex-col gap-1.5 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${typeBadgeClass(suggestion.type)}`}
        >
          {typeLabel(suggestion.type)}
        </span>
        <span className="text-on-surface text-sm font-medium">{suggestion.title}</span>
      </div>
      <p className="text-on-surface-variant text-sm leading-relaxed">{suggestion.description}</p>
      {suggestion.action && onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate(suggestion.action!.tab)}
          className="text-primary hover:text-primary/80 mt-0.5 self-start text-xs font-medium underline-offset-2 hover:underline"
        >
          {suggestion.action.label} →
        </button>
      )}
    </li>
  )
}

/**
 * Carte "Suggestions comportementales" affichée dans l'onglet Général de
 * Settings. Les suggestions sont calculées localement (règles déterministes,
 * sans LLM) à partir des données réelles de l'utilisateur.
 */
export function SettingsSuggestions({ onNavigate }: SettingsSuggestionsProps) {
  const { suggestions, isLoading } = useSettingsSuggestions()

  return (
    <section className="bg-surface-container-lowest border-outline-variant rounded-xl border p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Lightbulb className="text-primary h-5 w-5 shrink-0" />
        <h3 className="text-on-surface text-lg font-semibold tracking-tight">Suggestions</h3>
      </div>

      {isLoading ? (
        <ul className="space-y-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="border-outline-variant rounded-lg border p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            </li>
          ))}
        </ul>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle className="text-on-surface-variant h-8 w-8" />
          <p className="text-on-surface-variant text-sm">
            Configuration optimale, aucune suggestion.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionItem key={s.id} suggestion={s} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </section>
  )
}
