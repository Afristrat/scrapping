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
- Le scoring_prompt (200-500 mots) doit RÉCAPITULER les 3 couches
  pour le LLM scoreur, et donner 2-3 exemples calibrés (un signal
  qui mérite 80+, un autour de 40, un autour de 10).

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

// =============================================================================
// Schema validators (purs, testables)
// =============================================================================

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

export function validateRubricSchema(rubric: unknown): ValidationResult {
  const errors: ValidationError[] = []
  if (!rubric || typeof rubric !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'rubric_type', message: 'rubric must be object' }],
    }
  }
  const r = rubric as Partial<Rubric>

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

  return { valid: errors.length === 0, errors }
}

// =============================================================================
// Dispatch helper (wraps fetch to dispatch-llm).
// =============================================================================

interface DispatchArgs {
  dispatchUrl: string
  auth: string
  systemPrompt: string
  userPrompt: string
}

async function callDispatch(args: DispatchArgs): Promise<DispatchResponse> {
  const res = await fetch(args.dispatchUrl, {
    method: 'POST',
    headers: { Authorization: args.auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'enrichment',
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      options: {
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2500,
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

  // ---- First attempt
  let dispatch: DispatchResponse
  try {
    dispatch = await callDispatch({
      dispatchUrl,
      auth,
      systemPrompt,
      userPrompt,
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
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    parsed = null
    try {
      await supabase.from('logs').insert({
        user_id: callerUserId,
        action: 'rubric-architect:parse_error',
        status: 'error',
        payload: {
          reason: err instanceof Error ? err.message : String(err),
          raw_head: cleaned.slice(0, 200),
        },
      })
    } catch {
      // best-effort log; ignore if logs table unavailable.
    }
  }

  let validation =
    parsed === null
      ? {
          valid: false,
          errors: [
            {
              code: 'json_parse',
              message: 'Failed to parse LLM JSON',
            },
          ] as ValidationError[],
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
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = null
    }
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
