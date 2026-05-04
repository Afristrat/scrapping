import type { Settings } from '@/hooks/useSettings'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

export interface SettingsDiff {
  field: string
  label: string
  before: string
  after: string
}

/** Sérialise un couple provider/model en chaîne lisible, ou "—" si absent. */
function serializeModel(mc: { provider: string; model: string } | null | undefined): string {
  if (!mc?.provider && !mc?.model) return '—'
  return `${mc.provider} / ${mc.model}`
}

/** Sérialise un tableau de chaînes en liste triée alphabétiquement, séparée par virgules. */
function serializeList(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '—'
  return [...arr].sort((a, b) => a.localeCompare(b)).join(', ')
}

/** Formate un budget en dollars. */
function serializeBudget(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `$${value.toFixed(2)}`
}

/** Sérialise la langue (code → libellé). */
function serializeLanguage(lang: string | null | undefined): string {
  const labels: Record<string, string> = { fr: 'Français', en: 'English', es: 'Español' }
  return lang ? (labels[lang] ?? lang) : '—'
}

/**
 * Calcule la liste des champs modifiés entre les settings DB actuels et les
 * valeurs saisies dans le formulaire. Seuls les champs qui ont réellement changé
 * sont inclus dans le tableau retourné.
 */
export function computeSettingsDiff(before: Settings, after: SettingsFormValues): SettingsDiff[] {
  const diffs: SettingsDiff[] = []

  function push(field: string, label: string, b: string, a: string) {
    if (b !== a) {
      diffs.push({ field, label, before: b, after: a })
    }
  }

  // Modèles par tâche
  push(
    'model_scoring',
    'Modèle scoring',
    serializeModel(before.model_config?.scoring),
    serializeModel(after.model_config?.scoring),
  )
  push(
    'model_scraping',
    'Modèle scraping',
    serializeModel(before.model_config?.scraping),
    serializeModel(after.model_config?.scraping),
  )
  push(
    'model_monitoring',
    'Modèle monitoring',
    serializeModel(before.model_config?.monitoring),
    serializeModel(after.model_config?.monitoring),
  )
  push(
    'model_digest',
    'Modèle digest',
    serializeModel(before.model_config?.digest),
    serializeModel(after.model_config?.digest),
  )
  push(
    'model_enrichment',
    'Modèle enrichment',
    serializeModel(
      (before.model_config as { enrichment?: { provider: string; model: string } | null })
        ?.enrichment,
    ),
    serializeModel(after.model_config?.enrichment),
  )

  // Budget quotidien
  push(
    'daily_budget_usd',
    'Budget quotidien',
    serializeBudget(before.daily_budget_usd),
    serializeBudget(after.daily_budget_usd),
  )

  // Langue digest
  push(
    'digest_language',
    'Langue digest',
    serializeLanguage(before.language),
    serializeLanguage(after.language),
  )

  // Sources : listes triées pour comparaison stable
  push(
    'reddit_subs',
    'Subreddits Reddit',
    serializeList(before.reddit_subs),
    serializeList(after.reddit_subs),
  )
  push(
    'arxiv_categories',
    'Catégories ArXiv',
    serializeList(before.arxiv_categories),
    serializeList(after.arxiv_categories),
  )
  push('x_queries', 'Requêtes X', serializeList(before.x_queries), serializeList(after.x_queries))

  return diffs
}
