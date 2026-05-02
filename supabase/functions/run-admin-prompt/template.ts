/**
 * template.ts — Template engine isolé (testable) pour run-admin-prompt.
 *
 * Supporte 7 variables :
 *   {{run:<task_kind>}}   → output_markdown du dernier run du task_kind donné
 *   {{signals_block}}     → liste markdown lisible des signaux
 *   {{signals}}           → JSON brut des signaux (tronqué à 30k chars)
 *   {{topics_emerging}}   → noms de topics 'emerging' (csv)
 *   {{language}}          → fr | en | es
 *   {{date}}              → YYYY-MM-DD
 *   {{rubric}}            → prompt de la rubric active (ou placeholder)
 *
 * Aucune dépendance externe — peut être testé en isolation (US-008).
 */

export type Language = 'fr' | 'en' | 'es'

/**
 * Forme minimale d'un signal exploitée par le template engine.
 * On reste tolérant : tous les champs sont optionnels, on lit best-effort.
 */
export interface TemplateSignal {
  id?: string
  source?: string
  title?: string | null
  url?: string | null
  signal_date?: string | null
  scraped_at?: string | null
  score?: number | null
  reasoning?: string | null
  raw_payload?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface TemplateContext {
  signals: TemplateSignal[]
  language: Language
  date: string // YYYY-MM-DD
  topicsEmerging: string[]
  rubric: string | null
  composedRuns: Record<string, string> // task_kind → output_markdown
}

const SIGNALS_JSON_MAX = 30000
const SIGNAL_SUMMARY_MAX = 400

/**
 * Substitue toutes les variables du template avec les valeurs du contexte.
 * L'ordre des substitutions est important : run:<kind> d'abord, car son
 * contenu peut lui-même contenir d'autres marqueurs que l'on souhaite
 * conserver tels quels dans la sortie composée.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  // 1. run:<task_kind> — composition de runs précédents
  let out = template.replace(/\{\{run:([a-z:_-]+)\}\}/g, (_match, kind: string) => {
    const v = ctx.composedRuns[kind]
    return v && v.trim().length > 0 ? v : '(aucun run précédent disponible)'
  })

  // 2. signals_block — markdown lisible
  out = out.replace(/\{\{signals_block\}\}/g, () => renderSignalsBlock(ctx.signals))

  // 3. signals — JSON brut tronqué
  out = out.replace(/\{\{signals\}\}/g, () => {
    const json = JSON.stringify(ctx.signals)
    return json.length > SIGNALS_JSON_MAX ? json.slice(0, SIGNALS_JSON_MAX) : json
  })

  // 4. topics_emerging
  out = out.replace(/\{\{topics_emerging\}\}/g, () =>
    ctx.topicsEmerging.length > 0 ? ctx.topicsEmerging.join(', ') : '(aucun topic émergent)',
  )

  // 5. language, date, rubric
  out = out.replace(/\{\{language\}\}/g, ctx.language)
  out = out.replace(/\{\{date\}\}/g, ctx.date)
  out = out.replace(/\{\{rubric\}\}/g, ctx.rubric ?? '(aucune rubrique active)')

  return out
}

/**
 * Extrait la liste unique des task_kind référencés via run:<kind> dans
 * un template. Permet à l'edge function de ne fetcher que les runs nécessaires.
 */
export function extractComposedRunKinds(template: string): string[] {
  const re = /\{\{run:([a-z:_-]+)\}\}/g
  const set = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    set.add(m[1])
  }
  return Array.from(set)
}

// =============================================================================
// Helpers internes
// =============================================================================

function renderSignalsBlock(signals: TemplateSignal[]): string {
  if (signals.length === 0) return '(aucun signal disponible)'

  return signals
    .map((s, i) => {
      const source = s.source ?? 'unknown'
      const score = typeof s.score === 'number' ? ` (score: ${s.score})` : ''
      const dateRaw = s.signal_date ?? s.scraped_at ?? null
      const date = dateRaw ? ` [${String(dateRaw).slice(0, 10)}]` : ''
      const title = s.title && s.title.length > 0 ? s.title : '(sans titre)'
      const summary = extractSummary(s.raw_payload)
      const truncated =
        summary.length > SIGNAL_SUMMARY_MAX ? summary.slice(0, SIGNAL_SUMMARY_MAX) : summary
      return `### ${i + 1}. [${source}]${date} ${title}${score}\n\n${truncated}`
    })
    .join('\n\n---\n\n')
}

function extractSummary(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = ['summary', 'selftext', 'text', 'description', 'abstract', 'body']
  for (const key of candidates) {
    const v = payload[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}
