// BYOK strict — no model imposed.
//
// rubric-architect — Edge function Kairos (Story Ralph K02).
//
// Génère une rubric de scoring TROIS-COUCHES pour évaluer la pertinence
// de signaux d'actualité par rapport à une graine de réalité ET sa
// research_strategy (output Prompt 1).
//
// Couches :
//   1. CRITERIA — pondération additive (somme = 100). Score continu.
//   2. DISQUALIFIERS — règles binaires. Match → score = 0.
//   3. SOFT_BOOSTS — bonus appliqués APRÈS criteria, capped (≤ 20 chacun, total < 50).
//
// Spec : docs/kairos-bassira-research-prompts.md — section "PROMPT 2 — rubric-architect".
// Aucune persistance. Aucun cache. Aucun modèle hardcodé : task='enrichment'.
//
// Inputs : { seed: string, lang: 'fr'|'en'|'ar', research_strategy: object }
// Outputs : 200 { rubric, telemetry } | 502 dispatch fail | 422 schema fail après retry

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deepSanitizeJson } from '../_shared/unicode.ts'
import { resolveAuthOrProxy } from '../_shared/service-role-auth.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// =============================================================================
// Types
// =============================================================================

export type Lang = 'fr' | 'en' | 'ar'

export interface RequestBody {
  seed: string
  lang: Lang
  research_strategy: Record<string, unknown>
}

export interface CriterionTuple {
  0: string
  1: number
  length: 2
}

export interface Disqualifier {
  id: string
  rule: string
  rationale: string
}

export interface SoftBoost {
  id: string
  rule: string
  boost: number
  rationale: string
}

export interface CalibrationExample {
  expected_score: number
  signal_archetype: string
}

export interface Rubric {
  scoring_prompt: string
  criteria: Array<[string, number]>
  disqualifiers: Disqualifier[]
  soft_boosts: SoftBoost[]
  calibration_examples: CalibrationExample[]
}

export interface ValidationError {
  code: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

interface DispatchResponse {
  ok: boolean
  error?: string
  detail?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
  provider_used?: string
}

const VALID_LANGS: ReadonlySet<Lang> = new Set(['fr', 'en', 'ar'])

// =============================================================================
// System prompt builder (spec docs/kairos-bassira-research-prompts.md PROMPT 2)
// =============================================================================

export function buildSystemPrompt(lang: Lang): string {
  const langInstruction =
    lang === 'fr'
      ? 'Langue de sortie : français. Accents OBLIGATOIRES partout y compris sur les MAJUSCULES (É, È, À, Ç, Ê, Ô, Î, Ù, Û).'
      : lang === 'ar'
        ? 'Langue de sortie : arabe. Respect RTL. Pas de mélange LTR sauf acronymes/URLs.'
        : 'Output language: English.'

  return `Tu génères une rubric de scoring TROIS-COUCHES pour évaluer la pertinence
de signaux d'actualité par rapport à une graine de réalité ET sa
research_strategy (output Prompt 1).

LES TROIS COUCHES :

1. CRITERIA — pondération additive (somme = 100). Score continu sur chaque
   critère, agrégé.

2. DISQUALIFIERS — règles binaires. Un signal qui matche un disqualifier
   est SCORE = 0 immédiatement, indépendamment des criteria. Exemples :
   "promotionnel pur sans fait", "opinion sans source", "horoscope/buzz",
   "off-topic géographique total".

3. SOFT_BOOSTS — bonus appliqués APRÈS calcul criteria, capped. Exemples :
   "+15 si signal contredit la lecture dominante", "+10 si signal en
   langue minoritaire du dossier (ex: AR pour un sujet MENA)", "+5 si
   source primaire (acteur lui-même) vs commentateur".

POURQUOI CETTE STRUCTURE :
- Criteria seuls produisent un mid-tier confortable mais pas
  actionnable. Les disqualifiers nettoient le bruit. Les soft_boosts
  remontent les signaux à valeur surprise (counter-narrative,
  multilingue, primaire) qui sont les plus utiles à la simulation
  prospective en aval.

RÈGLES :
- ${langInstruction}
- 4-8 criteria adaptatifs (selon complexité de la graine). Somme = 100
  exactement. Hiérarchie visible (au moins un poids ≥ 25, au moins un ≤ 10).
- 3-6 disqualifiers. Formuler en règles testables par un LLM rapide
  ("le signal est-il purement promotionnel sans donnée?").
- 2-5 soft_boosts. Plafonner chaque à +20 max, total < +50.
- INTERDIT : critères vagues ("intérêt", "qualité"), critères qui se
  chevauchent ("pertinence" et "rapport au sujet"), pondération
  uniforme.
- Le scoring_prompt (CRITIQUE — rejet automatique si non respecté) :
  * Borne stricte : 200-500 mots (séparés par des espaces).
  * Vise ≈ 320-450 mots pour rester confortablement dans la fourchette —
    JAMAIS sous 200 mots.
  * Compte mentalement tes mots avant de fermer le champ "scoring_prompt".
    Si < 220 mots, AJOUTE : (a) une explication détaillée d'un disqualifier
    supplémentaire, (b) un exemple calibré additionnel, ou (c) une nuance
    sur la pondération d'un criterion. Ne raccourcis JAMAIS sous prétexte
    de concision — la longueur sert au LLM scoreur en aval.
  * Doit RÉCAPITULER les 3 couches (criteria, disqualifiers, soft_boosts)
    pour le LLM scoreur, et donner 2-3 exemples calibrés (un signal qui
    mérite 80+, un autour de 40, un autour de 10).

INTERDICTIONS :
- Pas de balise <tool_call>, <thinking>, <scratchpad>, ni markdown,
  ni préambule, ni justification hors-JSON.
- Pas de critère inventé sans rapport avec la research_strategy.
- Pas de pondération uniforme (tous égaux).
- Pas de boost > 20.
- Pas de soft_boosts dont la somme atteint ou dépasse 50.

SCHEMA OUTPUT (JSON STRICT, AUCUN CHAMP SUPPLÉMENTAIRE) :
{
  "scoring_prompt": "string 200-500 mots — instructions au scoreur",
  "criteria": [
    ["label_court", weight_int],
    ...
  ],
  "disqualifiers": [
    { "id": "dq_001", "rule": "string règle testable", "rationale": "string courte" }
  ],
  "soft_boosts": [
    { "id": "sb_001", "rule": "string règle", "boost": int, "rationale": "string courte" }
  ],
  "calibration_examples": [
    { "expected_score": 85, "signal_archetype": "string description signal haut" },
    { "expected_score": 45, "signal_archetype": "string description signal moyen" },
    { "expected_score": 10, "signal_archetype": "string description signal bas" }
  ]
}

SOMME DES weight DOIT FAIRE EXACTEMENT 100. Validé en post-process,
sinon retry du prompt.`
}

export function buildUserPrompt(
  seed: string,
  lang: Lang,
  research_strategy: Record<string, unknown>,
): string {
  // Sanitize control chars in seed to prevent prompt-injection-via-graine.
  const cleanSeed = seed.replace(/[\x00-\x1F\x7F]+/g, ' ').trim()
  return `Graine : ${cleanSeed}

Lang de sortie demandée : ${lang}

research_strategy (output Prompt 1) :
${JSON.stringify(research_strategy, null, 2)}

Génère la rubric en JSON strict suivant le SCHEMA OUTPUT.`
}

// =============================================================================
// Sanitization — purge balises résiduelles tool_call/thinking/scratchpad.
// =============================================================================

// Strip both the opening/closing tags AND their content. A model may emit
// <thinking>let me think</thinking> alongside the JSON output; we must not
// leave the inner reasoning text floating in the parsed output.
const FORBIDDEN_TAG_BLOCKS =
  /<(tool_call|thinking|scratchpad|reasoning|reflection)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const FORBIDDEN_TAG_OPEN_OR_SELF =
  /<\/?(tool_call|thinking|scratchpad|reasoning|reflection)\b[^>]*\/?>/gi

export function sanitizeLlmOutput(raw: string): string {
  // Pass 1 — drop balanced tag blocks with their content.
  let cleaned = raw.replace(FORBIDDEN_TAG_BLOCKS, '')
  // Pass 2 — drop residual unbalanced tags (model may emit only an opener).
  cleaned = cleaned.replace(FORBIDDEN_TAG_OPEN_OR_SELF, '')
  // Strip BOM + zero-width separators.
  cleaned = cleaned.replace(/^﻿/, '').replace(/[​-‍﻿]/g, '')
  // Strip code fences if model wrapped JSON in ```json ... ```
  cleaned = cleaned.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  return cleaned.trim()
}

/**
 * Tolerant JSON parse on sanitized LLM output. Two extra passes after
 * the first strict attempt failed :
 *   1. slice to outermost { … } block (drops prose preamble / suffix)
 *   2. repair trailing commas before `}` and `]` (most common LLM bug)
 *
 * Returns null when none of the 3 attempts produce valid JSON. Aligned
 * with the pattern shipped in signal-synthesizer's `safeJsonParse`
 * (cf. hotfix #1 K05+K06 2026-05-13).
 */
export function tolerantJsonParse(sanitized: string): unknown | null {
  if (!sanitized) return null
  // Strict
  try {
    return JSON.parse(sanitized)
  } catch (_) {
    // fall through
  }
  // Slice outermost { … }
  let candidate = sanitized
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace > 0 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1)
  }
  try {
    return JSON.parse(candidate)
  } catch (_) {
    // fall through
  }
  // Repair trailing commas
  const repaired = candidate.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(repaired)
  } catch (_) {
    return null
  }
}

// =============================================================================
// Schema validators (purs, testables)
// =============================================================================

/**
 * Auto-normalise la somme des weights à 100 si elle est dans une marge
 * raisonnable [50, 200] mais ≠ 100. Hotfix 2026-05-14 : DeepSeek-v4-flash
 * échoue régulièrement l'arithmétique exacte sum=100 sur graines complexes
 * (cf. session f82084e4 : sum=110). Plutôt que de retry au LLM, on
 * normalise côté serveur de manière déterministe.
 *
 * Mute le tableau en place. Conserve les entiers > 0 et redistribue
 * l'écart d'arrondi sur le criterion avec le plus gros poids.
 *
 * Si la somme initiale est hors [50, 200] ou si le tableau est mal formé,
 * la fonction ne touche à rien — la validation normale signalera l'erreur.
 */
export function normalizeCriteriaWeights(criteria: unknown): void {
  if (!Array.isArray(criteria) || criteria.length === 0) return

  // On exige que CHAQUE entrée soit un tuple [string, number-positive-int].
  let sum = 0
  for (const c of criteria) {
    if (!Array.isArray(c) || c.length !== 2) return
    const w = c[1]
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) return
    sum += w
  }

  if (sum === 100) return // rien à faire
  if (sum < 50 || sum > 200) return // trop loin, on laisse fail

  // Scale proportionnel + round.
  const scale = 100 / sum
  let total = 0
  let maxIdx = 0
  let maxVal = -Infinity
  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i] as [string, number]
    let nw = Math.round(c[1] * scale)
    if (nw < 1) nw = 1 // garde l'invariant > 0
    c[1] = nw
    total += nw
    if (nw > maxVal) {
      maxVal = nw
      maxIdx = i
    }
  }

  // Absorbe le résidu d'arrondi sur le plus gros critère.
  const delta = 100 - total
  if (delta !== 0) {
    const c = criteria[maxIdx] as [string, number]
    const adjusted = c[1] + delta
    if (adjusted > 0) {
      c[1] = adjusted
    }
  }
}

/**
 * Auto-clip le nombre de criteria à [4, 8] quand le LLM en produit plus.
 *
 * Hotfix 2026-05-17 (defense in depth) : DeepSeek-v4-flash peut produire 10+
 * criteria sur graines politico-sociales très riches. Plutôt que de fail le
 * schema, on garde les 8 critères les plus pondérés (les plus discriminants
 * pour le scoring downstream) et on laisse normalizeCriteriaWeights renormaliser
 * la somme à 100.
 *
 * Si la longueur initiale est < 4, on laisse passer pour que la validation
 * normale signale l'erreur — on ne peut pas inventer des criteria sans contexte.
 *
 * Mute le tableau en place. Retourne true si une transformation a été appliquée.
 */
export function normalizeCriteriaCount(rubric: Partial<Rubric>): boolean {
  if (!Array.isArray(rubric.criteria)) return false
  // Filtre les entrées mal formées AVANT de compter — sinon on garderait du bruit.
  const valid = rubric.criteria.filter(
    (c): c is [string, number] =>
      Array.isArray(c) &&
      c.length === 2 &&
      typeof c[0] === 'string' &&
      c[0].trim().length > 0 &&
      typeof c[1] === 'number' &&
      Number.isFinite(c[1]) &&
      c[1] > 0,
  )

  const originalLength = rubric.criteria.length
  if (valid.length > 8) {
    // Sort by weight desc — garde les criteria avec le plus de poids.
    valid.sort((a, b) => b[1] - a[1])
    rubric.criteria = valid.slice(0, 8)
    return true
  }
  if (valid.length !== originalLength) {
    // Du bruit a été filtré.
    rubric.criteria = valid
    return true
  }
  return false
}

export function validateWeightSum(criteria: Array<[string, number]>): ValidationResult {
  const errors: ValidationError[] = []
  if (!Array.isArray(criteria) || criteria.length < 4 || criteria.length > 8) {
    errors.push({
      code: 'criteria_length',
      message: `criteria array length must be 4-8, got ${
        Array.isArray(criteria) ? criteria.length : 'non-array'
      }`,
    })
  }
  if (!Array.isArray(criteria)) return { valid: false, errors }

  let sum = 0
  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i]
    if (!Array.isArray(c) || c.length !== 2) {
      errors.push({
        code: 'criterion_shape',
        message: `criteria[${i}] must be [label, weight] tuple`,
      })
      continue
    }
    const [label, weight] = c
    if (typeof label !== 'string' || label.trim().length === 0) {
      errors.push({
        code: 'criterion_label',
        message: `criteria[${i}] label invalid`,
      })
    }
    if (typeof weight !== 'number' || !Number.isInteger(weight) || weight <= 0) {
      errors.push({
        code: 'criterion_weight',
        message: `criteria[${i}] weight must be positive integer, got ${weight}`,
      })
      continue
    }
    sum += weight
  }

  if (sum !== 100) {
    errors.push({
      code: 'weight_sum',
      message: `Sum criteria weights MUST equal 100, was ${sum}`,
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Auto-clip disqualifiers à [3, 6]. Filtre les entrées mal formées + cap à 6
 * en gardant les premiers (LLM les émet généralement par ordre de priorité).
 *
 * Si la longueur valide est < 3, ne touche pas — pas récupérable sans
 * contexte. Hotfix 2026-05-17.
 *
 * Retourne true si une transformation a été appliquée.
 */
export function normalizeDisqualifiersCount(rubric: Partial<Rubric>): boolean {
  if (!Array.isArray(rubric.disqualifiers)) return false
  const original = rubric.disqualifiers
  const valid = original.filter(
    (d: unknown): d is Disqualifier =>
      !!d &&
      typeof d === 'object' &&
      typeof (d as Disqualifier).id === 'string' &&
      (d as Disqualifier).id.length > 0 &&
      typeof (d as Disqualifier).rule === 'string' &&
      (d as Disqualifier).rule.trim().length >= 5 &&
      typeof (d as Disqualifier).rationale === 'string' &&
      (d as Disqualifier).rationale.trim().length >= 3,
  )

  if (valid.length > 6) {
    rubric.disqualifiers = valid.slice(0, 6)
    return true
  }
  if (valid.length !== original.length) {
    rubric.disqualifiers = valid
    return true
  }
  return false
}

export function validateDisqualifiers(disqualifiers: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (!Array.isArray(disqualifiers)) {
    errors.push({
      code: 'disqualifiers_type',
      message: 'disqualifiers must be array',
    })
    return { valid: false, errors }
  }
  if (disqualifiers.length < 3 || disqualifiers.length > 6) {
    errors.push({
      code: 'disqualifiers_length',
      message: `disqualifiers length must be 3-6, got ${disqualifiers.length}`,
    })
  }
  for (let i = 0; i < disqualifiers.length; i++) {
    const d = disqualifiers[i] as Partial<Disqualifier>
    if (!d || typeof d !== 'object') {
      errors.push({
        code: 'disqualifier_shape',
        message: `disqualifiers[${i}] not object`,
      })
      continue
    }
    if (typeof d.id !== 'string' || !d.id) {
      errors.push({
        code: 'disqualifier_id',
        message: `disqualifiers[${i}].id missing`,
      })
    }
    if (typeof d.rule !== 'string' || d.rule.trim().length < 5) {
      errors.push({
        code: 'disqualifier_rule',
        message: `disqualifiers[${i}].rule too short or missing`,
      })
    }
    if (typeof d.rationale !== 'string' || d.rationale.trim().length < 3) {
      errors.push({
        code: 'disqualifier_rationale',
        message: `disqualifiers[${i}].rationale too short or missing`,
      })
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Auto-normalise soft_boosts :
 *   - filtre les entrées mal formées
 *   - cap chaque boost individuel à 20 (au lieu de fail)
 *   - garde max 5 boosts (sort par boost desc pour prioriser les plus impactants)
 *   - si total ≥ 50, scale-down proportionnel pour viser total = 48
 *
 * Si la longueur valide est < 2, ne touche pas. Hotfix 2026-05-17.
 *
 * Retourne true si une transformation a été appliquée.
 */
export function normalizeSoftBoosts(rubric: Partial<Rubric>): boolean {
  if (!Array.isArray(rubric.soft_boosts)) return false
  const original = rubric.soft_boosts
  const valid = original.filter(
    (b: unknown): b is SoftBoost =>
      !!b &&
      typeof b === 'object' &&
      typeof (b as SoftBoost).id === 'string' &&
      (b as SoftBoost).id.length > 0 &&
      typeof (b as SoftBoost).rule === 'string' &&
      (b as SoftBoost).rule.trim().length >= 5 &&
      typeof (b as SoftBoost).boost === 'number' &&
      Number.isFinite((b as SoftBoost).boost) &&
      (b as SoftBoost).boost > 0 &&
      typeof (b as SoftBoost).rationale === 'string' &&
      (b as SoftBoost).rationale.trim().length >= 3,
  ) as SoftBoost[]

  let mutated = valid.length !== original.length

  // Cap individuel à 20.
  for (const b of valid) {
    if (b.boost > 20) {
      b.boost = 20
      mutated = true
    }
    // Floor & integer cast pour rester sur des entiers (validator exige int).
    if (!Number.isInteger(b.boost)) {
      b.boost = Math.max(1, Math.floor(b.boost))
      mutated = true
    }
  }

  // Garde 5 max, prioriser les boosts plus impactants.
  let trimmed = valid
  if (valid.length > 5) {
    trimmed = [...valid].sort((a, b) => b.boost - a.boost).slice(0, 5)
    mutated = true
  }

  // Cap total : strict < 50 (validator).
  let total = trimmed.reduce((s, b) => s + b.boost, 0)
  if (total >= 50) {
    // Scale-down proportionnel pour viser 48.
    const target = 48
    const scale = target / total
    for (const b of trimmed) {
      const scaled = Math.max(1, Math.floor(b.boost * scale))
      if (scaled !== b.boost) {
        b.boost = scaled
        mutated = true
      }
    }
    // Recheck — arrondis peuvent encore donner total ≥ 50.
    total = trimmed.reduce((s, b) => s + b.boost, 0)
    if (total >= 50) {
      // Réduction itérative depuis les boosts les plus hauts.
      const sorted = [...trimmed].sort((a, b) => b.boost - a.boost)
      let i = 0
      let safety = 100
      while (total >= 50 && safety > 0) {
        if (sorted[i].boost > 1) {
          sorted[i].boost -= 1
          total -= 1
          mutated = true
        }
        i = (i + 1) % sorted.length
        safety--
      }
    }
  }

  if (mutated) {
    rubric.soft_boosts = trimmed
  }
  return mutated
}

export function validateSoftBoosts(soft_boosts: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (!Array.isArray(soft_boosts)) {
    errors.push({
      code: 'soft_boosts_type',
      message: 'soft_boosts must be array',
    })
    return { valid: false, errors }
  }
  if (soft_boosts.length < 2 || soft_boosts.length > 5) {
    errors.push({
      code: 'soft_boosts_length',
      message: `soft_boosts length must be 2-5, got ${soft_boosts.length}`,
    })
  }
  let total = 0
  for (let i = 0; i < soft_boosts.length; i++) {
    const b = soft_boosts[i] as Partial<SoftBoost>
    if (!b || typeof b !== 'object') {
      errors.push({
        code: 'soft_boost_shape',
        message: `soft_boosts[${i}] not object`,
      })
      continue
    }
    if (typeof b.id !== 'string' || !b.id) {
      errors.push({
        code: 'soft_boost_id',
        message: `soft_boosts[${i}].id missing`,
      })
    }
    if (typeof b.rule !== 'string' || b.rule.trim().length < 5) {
      errors.push({
        code: 'soft_boost_rule',
        message: `soft_boosts[${i}].rule missing/short`,
      })
    }
    if (typeof b.boost !== 'number' || !Number.isInteger(b.boost) || b.boost <= 0) {
      errors.push({
        code: 'soft_boost_value',
        message: `soft_boosts[${i}].boost must be positive integer`,
      })
      continue
    }
    if (b.boost > 20) {
      errors.push({
        code: 'soft_boost_cap_individual',
        message: `soft_boosts[${i}].boost=${b.boost} exceeds individual cap of 20`,
      })
    }
    total += b.boost
    if (typeof b.rationale !== 'string' || b.rationale.trim().length < 3) {
      errors.push({
        code: 'soft_boost_rationale',
        message: `soft_boosts[${i}].rationale missing/short`,
      })
    }
  }
  if (total >= 50) {
    errors.push({
      code: 'soft_boost_cap_total',
      message: `soft_boosts total=${total} must be strictly < 50`,
    })
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Auto-normalise calibration_examples :
 *   - filtre les entrées mal formées (score hors [0,100], archetype trop court)
 *   - si > 3 examples : garde min/median/max pour préserver la diversité tier
 *   - si < 3 : ne touche pas, laisse fail (pas inventable sans contexte)
 *
 * Hotfix 2026-05-17. Retourne true si une transformation a été appliquée.
 */
export function normalizeCalibrationExamples(rubric: Partial<Rubric>): boolean {
  if (!Array.isArray(rubric.calibration_examples)) return false
  const original = rubric.calibration_examples
  const valid = original.filter(
    (e: unknown): e is CalibrationExample =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as CalibrationExample).expected_score === 'number' &&
      (e as CalibrationExample).expected_score >= 0 &&
      (e as CalibrationExample).expected_score <= 100 &&
      typeof (e as CalibrationExample).signal_archetype === 'string' &&
      (e as CalibrationExample).signal_archetype.trim().length >= 10,
  )

  if (valid.length === original.length && valid.length === 3) return false

  if (valid.length > 3) {
    // Garde tier diversity : score le plus bas, le plus haut, et le median.
    valid.sort((a, b) => a.expected_score - b.expected_score)
    const low = valid[0]
    const high = valid[valid.length - 1]
    const mid = valid[Math.floor(valid.length / 2)]
    rubric.calibration_examples = [low, mid, high]
    return true
  }

  if (valid.length !== original.length) {
    rubric.calibration_examples = valid
    return true
  }
  return false
}

export function validateCalibrationExamples(examples: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (!Array.isArray(examples)) {
    errors.push({
      code: 'calibration_type',
      message: 'calibration_examples must be array',
    })
    return { valid: false, errors }
  }
  if (examples.length !== 3) {
    errors.push({
      code: 'calibration_length',
      message: `calibration_examples length must be exactly 3, got ${examples.length}`,
    })
  }
  for (let i = 0; i < examples.length; i++) {
    const e = examples[i] as Partial<CalibrationExample>
    if (!e || typeof e !== 'object') {
      errors.push({
        code: 'calibration_shape',
        message: `calibration_examples[${i}] not object`,
      })
      continue
    }
    if (typeof e.expected_score !== 'number' || e.expected_score < 0 || e.expected_score > 100) {
      errors.push({
        code: 'calibration_score',
        message: `calibration_examples[${i}].expected_score must be 0-100`,
      })
    }
    if (typeof e.signal_archetype !== 'string' || e.signal_archetype.trim().length < 10) {
      errors.push({
        code: 'calibration_archetype',
        message: `calibration_examples[${i}].signal_archetype too short or missing`,
      })
    }
  }

  // Tier check (one high ~70+, one mid ~30-60, one low ~25-).
  // Be permissive: spec says "un haut ~85, un mid ~45, un bas ~10" — accept ranges.
  if (examples.length === 3 && errors.length === 0) {
    const scores = (examples as CalibrationExample[])
      .map((e) => e.expected_score)
      .slice()
      .sort((a, b) => a - b)
    const [low, mid, high] = scores
    if (low > 25) {
      errors.push({
        code: 'calibration_tier_low',
        message: `lowest calibration score=${low} should be ≤ 25 (bas tier)`,
      })
    }
    if (mid < 25 || mid > 70) {
      errors.push({
        code: 'calibration_tier_mid',
        message: `mid calibration score=${mid} should be 25-70`,
      })
    }
    if (high < 70) {
      errors.push({
        code: 'calibration_tier_high',
        message: `highest calibration score=${high} should be ≥ 70 (haut tier)`,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Auto-normalise la longueur du scoring_prompt à [200, 500] mots.
 *
 * Hotfix 2026-05-17 (root cause de la session fec78bae) : DeepSeek-v4-flash
 * sur task=enrichment hallucine régulièrement la longueur cible et produit
 * des scoring_prompts de 20-50 mots malgré l'instruction explicite et le
 * retry avec correction. Le retry LLM coûte 30-40s et ne corrige pas le bug
 * de manière fiable.
 *
 * Stratégie déterministe :
 *   - si > 500 mots : truncate à 450 mots (garde le début, plus pertinent)
 *   - si < 200 mots : pad à partir du contenu déjà présent dans la rubric
 *     (criteria + disqualifiers + soft_boosts + calibration_examples), ce qui
 *     produit naturellement un texte de 250-450 mots couvrant exactement
 *     les instructions dont le scoreur a besoin
 *
 * Aligné philosophiquement avec normalizeCriteriaWeights : on ne re-prompt
 * pas le LLM pour corriger une mauvaise arithmétique / une longueur, on
 * corrige côté serveur de manière déterministe et auditable.
 *
 * PRÉREQUIS : doit être appelé APRÈS les autres normalizers, car son
 * algorithme utilise rubric.criteria/disqualifiers/soft_boosts/calibration_examples
 * comme matière première pour la génération du complément.
 *
 * Mute en place. Retourne true si une transformation a été appliquée.
 */
export function normalizeScoringPromptLength(rubric: Partial<Rubric>): boolean {
  if (typeof rubric.scoring_prompt !== 'string') return false
  const current = rubric.scoring_prompt.trim()
  if (current.length === 0) return false

  const wordCount = (s: string): number => s.split(/\s+/).filter((w) => w.length > 0).length
  const initial = wordCount(current)
  if (initial >= 200 && initial <= 500) return false

  if (initial > 500) {
    // Truncate proprement à 450 mots — le début d'un scoring_prompt est plus
    // important que la fin (résumé de la rubric en tête, exemples en queue).
    const words = current.split(/\s+/).filter((w) => w.length > 0)
    rubric.scoring_prompt = `${words.slice(0, 450).join(' ')}…`
    return true
  }

  // initial < 200 : on pad à partir des autres champs de la rubric.
  const parts: string[] = [current]

  if (Array.isArray(rubric.criteria) && rubric.criteria.length > 0) {
    parts.push('\nRappel des critères pondérés (somme = 100) :')
    for (const c of rubric.criteria) {
      if (Array.isArray(c) && c.length === 2) {
        parts.push(
          `- ${c[0]} (poids ${c[1]}/100) : évalue ce critère de manière indépendante des autres, ` +
            `en t'appuyant sur des éléments concrets et observables du signal.`,
        )
      }
    }
  }

  if (Array.isArray(rubric.disqualifiers) && rubric.disqualifiers.length > 0) {
    parts.push("\nRègles de disqualification (signal noté 0 si l'une matche) :")
    for (const d of rubric.disqualifiers as Disqualifier[]) {
      if (typeof d?.rule === 'string') {
        parts.push(`- ${d.id}: ${d.rule.trim()} — ${d.rationale ?? 'pas de rationale fourni'}.`)
      }
    }
  }

  if (Array.isArray(rubric.soft_boosts) && rubric.soft_boosts.length > 0) {
    parts.push('\nSoft boosts (bonus additif après les critères, plafond +20 chacun, total < 50) :')
    for (const b of rubric.soft_boosts as SoftBoost[]) {
      if (typeof b?.rule === 'string') {
        parts.push(
          `- ${b.id}: ${b.rule.trim()} (boost +${b.boost ?? '?'}) — ${b.rationale ?? 'pas de rationale fourni'}.`,
        )
      }
    }
  }

  if (Array.isArray(rubric.calibration_examples) && rubric.calibration_examples.length > 0) {
    parts.push('\nExemples calibrés (ajuste ton scoring sur ces archétypes) :')
    for (const e of rubric.calibration_examples as CalibrationExample[]) {
      if (typeof e?.signal_archetype === 'string') {
        parts.push(`- Score attendu ~${e.expected_score} : ${e.signal_archetype.trim()}`)
      }
    }
  }

  parts.push(
    '\nFormat de réponse exigé : JSON strict { "score": entier 0-100, "reasoning": "1-2 phrases courtes citant le critère ou disqualifier décisif" }. ' +
      'Ne mentionne pas la rubric dans le reasoning, justifie par le contenu du signal. ' +
      'Si un disqualifier matche, retourne score=0 et cite son id. ' +
      "Si un soft_boost s'applique, ajoute son rationale au reasoning. " +
      'Sois objectif, méthodique, et privilégie le factuel sourcé.',
  )

  let result = parts.join('\n')
  let padded = wordCount(result)

  // Si la rubric est minimale (peu de criteria, peu de disqualifiers), le pad
  // peut encore être sous 200 mots. On rallonge avec une instruction générique.
  const filler =
    ' Lorsque le signal est ambigu, hésite plutôt vers le bas pour ne pas surévaluer le bruit. ' +
    'Lorsque le signal contredit la lecture dominante, ne le pénalise jamais pour cette raison — ' +
    'le contradicteur a une valeur prospective particulière. Vérifie systématiquement la date, ' +
    'la source primaire ou secondaire, et la dimension géographique avant de finaliser le score.'

  let safety = 10
  while (padded < 220 && safety > 0) {
    result += filler
    padded = wordCount(result)
    safety--
  }

  // Si on a fait exploser au-delà de 500 par le pad, on tronque proprement.
  if (padded > 500) {
    const words = result.split(/\s+/).filter((w) => w.length > 0)
    result = `${words.slice(0, 450).join(' ')}…`
  }

  rubric.scoring_prompt = result.trim()
  return true
}

export function validateScoringPrompt(scoring_prompt: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (typeof scoring_prompt !== 'string') {
    errors.push({
      code: 'scoring_prompt_type',
      message: 'scoring_prompt must be string',
    })
    return { valid: false, errors }
  }
  // Word count: split on whitespace, filter empties.
  const words = scoring_prompt
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
  if (words.length < 200 || words.length > 500) {
    errors.push({
      code: 'scoring_prompt_length',
      message: `scoring_prompt word count must be 200-500, got ${words.length}`,
    })
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Liste des normalisations appliquées lors de la validation (cf. validateRubricSchema).
 * Émis en telemetry pour audit/observabilité — pas de re-prompt LLM masqué.
 */
export interface NormalizationLog {
  criteria_count_clipped?: boolean
  criteria_weights_normalized?: boolean
  disqualifiers_count_clipped?: boolean
  soft_boosts_normalized?: boolean
  calibration_normalized?: boolean
  scoring_prompt_length_normalized?: boolean
}

export interface ValidationResultWithNormalizations extends ValidationResult {
  normalizations: NormalizationLog
}

export function validateRubricSchema(rubric: unknown): ValidationResultWithNormalizations {
  const errors: ValidationError[] = []
  const normalizations: NormalizationLog = {}
  if (!rubric || typeof rubric !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'rubric_type', message: 'rubric must be object' }],
      normalizations,
    }
  }
  const r = rubric as Partial<Rubric>

  // ──────────────────────────────────────────────────────────────────────
  // Normalizations déterministes (hotfix 2026-05-14 + 2026-05-17 defense-in-depth)
  // Ordre important : structure d'abord (counts), puis valeurs (weights/boosts),
  // puis scoring_prompt qui dépend des champs déjà normalisés pour son auto-pad.
  // ──────────────────────────────────────────────────────────────────────

  if (normalizeCriteriaCount(r)) normalizations.criteria_count_clipped = true

  // normalizeCriteriaWeights conserve sa signature historique (mutation in-place
  // sur l'array, pas sur le wrapper rubric). Le retour est volontairement void.
  const criteriaBefore = JSON.stringify(r.criteria)
  normalizeCriteriaWeights(r.criteria as unknown)
  if (criteriaBefore !== JSON.stringify(r.criteria)) {
    normalizations.criteria_weights_normalized = true
  }

  if (normalizeDisqualifiersCount(r)) normalizations.disqualifiers_count_clipped = true
  if (normalizeSoftBoosts(r)) normalizations.soft_boosts_normalized = true
  if (normalizeCalibrationExamples(r)) normalizations.calibration_normalized = true
  if (normalizeScoringPromptLength(r)) normalizations.scoring_prompt_length_normalized = true

  // ──────────────────────────────────────────────────────────────────────
  // Validations strictes (post-normalization)
  // ──────────────────────────────────────────────────────────────────────

  const sp = validateScoringPrompt(r.scoring_prompt)
  errors.push(...sp.errors)

  const ws = validateWeightSum(r.criteria as Array<[string, number]>)
  errors.push(...ws.errors)

  const dq = validateDisqualifiers(r.disqualifiers)
  errors.push(...dq.errors)

  const sb = validateSoftBoosts(r.soft_boosts)
  errors.push(...sb.errors)

  const ce = validateCalibrationExamples(r.calibration_examples)
  errors.push(...ce.errors)

  return { valid: errors.length === 0, errors, normalizations }
}

// =============================================================================
// Dispatch helper (wraps fetch to dispatch-llm).
// =============================================================================

interface DispatchArgs {
  dispatchUrl: string
  auth: string
  systemPrompt: string
  userPrompt: string
  extraHeaders?: Record<string, string>
}

async function callDispatch(args: DispatchArgs): Promise<DispatchResponse> {
  const res = await fetch(args.dispatchUrl, {
    method: 'POST',
    headers: {
      Authorization: args.auth,
      'Content-Type': 'application/json',
      ...(args.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      task: 'enrichment',
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      options: {
        response_format: { type: 'json_object' },
        temperature: 0.3,
        // Bumpé 2500 → 8000 le 2026-05-14 : avec scoring_prompt 320-450 mots +
        // criteria + disqualifiers + soft_boosts + calibration_examples,
        // DeepSeek-v4-flash hit le max_tokens et retournait un content vide
        // (cf. session 2a68871c : dispatch_failed / detail=unknown en 33s).
        // 8000 tokens ≈ 6000 mots ≈ marge x3 sur la cible.
        max_tokens: 8000,
      },
    }),
  })
  return (await res.json()) as DispatchResponse
}

// =============================================================================
// Edge handler
// =============================================================================

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const authResolved = await resolveAuthOrProxy(supabase, req)
  if (!authResolved.ok) {
    const status = authResolved.error === 'internal_missing_proxy_header' ? 400 : 401
    return json({ ok: false, error: authResolved.error }, status)
  }
  const callerUserId = authResolved.userId

  // ---- Parse body
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (typeof body.seed !== 'string' || body.seed.trim().length === 0) {
    return json({ ok: false, error: 'seed_required' }, 400)
  }
  if (!body.lang || !VALID_LANGS.has(body.lang)) {
    return json({ ok: false, error: 'invalid_lang' }, 400)
  }
  if (
    !body.research_strategy ||
    typeof body.research_strategy !== 'object' ||
    Array.isArray(body.research_strategy)
  ) {
    return json({ ok: false, error: 'research_strategy_required' }, 400)
  }

  const startedAt = Date.now()
  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`
  const systemPrompt = buildSystemPrompt(body.lang)
  const userPrompt = buildUserPrompt(body.seed, body.lang, body.research_strategy)
  const proxyId = req.headers.get('x-proxy-user-id')?.trim()
  const internalAuth = req.headers.get('x-internal-auth')?.trim()
  const extraHeaders: Record<string, string> = {}
  if (proxyId) extraHeaders['x-proxy-user-id'] = proxyId
  if (internalAuth) extraHeaders['x-internal-auth'] = internalAuth

  // ---- First attempt
  let dispatch: DispatchResponse
  try {
    dispatch = await callDispatch({
      dispatchUrl,
      auth,
      systemPrompt,
      userPrompt,
      extraHeaders,
    })
  } catch (err) {
    return json(
      {
        ok: false,
        error: 'dispatch_fetch_failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    )
  }

  if (!dispatch.ok || !dispatch.content) {
    return json(
      {
        ok: false,
        error: 'dispatch_failed',
        detail: dispatch.error ?? dispatch.detail ?? 'unknown',
      },
      502,
    )
  }

  let cleaned = sanitizeLlmOutput(dispatch.content)
  let parsed = tolerantJsonParse(cleaned)
  if (parsed === null) {
    try {
      await supabase.from('logs').insert({
        user_id: callerUserId,
        action: 'rubric-architect:parse_error',
        status: 'error',
        payload: {
          reason: 'tolerant_parse_failed',
          raw_head: cleaned.slice(0, 200),
        },
      })
    } catch {
      // best-effort log; ignore if logs table unavailable.
    }
  }

  let validation: ValidationResultWithNormalizations =
    parsed === null
      ? {
          valid: false,
          errors: [
            {
              code: 'json_parse',
              message: 'Failed to parse LLM JSON',
            },
          ] as ValidationError[],
          normalizations: {},
        }
      : validateRubricSchema(parsed)
  let usedRetry = false

  // ---- Retry once with correction if invalid
  if (!validation.valid) {
    usedRetry = true
    const correctionMsg = buildCorrectionMessage(validation.errors)
    let retry: DispatchResponse
    try {
      retry = await callDispatch({
        dispatchUrl,
        auth,
        systemPrompt,
        userPrompt: `${userPrompt}\n\nCORRECTION REQUISE :\n${correctionMsg}\n\nRégénère la rubric COMPLÈTE en JSON strict en corrigeant ces points.`,
        extraHeaders,
      })
    } catch (err) {
      return json(
        {
          ok: false,
          error: 'dispatch_retry_fetch_failed',
          detail: err instanceof Error ? err.message : String(err),
        },
        502,
      )
    }

    if (!retry.ok || !retry.content) {
      return json(
        {
          ok: false,
          error: 'dispatch_retry_failed',
          detail: retry.error ?? retry.detail ?? 'unknown',
        },
        502,
      )
    }

    cleaned = sanitizeLlmOutput(retry.content)
    parsed = tolerantJsonParse(cleaned)
    validation =
      parsed === null
        ? {
            valid: false,
            errors: [
              {
                code: 'json_parse_retry',
                message: 'Failed to parse LLM JSON on retry',
              },
            ],
            normalizations: {},
          }
        : validateRubricSchema(parsed)

    // Aggregate usage if retry succeeded
    if (dispatch.usage && retry.usage) {
      dispatch.usage = {
        prompt_tokens: (dispatch.usage.prompt_tokens ?? 0) + (retry.usage.prompt_tokens ?? 0),
        completion_tokens:
          (dispatch.usage.completion_tokens ?? 0) + (retry.usage.completion_tokens ?? 0),
        cost: (dispatch.usage.cost ?? 0) + (retry.usage.cost ?? 0),
      }
    }
    if (retry.model_used) dispatch.model_used = retry.model_used
    if (retry.provider_used) dispatch.provider_used = retry.provider_used
  }

  if (!validation.valid) {
    try {
      await supabase.from('logs').insert({
        user_id: callerUserId,
        action: 'rubric-architect:schema_fail',
        status: 'error',
        payload: { errors: validation.errors, retried: usedRetry },
      })
    } catch {
      // best-effort log
    }
    return json(
      {
        ok: false,
        error: 'schema_validation_failed',
        errors: validation.errors,
        retried: usedRetry,
      },
      422,
    )
  }

  // ---- Sanitize unicode (Postgres JSONB safety)
  const rubric = deepSanitizeJson(parsed) as Rubric
  const duration = Date.now() - startedAt

  try {
    await supabase.from('logs').insert({
      user_id: callerUserId,
      action: 'rubric-architect:run',
      status: 'ok',
      payload: {
        lang: body.lang,
        retried: usedRetry,
        duration_ms: duration,
        usage: dispatch.usage ?? null,
        model_used: dispatch.model_used ?? null,
        provider_used: dispatch.provider_used ?? null,
      },
    })
  } catch {
    // best-effort log
  }

  // Log audit-friendly si des normalizations server-side ont été appliquées
  // (auto-pad scoring_prompt, clip criteria count, etc.). Best-effort.
  const hasNormalizations = Object.keys(validation.normalizations).length > 0
  if (hasNormalizations) {
    try {
      await supabase.from('logs').insert({
        user_id: callerUserId,
        action: 'rubric-architect:auto_normalized',
        status: 'ok',
        payload: {
          normalizations: validation.normalizations,
          retried: usedRetry,
        },
      })
    } catch {
      // best-effort log
    }
  }

  return json(
    {
      ok: true,
      rubric,
      telemetry: {
        retried: usedRetry,
        duration_ms: duration,
        usage: dispatch.usage ?? null,
        model_used: dispatch.model_used ?? null,
        provider_used: dispatch.provider_used ?? null,
        auto_normalizations: hasNormalizations ? validation.normalizations : null,
      },
    },
    200,
  )
}

// Guard so test runner can `import` this module without booting the listener.
if (import.meta.main) {
  Deno.serve(handler)
}

// =============================================================================
// Helpers
// =============================================================================

export function buildCorrectionMessage(errors: ValidationError[]): string {
  // Prioritize weight_sum since it is the most common LLM mistake.
  const weightErr = errors.find((e) => e.code === 'weight_sum')
  const lines: string[] = []
  if (weightErr) lines.push(`- ${weightErr.message}`)
  for (const e of errors) {
    if (e.code === 'weight_sum') continue
    lines.push(`- ${e.message}`)
  }
  return lines.join('\n')
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
