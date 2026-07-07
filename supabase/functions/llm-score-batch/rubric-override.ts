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

import { parseLlmJson } from '../_shared/llm-json.ts'
import { extractSignalText, renderSignalBlock } from '../_shared/signal-text.ts'
import { DATA_GUARD_FR, JSON_STRICT_GUARD_FR } from '../_shared/llm-guards.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Condition mécanique optionnelle d'un disqualifier — évaluée EN CODE avant
 * tout appel LLM (déterministe, gratuit — L99 A#4). Une règle déclarée
 * mécanique est entièrement consommée en code : elle disqualifie immédiatement
 * si elle matche, et n'est PAS soumise au LLM si elle ne matche pas.
 * Les règles sémantiques restent en texte libre (rule) et vont au LLM.
 */
export type MechanicalCondition =
  | { kind: 'source_in'; sources: string[] }
  | { kind: 'text_matches'; pattern: string }
  | { kind: 'older_than_days'; days: number }

export interface DisqualifierRule {
  id: string
  rule: string
  rationale: string
  mechanical?: MechanicalCondition
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
  /** Date du contenu source (signals.signal_date) — sert aux règles older_than_days. */
  signal_date?: string | null
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
  /** true si une réponse de gate était illisible (gates neutralisées). */
  gate_parse_failed?: boolean
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
      if (d.mechanical !== undefined) {
        errors.push(...validateMechanicalCondition(d.mechanical, i))
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

/** Valide la forme d'une MechanicalCondition (contrat déclaré strict). */
function validateMechanicalCondition(m: unknown, i: number): ValidationError[] {
  const bad = (msg: string): ValidationError[] => [
    { code: 'disqualifier_mechanical', message: `disqualifiers[${i}].mechanical ${msg}` },
  ]
  if (!m || typeof m !== 'object' || Array.isArray(m)) return bad('must be object')
  const c = m as Record<string, unknown>
  switch (c.kind) {
    case 'source_in':
      return Array.isArray(c.sources) &&
        c.sources.length > 0 &&
        c.sources.every((s) => typeof s === 'string' && s.length > 0)
        ? []
        : bad('sources must be a non-empty string array')
    case 'text_matches': {
      if (typeof c.pattern !== 'string' || c.pattern.length === 0) {
        return bad('pattern must be a non-empty string')
      }
      try {
        new RegExp(c.pattern, 'iu')
      } catch {
        return bad('pattern is not a valid regex')
      }
      return []
    }
    case 'older_than_days':
      return typeof c.days === 'number' && Number.isFinite(c.days) && c.days > 0
        ? []
        : bad('days must be a positive number')
    default:
      return bad(`kind unknown: ${String(c.kind)}`)
  }
}

// =============================================================================
// Pré-filtre mécanique des disqualifiers (L99 A#4)
// =============================================================================

export interface MechanicalGateResult {
  /** Id du premier disqualifier mécanique qui matche, sinon null. */
  fired_id: string | null
  /** Disqualifiers restant à évaluer par le LLM (sans condition mécanique évaluable). */
  residual: DisqualifierRule[]
}

/**
 * Évalue les conditions mécaniques déclarées, AVANT tout appel LLM.
 *
 * Prudence DÉFCON : toute condition inévaluable (regex invalide, date absente
 * ou illisible, forme inattendue) est REVERSÉE au LLM (residual) — un raté
 * coûte un appel LLM, jamais une disqualification à tort.
 * `nowMs` injectable pour les tests.
 */
export function evaluateMechanicalDisqualifiers(
  disqualifiers: DisqualifierRule[],
  signal: ScoredSignalInput,
  nowMs: number = Date.now(),
): MechanicalGateResult {
  const residual: DisqualifierRule[] = []

  for (const d of disqualifiers) {
    const m = d.mechanical
    if (!m) {
      residual.push(d)
      continue
    }
    switch (m.kind) {
      case 'source_in': {
        if (
          Array.isArray(m.sources) &&
          m.sources.some(
            (s) => typeof s === 'string' && s.toLowerCase() === signal.source.toLowerCase(),
          )
        ) {
          return { fired_id: d.id, residual: [] }
        }
        continue // condition évaluée et non matchée → règle consommée
      }
      case 'text_matches': {
        let re: RegExp
        try {
          re = new RegExp(m.pattern, 'iu')
        } catch {
          residual.push(d)
          continue
        }
        const text = `${signal.title ?? ''}\n${extractSignalText(signal.raw_payload)}`
        if (re.test(text)) return { fired_id: d.id, residual: [] }
        continue
      }
      case 'older_than_days': {
        if (typeof m.days !== 'number' || !Number.isFinite(m.days) || m.days <= 0) {
          residual.push(d)
          continue
        }
        const t = signal.signal_date ? Date.parse(signal.signal_date) : NaN
        if (Number.isNaN(t)) {
          residual.push(d)
          continue
        }
        if (nowMs - t > m.days * 86_400_000) return { fired_id: d.id, residual: [] }
        continue
      }
      default:
        residual.push(d)
    }
  }
  return { fired_id: null, residual }
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

export interface ParsedGateResponse {
  /** false = réponse LLM illisible → gates neutres PAR DÉFAUT, à tracer. */
  parse_ok?: boolean
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
    obj = parseLlmJson(raw)
  } catch {
    // Gate illisible ≠ « non disqualifié » : le caller doit pouvoir le tracer
    // (sinon faux négatifs invisibles — finding L99 C#4).
    return { disqualified_id: null, applied_boosts: [], parse_ok: false }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { disqualified_id: null, applied_boosts: [], parse_ok: false }
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

  return { disqualified_id: dqId, applied_boosts: boosts, parse_ok: true }
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
    obj = parseLlmJson(raw)
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
}): PromptPair {
  const criteriaLines = args.criteria.map(([label, weight]) => `- ${label} (poids ${weight})`)
  return {
    system: `${args.scoringPrompt}

Critères pondérés (somme = 100) :
${criteriaLines.join('\n')}

${DATA_GUARD_FR}

${JSON_STRICT_GUARD_FR}
Format attendu :
{"score": <0-100>, "reasoning": "<1-2 phrases>", "per_criterion": {"<label>": <0-100>, ...}}`,
    user: `SIGNAL À SCORER :\n${renderSignalBlockForScoring(args.signal)}`,
  }
}

/**
 * Prompt combiné disqualifier + soft_boost (1 appel LLM).
 * Utilisé si shouldCombineGates() = true.
 */
export function buildCombinedGatePrompt(args: {
  disqualifiers: DisqualifierRule[]
  softBoosts: SoftBoostRule[]
  signal: ScoredSignalInput
}): PromptPair {
  const dqLines = args.disqualifiers.map((d) => `- ${d.id} : ${d.rule}`)
  const sbLines = args.softBoosts.map((b) => `- ${b.id} (+${b.boost}) : ${b.rule}`)
  return {
    system: `Tu es un classificateur strict. Pour le signal fourni, identifie :
1. S'il matche UN disqualifier (et un seul, le plus fort) → renvoie son id ; sinon null.
2. Quels soft_boosts s'appliquent (peut être vide ou multiple).

DISQUALIFIERS (règles binaires, match → signal écarté) :
${dqLines.length > 0 ? dqLines.join('\n') : '(aucun)'}

SOFT_BOOSTS (règles binaires, match → bonus appliqué) :
${sbLines.length > 0 ? sbLines.join('\n') : '(aucun)'}

${DATA_GUARD_FR}

${JSON_STRICT_GUARD_FR}
Format attendu :
{"disqualified_id": "<id ou null>", "applied": ["<sb_id>", ...]}`,
    user: `SIGNAL :\n${renderSignalBlockForScoring(args.signal)}`,
  }
}

export function buildDisqualifierPrompt(args: {
  disqualifiers: DisqualifierRule[]
  signal: ScoredSignalInput
}): PromptPair {
  const dqLines = args.disqualifiers.map((d) => `- ${d.id} : ${d.rule}`)
  return {
    system: `Tu es un classificateur strict. Le signal fourni matche-t-il l'un des disqualifiers ?
Si oui, renvoie l'id du disqualifier le plus fort. Sinon null.

DISQUALIFIERS :
${dqLines.length > 0 ? dqLines.join('\n') : '(aucun)'}

${DATA_GUARD_FR}

${JSON_STRICT_GUARD_FR}
Format attendu :
{"disqualified_id": "<id ou null>"}`,
    user: `SIGNAL :\n${renderSignalBlockForScoring(args.signal)}`,
  }
}

export function buildSoftBoostPrompt(args: {
  softBoosts: SoftBoostRule[]
  signal: ScoredSignalInput
}): PromptPair {
  const sbLines = args.softBoosts.map((b) => `- ${b.id} (+${b.boost}) : ${b.rule}`)
  return {
    system: `Tu es un classificateur strict. Quels soft_boosts s'appliquent au signal fourni ?

SOFT_BOOSTS :
${sbLines.length > 0 ? sbLines.join('\n') : '(aucun)'}

${DATA_GUARD_FR}

${JSON_STRICT_GUARD_FR}
Format attendu :
{"applied": ["<sb_id>", ...]}`,
    user: `SIGNAL :\n${renderSignalBlockForScoring(args.signal)}`,
  }
}

/** Couple system/user produit par les builders (system = consignes + gardes). */
export interface PromptPair {
  system: string
  user: string
}

function renderSignalBlockForScoring(signal: ScoredSignalInput): string {
  return renderSignalBlock(
    {
      id: signal.id,
      source: signal.source,
      url: signal.url,
      title: signal.title,
      raw_payload: signal.raw_payload,
    },
    800,
  )
}
