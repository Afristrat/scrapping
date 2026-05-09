/**
 * rubric-override.ts — Helpers purs pour le mode rubric ad-hoc (Story Ralph K04).
 *
 * BYOK strict — aucun modèle hardcodé. Les appels LLM passent par dispatch-llm
 * (task='scoring' pour criteria, task='enrichment' pour disqualifier+boost
 * gates, qui sont des classifications binaires courtes).
 *
 * Pont entre rubric-architect (K02) et le scoring effectif sur signaux scrapés
 * (signals ou signals_session). Applique la structure 3-couches :
 *   1. DISQUALIFIERS  — match → score=0, skip étapes 2-3
 *   2. CRITERIA       — score continu 0-100 (raw_score)
 *   3. SOFT_BOOSTS    — bonus appliqué après criteria, capped à 100
 *
 * Optimisation : étapes 1+3 fusionnées en UN seul appel LLM si
 * disqualifiers.length + soft_boosts.length ≤ 12 règles. Sinon split.
 */

// =============================================================================
// Types
// =============================================================================

export interface DisqualifierRule {
  id: string
  rule: string
  rationale: string
}

export interface SoftBoostRule {
  id: string
  rule: string
  /** Boost individuel ≤ 20 (validé). */
  boost: number
  rationale: string
}

export interface CalibrationExample {
  expected_score: number
  signal_archetype: string
}

export interface RubricOverride {
  scoring_prompt: string
  /** Tuples [label, weight], somme = 100 (validé). */
  criteria: Array<[string, number]>
  disqualifiers: DisqualifierRule[]
  soft_boosts: SoftBoostRule[]
  calibration_examples?: CalibrationExample[]
}

export interface ScoredSignalInput {
  id: string
  source: string
  url?: string
  title?: string
  raw_payload?: Record<string, unknown>
  lang?: string
}

export interface ScoredSignalOutput {
  signal_id: string
  /** Score final 0-100 après boosts cappé. */
  score: number
  /** Score avant boosts (traçabilité). */
  raw_score: number
  reasoning: string
  disqualified: boolean
  applied_disqualifier: string | null
  applied_boosts: string[]
  cost: number
  model_used: string
}

export interface ValidationError {
  code: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// Seuil au-delà duquel on split disqualifier-check et soft-boost-check en
// 2 appels LLM séparés. En dessous, 1 seul appel.
export const COMBINED_RULES_THRESHOLD = 12

// =============================================================================
// Validation purs
// =============================================================================

export function validateRubricOverride(rubric: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (!rubric || typeof rubric !== 'object' || Array.isArray(rubric)) {
    return {
      valid: false,
      errors: [{ code: 'rubric_type', message: 'rubric_override must be object' }],
    }
  }
  const r = rubric as Partial<RubricOverride>

  // scoring_prompt
  if (typeof r.scoring_prompt !== 'string' || r.scoring_prompt.trim().length === 0) {
    errors.push({
      code: 'scoring_prompt_required',
      message: 'scoring_prompt must be non-empty string',
    })
  }

  // criteria — somme = 100
  if (!Array.isArray(r.criteria) || r.criteria.length === 0) {
    errors.push({
      code: 'criteria_required',
      message: 'criteria must be non-empty array of [label, weight] tuples',
    })
  } else {
    let sum = 0
    let shapeOk = true
    for (let i = 0; i < r.criteria.length; i++) {
      const c = r.criteria[i]
      if (!Array.isArray(c) || c.length !== 2) {
        errors.push({
          code: 'criterion_shape',
          message: `criteria[${i}] must be [label, weight] tuple`,
        })
        shapeOk = false
        continue
      }
      const [label, weight] = c
      if (typeof label !== 'string' || label.trim().length === 0) {
        errors.push({ code: 'criterion_label', message: `criteria[${i}] label invalid` })
        shapeOk = false
      }
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
        errors.push({
          code: 'criterion_weight',
          message: `criteria[${i}] weight must be positive number`,
        })
        shapeOk = false
        continue
      }
      sum += weight
    }
    if (shapeOk && sum !== 100) {
      errors.push({
        code: 'weight_sum',
        message: `criteria weight sum must equal 100, got ${sum}`,
      })
    }
  }

  // disqualifiers
  if (!Array.isArray(r.disqualifiers)) {
    errors.push({
      code: 'disqualifiers_type',
      message: 'disqualifiers must be array (may be empty)',
    })
  } else {
    for (let i = 0; i < r.disqualifiers.length; i++) {
      const d = r.disqualifiers[i] as Partial<DisqualifierRule>
      if (!d || typeof d !== 'object') {
        errors.push({ code: 'disqualifier_shape', message: `disqualifiers[${i}] not object` })
        continue
      }
      if (typeof d.id !== 'string' || !d.id) {
        errors.push({ code: 'disqualifier_id', message: `disqualifiers[${i}].id missing` })
      }
      if (typeof d.rule !== 'string' || d.rule.trim().length === 0) {
        errors.push({ code: 'disqualifier_rule', message: `disqualifiers[${i}].rule missing` })
      }
    }
  }

  // soft_boosts — cap individuel 20
  if (!Array.isArray(r.soft_boosts)) {
    errors.push({
      code: 'soft_boosts_type',
      message: 'soft_boosts must be array (may be empty)',
    })
  } else {
    for (let i = 0; i < r.soft_boosts.length; i++) {
      const b = r.soft_boosts[i] as Partial<SoftBoostRule>
      if (!b || typeof b !== 'object') {
        errors.push({ code: 'soft_boost_shape', message: `soft_boosts[${i}] not object` })
        continue
      }
      if (typeof b.id !== 'string' || !b.id) {
        errors.push({ code: 'soft_boost_id', message: `soft_boosts[${i}].id missing` })
      }
      if (typeof b.rule !== 'string' || b.rule.trim().length === 0) {
        errors.push({ code: 'soft_boost_rule', message: `soft_boosts[${i}].rule missing` })
      }
      if (typeof b.boost !== 'number' || !Number.isFinite(b.boost) || b.boost <= 0) {
        errors.push({
          code: 'soft_boost_value',
          message: `soft_boosts[${i}].boost must be positive number`,
        })
        continue
      }
      if (b.boost > 20) {
        errors.push({
          code: 'soft_boost_cap_individual',
          message: `soft_boosts[${i}].boost=${b.boost} exceeds individual cap of 20`,
        })
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateScoredSignalInput(input: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ code: 'signal_type', message: 'signal must be object' }],
    }
  }
  const s = input as Partial<ScoredSignalInput>
  if (typeof s.id !== 'string' || s.id.length === 0) {
    errors.push({ code: 'signal_id_required', message: 'signal.id must be non-empty string' })
  }
  if (typeof s.source !== 'string' || s.source.length === 0) {
    errors.push({ code: 'signal_source_required', message: 'signal.source must be non-empty' })
  }
  return { valid: errors.length === 0, errors }
}

// =============================================================================
// Score helpers purs
// =============================================================================

/**
 * Applique les soft_boosts à un score raw, capped à 100.
 *
 * Si un boost ferait passer le score au-dessus de 100, on cappe à 100 ; les
 * boosts suivants ne peuvent pas faire repasser le score au-dessus du cap.
 *
 * Boosts inconnus (id non trouvé dans rules) ignorés silencieusement.
 */
export function applyBoosts(
  rawScore: number,
  appliedIds: string[],
  rules: SoftBoostRule[],
): number {
  let s = rawScore
  const byId = new Map(rules.map((r) => [r.id, r]))
  for (const id of appliedIds) {
    const rule = byId.get(id)
    if (!rule) continue
    s += rule.boost
    if (s > 100) s = 100
  }
  if (s < 0) s = 0
  return Math.round(s)
}

/**
 * Combine raw_score + appliedBoosts en score final, en gérant le cas
 * disqualified (score forcé à 0).
 */
export function calculateFinalScore(args: {
  rawScore: number
  disqualified: boolean
  appliedBoosts: string[]
  rules: SoftBoostRule[]
}): number {
  if (args.disqualified) return 0
  return applyBoosts(args.rawScore, args.appliedBoosts, args.rules)
}

/**
 * Détermine si l'optimisation 1-appel-combiné est applicable
 * (disqualifier+boost dans le même appel LLM).
 */
export function shouldCombineGates(
  disqualifiers: DisqualifierRule[],
  softBoosts: SoftBoostRule[],
): boolean {
  return disqualifiers.length + softBoosts.length <= COMBINED_RULES_THRESHOLD
}

// =============================================================================
// Parse helpers (réponses LLM gates et scoring)
// =============================================================================

const MARKDOWN_FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i

function stripFence(input: string): string {
  const trimmed = input.trim()
  const m = trimmed.match(MARKDOWN_FENCE_RE)
  return (m ? m[1] : trimmed).trim()
}

function tryParseJson(raw: string): unknown {
  if (!raw) throw new Error('empty_response')
  const stripped = stripFence(raw)
  try {
    return JSON.parse(stripped)
  } catch {
    // Try to find first balanced object
    const start = stripped.indexOf('{')
    if (start === -1) throw new Error('no_json_object')
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i]
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\' && inString) {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          return JSON.parse(stripped.slice(start, i + 1))
        }
      }
    }
    throw new Error('unbalanced_json')
  }
}

export interface ParsedGateResponse {
  disqualified_id: string | null
  applied_boosts: string[]
}

/**
 * Parse une réponse LLM "gate combiné" : `{ disqualified_id, applied: [] }`.
 * Robuste aux variations de clé (applied / applied_boosts / boosts).
 *
 * Toujours retourne un résultat (ne throw jamais) — défaut conservateur :
 * disqualified_id=null, applied_boosts=[].
 */
export function parseGateResponse(raw: string): ParsedGateResponse {
  let obj: unknown
  try {
    obj = tryParseJson(raw)
  } catch {
    return { disqualified_id: null, applied_boosts: [] }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { disqualified_id: null, applied_boosts: [] }
  }
  const o = obj as Record<string, unknown>

  let dqId: string | null = null
  const dqRaw = o.disqualified_id ?? o.disqualified ?? o.dq_id
  if (typeof dqRaw === 'string' && dqRaw.length > 0 && dqRaw !== 'null') {
    dqId = dqRaw
  }

  const boostsRaw = o.applied ?? o.applied_boosts ?? o.boosts ?? o.matched_boosts
  let boosts: string[] = []
  if (Array.isArray(boostsRaw)) {
    boosts = boostsRaw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  }

  return { disqualified_id: dqId, applied_boosts: boosts }
}

export interface ParsedCriteriaResponse {
  score: number
  reasoning: string
  per_criterion?: Record<string, number>
}

/**
 * Parse une réponse LLM de scoring criteria :
 * `{ score: 0-100, reasoning: string, per_criterion?: {...} }`.
 *
 * Retourne null si pas de score numérique extractible — caller doit décider
 * de la suite (skip, retry, score=0 fallback).
 */
export function parseLLMScoreResponse(raw: string): ParsedCriteriaResponse | null {
  let obj: unknown
  try {
    obj = tryParseJson(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>

  const scoreRaw = o.score
  let score: number | null = null
  if (typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)) {
    score = scoreRaw
  } else if (typeof scoreRaw === 'string') {
    const n = Number(scoreRaw.trim())
    if (Number.isFinite(n)) score = n
  }
  if (score === null) return null
  score = Math.max(0, Math.min(100, Math.round(score)))

  const reasoning = typeof o.reasoning === 'string' ? o.reasoning.slice(0, 1000) : ''

  let perCriterion: Record<string, number> | undefined
  if (o.per_criterion && typeof o.per_criterion === 'object' && !Array.isArray(o.per_criterion)) {
    perCriterion = {}
    for (const [k, v] of Object.entries(o.per_criterion as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        perCriterion[k] = Math.round(v)
      } else if (typeof v === 'string') {
        const n = Number(v.trim())
        if (Number.isFinite(n)) perCriterion[k] = Math.round(n)
      }
    }
  }

  return { score, reasoning, per_criterion: perCriterion }
}

// =============================================================================
// Prompt builders (purs, testables)
// =============================================================================

/**
 * Construit le prompt pour scoring criteria — utilise scoring_prompt fourni
 * + récap criteria + signal courant.
 */
export function buildCriteriaPrompt(args: {
  scoringPrompt: string
  criteria: Array<[string, number]>
  signal: ScoredSignalInput
}): string {
  const criteriaLines = args.criteria.map(([label, weight]) => `- ${label} (poids ${weight})`)
  const summary = extractSignalSummary(args.signal)
  return `${args.scoringPrompt}

Critères pondérés (somme = 100) :
${criteriaLines.join('\n')}

SIGNAL À SCORER :
id=${args.signal.id}
source=${args.signal.source}${args.signal.url ? `\nurl=${args.signal.url}` : ''}
title=${args.signal.title ?? '(sans titre)'}
extrait=${summary}

Réponds UNIQUEMENT en JSON strict :
{"score": <0-100>, "reasoning": "<1-2 phrases>", "per_criterion": {"<label>": <0-100>, ...}}`
}

/**
 * Prompt combiné disqualifier + soft_boost (1 appel LLM).
 * Utilisé si shouldCombineGates() = true.
 */
export function buildCombinedGatePrompt(args: {
  disqualifiers: DisqualifierRule[]
  softBoosts: SoftBoostRule[]
  signal: ScoredSignalInput
}): string {
  const dqLines = args.disqualifiers.map((d) => `- ${d.id} : ${d.rule}`)
  const sbLines = args.softBoosts.map((b) => `- ${b.id} (+${b.boost}) : ${b.rule}`)
  const summary = extractSignalSummary(args.signal)
  return `Tu es un classificateur strict. Pour le signal ci-dessous, identifie :
1. Si le signal matche UN disqualifier (et un seul, le plus fort) → renvoie son id ; sinon null.
2. Quels soft_boosts s'appliquent (peut être vide ou multiple).

DISQUALIFIERS (règles binaires, match → signal écarté) :
${dqLines.length > 0 ? dqLines.join('\n') : '(aucun)'}

SOFT_BOOSTS (règles binaires, match → bonus appliqué) :
${sbLines.length > 0 ? sbLines.join('\n') : '(aucun)'}

SIGNAL :
id=${args.signal.id}
source=${args.signal.source}${args.signal.url ? `\nurl=${args.signal.url}` : ''}
title=${args.signal.title ?? '(sans titre)'}
extrait=${summary}

Réponds UNIQUEMENT en JSON strict :
{"disqualified_id": "<id ou null>", "applied": ["<sb_id>", ...]}`
}

export function buildDisqualifierPrompt(args: {
  disqualifiers: DisqualifierRule[]
  signal: ScoredSignalInput
}): string {
  const dqLines = args.disqualifiers.map((d) => `- ${d.id} : ${d.rule}`)
  const summary = extractSignalSummary(args.signal)
  return `Tu es un classificateur strict. Le signal ci-dessous matche-t-il l'un des disqualifiers ?
Si oui, renvoie l'id du disqualifier le plus fort. Sinon null.

DISQUALIFIERS :
${dqLines.length > 0 ? dqLines.join('\n') : '(aucun)'}

SIGNAL :
id=${args.signal.id}
source=${args.signal.source}${args.signal.url ? `\nurl=${args.signal.url}` : ''}
title=${args.signal.title ?? '(sans titre)'}
extrait=${summary}

Réponds UNIQUEMENT en JSON strict :
{"disqualified_id": "<id ou null>"}`
}

export function buildSoftBoostPrompt(args: {
  softBoosts: SoftBoostRule[]
  signal: ScoredSignalInput
}): string {
  const sbLines = args.softBoosts.map((b) => `- ${b.id} (+${b.boost}) : ${b.rule}`)
  const summary = extractSignalSummary(args.signal)
  return `Tu es un classificateur strict. Quels soft_boosts s'appliquent au signal ci-dessous ?

SOFT_BOOSTS :
${sbLines.length > 0 ? sbLines.join('\n') : '(aucun)'}

SIGNAL :
id=${args.signal.id}
source=${args.signal.source}${args.signal.url ? `\nurl=${args.signal.url}` : ''}
title=${args.signal.title ?? '(sans titre)'}
extrait=${summary}

Réponds UNIQUEMENT en JSON strict :
{"applied": ["<sb_id>", ...]}`
}

function extractSignalSummary(signal: ScoredSignalInput): string {
  const p = signal.raw_payload ?? {}
  const summary =
    (typeof p.summary === 'string' && p.summary) ||
    (typeof p.selftext === 'string' && p.selftext) ||
    (typeof p.text === 'string' && p.text) ||
    (typeof p.description === 'string' && p.description) ||
    ''
  return String(summary).slice(0, 800)
}
