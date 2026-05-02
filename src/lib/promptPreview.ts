/**
 * promptPreview.ts — Substitution front-side des variables d'un template
 * de prompt admin pour rendre un apercu editable sans appel serveur.
 *
 * Variables substituees avec donnees reelles :
 *   {{date}}       -> YYYY-MM-DD (date du jour)
 *   {{language}}   -> fr | en | es (depuis settings)
 *
 * Variables remplacees par un placeholder explicite (impossibles cote front
 * sans charger les donnees couteuses) :
 *   {{signals_block}}    -> "(N signaux seront injectes selon le filter)"
 *   {{signals}}          -> "(JSON brut des signaux - injecte par l'edge fn)"
 *   {{topics_emerging}}  -> "(top 10 topics emerging - injecte par l'edge fn)"
 *   {{rubric}}           -> "(prompt de la rubrique active - injecte par l'edge fn)"
 *   {{run:<kind>}}       -> "(dernier run du task_kind kind - injecte par l'edge fn)"
 */

const KNOWN_STATIC_VARS = [
  'signals_block',
  'signals',
  'topics_emerging',
  'language',
  'date',
  'rubric',
] as const

const RUN_KIND_RE = /\{\{run:([a-z:_-]+)\}\}/g
const ANY_VAR_RE = /\{\{([a-zA-Z0-9_:.-]+)\}\}/g

export type PromptLanguage = 'fr' | 'en' | 'es'

export interface PreviewContext {
  language: PromptLanguage
  date: string // YYYY-MM-DD
  signalsCount?: number | null // si null/undefined -> "N"
}

export interface DetectedVariable {
  name: string // ex. "date", "run:reddit"
  used: boolean // true si presente dans system+user template
  known: boolean // true si reconnue par l'edge fn
}

/**
 * Substitue les variables cote front. Les variables necessitant un fetch
 * serveur sont remplacees par un placeholder lisible (jamais par une chaine
 * vide) afin que l'utilisateur visualise l'emplacement.
 */
export function renderPromptPreview(template: string, ctx: PreviewContext): string {
  const signalsLabel =
    ctx.signalsCount != null
      ? `(${ctx.signalsCount} signaux seront injectes selon le filter)`
      : '(N signaux seront injectes selon le filter)'

  let out = template.replace(RUN_KIND_RE, (_match, kind: string) => {
    return `(dernier run du task_kind « ${kind} » - injecte par l'edge fn)`
  })

  out = out.replace(/\{\{signals_block\}\}/g, signalsLabel)
  out = out.replace(/\{\{signals\}\}/g, "(JSON brut des signaux - injecte par l'edge fn)")
  out = out.replace(
    /\{\{topics_emerging\}\}/g,
    "(top 10 topics emerging - injecte par l'edge fn)",
  )
  out = out.replace(
    /\{\{rubric\}\}/g,
    "(prompt de la rubrique active - injecte par l'edge fn)",
  )
  out = out.replace(/\{\{language\}\}/g, ctx.language)
  out = out.replace(/\{\{date\}\}/g, ctx.date)

  return out
}

/**
 * Renvoie aujourd'hui au format YYYY-MM-DD (UTC).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Liste toutes les variables detectees dans le template (system + user)
 * avec un flag `known` indiquant si l'edge fn les supporte.
 * Doublons fusionnes ; ordre = ordre d'apparition.
 */
export function detectVariables(
  systemPrompt: string,
  userTemplate: string,
): DetectedVariable[] {
  const combined = `${systemPrompt}\n${userTemplate}`
  const seen = new Map<string, DetectedVariable>()

  let m: RegExpExecArray | null
  ANY_VAR_RE.lastIndex = 0
  while ((m = ANY_VAR_RE.exec(combined)) !== null) {
    const name = m[1]
    if (seen.has(name)) continue
    const known = isKnownVariable(name)
    seen.set(name, { name, used: true, known })
  }

  return Array.from(seen.values())
}

function isKnownVariable(name: string): boolean {
  if (name.startsWith('run:')) return true
  return (KNOWN_STATIC_VARS as readonly string[]).includes(name)
}
