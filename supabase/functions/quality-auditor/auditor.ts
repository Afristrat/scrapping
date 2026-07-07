/**
 * auditor.ts — Pure logic helpers for the quality-auditor edge function.
 *
 * BYOK strict — no model imposed. The LLM portion is dispatched via
 * `dispatch-llm` with `task: 'enrichment'` so the user's
 * `settings.model_config[enrichment]` resolves the provider/model.
 *
 * Exported as standalone helpers so they can be unit-tested without
 * spinning a Deno.serve handler.
 */

import { parseLlmJson } from '../_shared/llm-json.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

export type IssueAxis =
  | 'hallucination'
  | 'coverage'
  | 'linguistic'
  | 'novelty'
  | 'actionability'
  | 'bias'
  | 'devil_advocate'
  | 'brief_format'

export type IssueSeverity = 'high' | 'medium' | 'low'

export type FixAction = 'auto_correct' | 'trigger_deepening' | 'warn_user' | 'none'

export interface AuditIssue {
  axis: IssueAxis
  severity: IssueSeverity
  location: string
  description: string
  fix_action: FixAction
  auto_correction: string | null
}

export type Verdict = 'pass' | 'warn' | 'fail' | 'deepen'

export type DeepeningTargetType =
  | 'uncovered_subject'
  | 'cross_topic_conflict'
  | 'cultural_blindspot'

export interface DeepeningTarget {
  type: DeepeningTargetType
  context: string
  suggested_sub_seed: string
}

export interface BriefVariant {
  framework_hint?: string
  brief: string
  rationale?: string
}

export interface TopicShape {
  id: string
  label?: string
  type?: string
  key_signals_supporting?: string[]
  key_signals_conflicting?: string[]
  cross_topic_conflicts?: Array<{ topic_id: string; signal_id: string }>
  brief_variants?: BriefVariant[]
  internal_tension?: string | null
  provenance?: {
    lang_distribution?: Record<string, number>
  }
  warnings?: string[]
}

export interface CoverageMapEntry {
  signals_count: number
  covered: boolean
  topics: string[]
}

export interface ResearchStrategy {
  language_mix?: string[]
  subjects?: Array<{ id: string; title?: string }>
  blind_spots?: Array<{ description: string; mitigation_query?: string }>
}

export interface TopicsOutput {
  topics: TopicShape[]
  coverage_map: Record<string, CoverageMapEntry>
  cultural_warnings?: string[]
  devil_advocate_topic_id?: string | null
}

export interface SignalRef {
  id: string
  lang?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const BRIEF_MIN = 250
export const BRIEF_MAX = 400
export const COVERAGE_FAIL_RATIO = 0.3
export const LINGUISTIC_DOMINANCE = 0.9

// ─── Deterministic checks ───────────────────────────────────────────────────

/**
 * Hallucination check. Every signal_id referenced by any topic
 * (supporting / conflicting / cross_topic) must exist in the input
 * signals list. Unknown ids → high severity issue, fail track.
 */
export function checkHallucination(topics: TopicShape[], signalsInput: SignalRef[]): AuditIssue[] {
  const known = new Set(signalsInput.map((s) => s.id))
  const issues: AuditIssue[] = []

  for (const topic of topics) {
    const supporting = topic.key_signals_supporting ?? []
    const conflicting = topic.key_signals_conflicting ?? []
    const cross = (topic.cross_topic_conflicts ?? []).map((c) => c.signal_id)

    for (const sid of supporting) {
      if (!known.has(sid)) {
        issues.push({
          axis: 'hallucination',
          severity: 'high',
          location: `topic.${topic.id}.key_signals_supporting`,
          description:
            `Signal id "${sid}" cité comme support du topic ${topic.id} ` +
            `n'existe pas dans signals_input.`,
          fix_action: 'none',
          auto_correction: null,
        })
      }
    }
    for (const sid of conflicting) {
      if (!known.has(sid)) {
        issues.push({
          axis: 'hallucination',
          severity: 'high',
          location: `topic.${topic.id}.key_signals_conflicting`,
          description:
            `Signal id "${sid}" cité comme contradiction du topic ${topic.id} ` +
            `n'existe pas dans signals_input.`,
          fix_action: 'none',
          auto_correction: null,
        })
      }
    }
    for (const sid of cross) {
      if (!known.has(sid)) {
        issues.push({
          axis: 'hallucination',
          severity: 'high',
          location: `topic.${topic.id}.cross_topic_conflicts`,
          description:
            `Signal id "${sid}" cité en cross_topic_conflict du topic ${topic.id} ` +
            `n'existe pas dans signals_input.`,
          fix_action: 'none',
          auto_correction: null,
        })
      }
    }
  }
  return issues
}

/**
 * Coverage check. Returns the ratio of subjects without any retained
 * signal. > 30% → high severity, candidate for deepen.
 */
export function checkCoverage(coverageMap: Record<string, CoverageMapEntry>): {
  ratio: number
  uncoveredSubjects: string[]
  issues: AuditIssue[]
} {
  const subjectIds = Object.keys(coverageMap)
  if (subjectIds.length === 0) {
    return { ratio: 0, uncoveredSubjects: [], issues: [] }
  }

  const uncovered = subjectIds.filter((id) => {
    const entry = coverageMap[id]
    return !entry.covered || (entry.signals_count ?? 0) === 0
  })
  const ratio = uncovered.length / subjectIds.length
  const issues: AuditIssue[] = []

  if (ratio > COVERAGE_FAIL_RATIO) {
    issues.push({
      axis: 'coverage',
      severity: 'high',
      location: `coverage_map`,
      description:
        `${uncovered.length}/${subjectIds.length} subjects sans signal ` +
        `(ratio ${(ratio * 100).toFixed(0)} % > seuil 30 %). ` +
        `Subjects manquants : ${uncovered.join(', ')}.`,
      fix_action: 'trigger_deepening',
      auto_correction: null,
    })
  } else if (uncovered.length > 0) {
    issues.push({
      axis: 'coverage',
      severity: 'medium',
      location: `coverage_map`,
      description:
        `${uncovered.length}/${subjectIds.length} subjects sans signal. ` +
        `Subjects : ${uncovered.join(', ')}.`,
      fix_action: 'warn_user',
      auto_correction: null,
    })
  }
  return { ratio, uncoveredSubjects: uncovered, issues }
}

/**
 * Linguistic check. If language_mix demands fr+ar+en (or any subset
 * with ≥ 2 langues) but the dominant language across topic signals
 * exceeds 90 %, flag it (medium-high severity).
 */
export function checkLinguistic(
  strategy: ResearchStrategy,
  topics: TopicShape[],
): { dominantLang: string | null; ratio: number; issues: AuditIssue[] } {
  const expected = strategy.language_mix ?? []
  if (expected.length < 2) {
    return { dominantLang: null, ratio: 0, issues: [] }
  }

  const counts: Record<string, number> = {}
  let total = 0
  for (const t of topics) {
    const dist = t.provenance?.lang_distribution ?? {}
    for (const [lang, n] of Object.entries(dist)) {
      const v = typeof n === 'number' && n > 0 ? n : 0
      counts[lang] = (counts[lang] ?? 0) + v
      total += v
    }
  }

  if (total === 0) {
    return { dominantLang: null, ratio: 0, issues: [] }
  }

  let dominant: string | null = null
  let dominantN = 0
  for (const [lang, n] of Object.entries(counts)) {
    if (n > dominantN) {
      dominantN = n
      dominant = lang
    }
  }
  const ratio = total > 0 ? dominantN / total : 0
  const issues: AuditIssue[] = []

  if (ratio >= LINGUISTIC_DOMINANCE && dominant) {
    const missing = expected.filter((l) => (counts[l] ?? 0) === 0)
    issues.push({
      axis: 'linguistic',
      severity: 'high',
      location: 'topics.provenance.lang_distribution',
      description:
        `Langue dominante "${dominant}" à ${(ratio * 100).toFixed(0)} % ` +
        `des signaux retenus, alors que language_mix attendait ` +
        `${expected.join('+')}. Langues absentes : ${missing.join(', ') || 'aucune'}.`,
      fix_action: 'trigger_deepening',
      auto_correction: null,
    })
  }
  return { dominantLang: dominant, ratio, issues }
}

/**
 * Devil's advocate presence + correctness. The id must point to an
 * existing topic AND that topic must carry type === 'devil_advocate'.
 * If absent or fake → high severity, deepen.
 */
export function checkDevilAdvocate(
  topics: TopicShape[],
  devilAdvocateId: string | null | undefined,
): AuditIssue[] {
  const issues: AuditIssue[] = []
  if (!devilAdvocateId) {
    issues.push({
      axis: 'devil_advocate',
      severity: 'high',
      location: 'devil_advocate_topic_id',
      description:
        `Aucun devil_advocate_topic_id fourni. La synthèse manque d'un ` +
        `topic explicitement contraire à la lecture dominante.`,
      fix_action: 'trigger_deepening',
      auto_correction: null,
    })
    return issues
  }
  const topic = topics.find((t) => t.id === devilAdvocateId)
  if (!topic) {
    issues.push({
      axis: 'devil_advocate',
      severity: 'high',
      location: `devil_advocate_topic_id="${devilAdvocateId}"`,
      description:
        `devil_advocate_topic_id pointe sur "${devilAdvocateId}" qui ` +
        `n'existe pas dans topics[].`,
      fix_action: 'trigger_deepening',
      auto_correction: null,
    })
    return issues
  }
  if (topic.type !== 'devil_advocate') {
    issues.push({
      axis: 'devil_advocate',
      severity: 'high',
      location: `topic.${devilAdvocateId}.type`,
      description:
        `Topic ${devilAdvocateId} référencé comme devil's advocate mais ` +
        `son type est "${topic.type ?? 'undefined'}" (attendu : "devil_advocate").`,
      fix_action: 'trigger_deepening',
      auto_correction: null,
    })
  }
  return issues
}

/**
 * Brief length check + auto-correction. Returns issues + a map of
 * auto-corrected briefs (location → corrected string). Briefs out of
 * the 250-400 char range are truncated (or padded with rationale) when
 * possible. Auto-correction is reported in `auto_corrections_applied`.
 */
export function checkBriefFormat(topics: TopicShape[]): {
  issues: AuditIssue[]
  corrections: Record<string, string>
} {
  const issues: AuditIssue[] = []
  const corrections: Record<string, string> = {}

  for (const topic of topics) {
    const variants = topic.brief_variants ?? []
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]
      const brief = (v.brief ?? '').trim()
      const len = brief.length
      const location = `topic.${topic.id}.brief_variants[${i}]`

      if (len === 0) {
        issues.push({
          axis: 'brief_format',
          severity: 'medium',
          location,
          description: `Brief vide.`,
          fix_action: 'warn_user',
          auto_correction: null,
        })
        continue
      }

      if (len < BRIEF_MIN) {
        // Try to extend with rationale tail if the rationale brings
        // semantic content (not a duplicate). Otherwise warn only.
        const rationale = (v.rationale ?? '').trim()
        const candidate =
          rationale && !brief.toLowerCase().includes(rationale.toLowerCase())
            ? `${brief} Cadrage : ${rationale}.`
            : brief

        if (candidate.length >= BRIEF_MIN && candidate.length <= BRIEF_MAX) {
          corrections[location] = candidate
          issues.push({
            axis: 'brief_format',
            severity: 'medium',
            location,
            description:
              `Brief de ${len} chars (< ${BRIEF_MIN}) étendu via rationale ` +
              `à ${candidate.length} chars.`,
            fix_action: 'auto_correct',
            auto_correction: candidate,
          })
        } else {
          issues.push({
            axis: 'brief_format',
            severity: 'medium',
            location,
            description:
              `Brief de ${len} chars hors plage [${BRIEF_MIN}-${BRIEF_MAX}] ` +
              `et non auto-corrigeable (rationale insuffisante).`,
            fix_action: 'warn_user',
            auto_correction: null,
          })
        }
      } else if (len > BRIEF_MAX) {
        // Smart truncation : cut at last sentence boundary <= BRIEF_MAX
        // to avoid mid-sentence truncation. Falls back to hard cut.
        const truncated = smartTruncate(brief, BRIEF_MAX)
        corrections[location] = truncated
        issues.push({
          axis: 'brief_format',
          severity: 'medium',
          location,
          description:
            `Brief de ${len} chars (> ${BRIEF_MAX}) tronqué intelligemment ` +
            `à ${truncated.length} chars.`,
          fix_action: 'auto_correct',
          auto_correction: truncated,
        })
      }
    }
  }
  return { issues, corrections }
}

/**
 * Smart truncate at the last sentence boundary <= max. Falls back to
 * a hard cut at max with an ellipsis. Keeps result <= max chars.
 */
export function smartTruncate(text: string, max: number): string {
  if (text.length <= max) return text
  const window = text.slice(0, max)
  // Look for a sentence boundary in the last 80 chars
  const tail = window.slice(Math.max(0, window.length - 80))
  const offset = window.length - tail.length
  const boundaryRegex = /[.!?…؟](?=\s|$)/g
  let lastIdx = -1
  let m: RegExpExecArray | null
  while ((m = boundaryRegex.exec(tail)) !== null) {
    lastIdx = offset + m.index + 1
  }
  if (lastIdx > 0 && lastIdx >= max - 80) {
    return text.slice(0, lastIdx).trim()
  }
  // Hard cut at last word boundary <= max-1 (room for ellipsis)
  const slice = text.slice(0, max - 1)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max - 80 ? lastSpace : max - 1
  return text.slice(0, cut).trimEnd() + '…'
}

// ─── LLM issues parsing ─────────────────────────────────────────────────────

const LLM_AXES: ReadonlySet<IssueAxis> = new Set([
  'novelty',
  'actionability',
  'bias',
  // The LLM may also re-flag the deterministic axes; we accept them
  // but they will be deduplicated downstream when we merge.
  'hallucination',
  'coverage',
  'linguistic',
  'devil_advocate',
  'brief_format',
])

const LLM_SEVERITIES: ReadonlySet<IssueSeverity> = new Set(['high', 'medium', 'low'])

const LLM_FIX_ACTIONS: ReadonlySet<FixAction> = new Set([
  'auto_correct',
  'trigger_deepening',
  'warn_user',
  'none',
])

/**
 * Parse the LLM `{ issues: [...] }` JSON response. Resilient to bad
 * shapes: every malformed entry is dropped silently. Markdown fences
 * are stripped before parsing.
 */
export function parseLlmIssues(raw: string): AuditIssue[] {
  if (!raw || typeof raw !== 'string') return []
  let parsed: unknown
  try {
    parsed = parseLlmJson(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const issues = (parsed as { issues?: unknown }).issues
  if (!Array.isArray(issues)) return []

  const result: AuditIssue[] = []
  for (const item of issues) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const axis = rec.axis as string
    const severity = rec.severity as string
    const location = rec.location as string
    const description = rec.description as string
    const fixAction = (rec.fix_action as string) ?? 'none'
    const autoCorrection = rec.auto_correction

    if (typeof axis !== 'string' || !LLM_AXES.has(axis as IssueAxis)) continue
    if (typeof severity !== 'string' || !LLM_SEVERITIES.has(severity as IssueSeverity)) continue
    if (typeof location !== 'string' || location.length === 0) continue
    if (typeof description !== 'string' || description.length === 0) continue
    const fixActionTyped: FixAction = LLM_FIX_ACTIONS.has(fixAction as FixAction)
      ? (fixAction as FixAction)
      : 'none'

    result.push({
      axis: axis as IssueAxis,
      severity: severity as IssueSeverity,
      location,
      description,
      fix_action: fixActionTyped,
      auto_correction: typeof autoCorrection === 'string' ? autoCorrection : null,
    })
  }
  return result
}

// ─── Decision tree ──────────────────────────────────────────────────────────

const DEEPENABLE_AXES: ReadonlySet<IssueAxis> = new Set([
  'coverage',
  'devil_advocate',
  'linguistic',
])

/**
 * Maps a high-severity issue to a deepening target if the axis has a
 * known deepening recipe. Returns null otherwise.
 */
export function deepeningTargetFromIssue(
  issue: AuditIssue,
  strategy: ResearchStrategy,
  uncoveredSubjects: string[],
): DeepeningTarget | null {
  if (issue.severity !== 'high') return null
  if (!DEEPENABLE_AXES.has(issue.axis)) return null

  if (issue.axis === 'coverage' && uncoveredSubjects.length > 0) {
    const subjectTitles = uncoveredSubjects
      .map((id) => {
        const s = (strategy.subjects ?? []).find((x) => x.id === id)
        return s?.title ?? id
      })
      .join(' ; ')
    return {
      type: 'uncovered_subject',
      context: `Subjects sans aucun signal retenu : ${uncoveredSubjects.join(', ')}.`,
      suggested_sub_seed:
        `Recherche ciblée sur les sujets non couverts au 1er pass : ` + `${subjectTitles}.`,
    }
  }

  if (issue.axis === 'linguistic') {
    const expected = strategy.language_mix ?? []
    return {
      type: 'cultural_blindspot',
      context: issue.description,
      suggested_sub_seed:
        `Sources arabophones et anglophones (selon language_mix attendu : ` +
        `${expected.join('+') || 'fr+ar+en'}) sur le sujet, en privilégiant ` +
        `voix locales, primaires et non-mainstream.`,
    }
  }

  if (issue.axis === 'devil_advocate') {
    return {
      type: 'cross_topic_conflict',
      context:
        `Aucun devil's advocate valide. Re-générer un topic explicitement ` +
        `contraire à la lecture dominante de la graine.`,
      suggested_sub_seed:
        `Hypothèse contraire : que se passe-t-il si la lecture dominante ` +
        `de la graine est fausse ou retardée ? Forcer arguments + signaux ` +
        `qui invalident le scénario central.`,
    }
  }
  return null
}

export interface VerdictResult {
  verdict: Verdict
  deepening_targets: DeepeningTarget[]
}

/**
 * Decision tree (cf. doc PROMPT 4) :
 * - aucune issue high → pass
 * - 1-3 medium, aucune high → warn
 * - issues high deepenables (coverage / linguistic / devil_advocate) → deepen
 * - issues high non-deepenables (hallucination, ≥ 2 high d'axes différents
 *   sans recipe) → fail
 *
 * Si plusieurs high coexistent dont au moins 1 hallucination → fail
 * (l'incident hallucination prime, on ne deepening pas un output corrompu).
 *
 * Si plusieurs high coexistent toutes deepenables → deepen, on
 * concatène les deepening_targets.
 */
export function computeVerdict(
  issues: AuditIssue[],
  strategy: ResearchStrategy,
  uncoveredSubjects: string[],
): VerdictResult {
  const high = issues.filter((i) => i.severity === 'high')
  const medium = issues.filter((i) => i.severity === 'medium')

  if (high.length === 0) {
    if (medium.length === 0) {
      return { verdict: 'pass', deepening_targets: [] }
    }
    return { verdict: 'warn', deepening_targets: [] }
  }

  const hasHallucination = high.some((i) => i.axis === 'hallucination')
  if (hasHallucination) {
    return { verdict: 'fail', deepening_targets: [] }
  }

  const targets: DeepeningTarget[] = []
  let allDeepenable = true
  for (const issue of high) {
    const t = deepeningTargetFromIssue(issue, strategy, uncoveredSubjects)
    if (t) {
      // Avoid duplicate targets (same type + same context)
      const dupe = targets.find((x) => x.type === t.type && x.context === t.context)
      if (!dupe) targets.push(t)
    } else {
      allDeepenable = false
    }
  }

  if (allDeepenable && targets.length > 0) {
    return { verdict: 'deepen', deepening_targets: targets }
  }
  return { verdict: 'fail', deepening_targets: targets }
}

/**
 * Merge deterministic + LLM issues; drop near-duplicates (same axis +
 * same location). Deterministic issues take precedence — they keep
 * their fix_action and auto_correction.
 */
export function mergeIssues(deterministic: AuditIssue[], llm: AuditIssue[]): AuditIssue[] {
  const seen = new Set<string>()
  const merged: AuditIssue[] = []

  const keyOf = (i: AuditIssue) => `${i.axis}|${i.location}`

  for (const i of deterministic) {
    seen.add(keyOf(i))
    merged.push(i)
  }
  for (const i of llm) {
    const k = keyOf(i)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(i)
  }
  return merged
}
