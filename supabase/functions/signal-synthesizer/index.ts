// signal-synthesizer — K05 Kairos Phase 1
// BYOK strict — no model imposed.
//
// POST /functions/v1/signal-synthesizer
// Body : { signals: ScoredSignal[], research_strategy: ResearchStrategy, lang: 'fr'|'en'|'ar' }
// Output : { topics, coverage_map, cultural_warnings, devil_advocate_topic_id, telemetry }
//
// Pipeline :
//   1. Filtre signals.disqualified=true
//   2. Si signals retenus < 5 → 422 INSUFFICIENT_SIGNALS
//   3. Construit system+user prompts (PROMPT 3 spec section)
//   4. Appelle dispatch-llm (task='enrichment') — JSON mode
//   5. Parse + valide schema strict :
//      - topics 3-8
//      - chaque topic.key_signals_supporting ∈ [3, 6]
//      - tout signal_id référencé existe dans input → sinon retry 1× avec correction
//      - brief_variants : 250-400 chars stricts
//      - coverage_map : entrée pour CHAQUE subject de research_strategy
//      - devil_advocate_topic_id pointe un topic type='devil_advocate'
//   6. Sanitize unicode, return 200

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deepSanitizeJson, sanitizeUnicodeString } from '../_shared/unicode.ts'
import { resolveAuthOrProxy } from '../_shared/service-role-auth.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MIN_SIGNALS_REQUIRED = 5
const MIN_TOPICS = 3
const MAX_TOPICS = 8
const KEY_SIGNALS_MIN = 3
const KEY_SIGNALS_MAX = 6
const BRIEF_MIN_CHARS = 250
const BRIEF_MAX_CHARS = 400

type Lang = 'fr' | 'en' | 'ar'

export interface ScoredSignal {
  id: string
  title: string
  url: string
  source: string
  lang: string
  score: number
  excerpt: string
  disqualified: boolean
  applied_boosts: string[]
}

export interface ResearchStrategySubject {
  id: string
  title: string
  angle: string
  // Other fields are accepted but not used here.
}

export interface ResearchStrategy {
  domain?: string
  geo_scope?: string
  language_mix?: string[]
  subjects: ResearchStrategySubject[]
  tensions?: unknown
  blind_spots?: unknown
  recursion_budget?: number
}

interface RequestBody {
  signals: ScoredSignal[]
  research_strategy: ResearchStrategy
  lang: Lang
}

interface BriefVariant {
  framework_hint: string
  brief: string
  rationale: string
}

interface TopicProvenance {
  lang_distribution: Record<string, number>
  source_diversity_score: number
  freshness_median_days: number
}

interface CrossTopicConflict {
  topic_id: string
  signal_id: string
}

export interface SynthesizedTopic {
  id: string
  label: string
  summary: string
  type: 'regular' | 'devil_advocate' | 'emerging'
  dominant_angle: string
  key_signals_supporting: string[]
  key_signals_conflicting: string[]
  cross_topic_conflicts: CrossTopicConflict[]
  internal_tension: string | null
  brief_variants: BriefVariant[]
  provenance: TopicProvenance
  confidence: number
  warnings: string[]
}

interface CoverageMapEntry {
  signals_count: number
  covered: boolean
  topics: string[]
}

interface SynthesizerOutput {
  topics: SynthesizedTopic[]
  coverage_map: Record<string, CoverageMapEntry>
  cultural_warnings: string[]
  devil_advocate_topic_id: string
}

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
  provider_used?: string
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  // Hallucinated signal_ids referenced by topics but absent from input.
  hallucinated_ids: string[]
}

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

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const validation = validateRequestBody(body)
  if (!validation.ok) {
    return json({ ok: false, error: 'bad_body', detail: validation.error }, 400)
  }

  const { signals, research_strategy, lang } = body

  // Step 1 : filter disqualified.
  const retained = signals.filter((s) => !s.disqualified)

  // Step 2 : need at least MIN_SIGNALS_REQUIRED to cluster.
  if (retained.length < MIN_SIGNALS_REQUIRED) {
    return json(
      {
        ok: false,
        error: 'INSUFFICIENT_SIGNALS',
        detail: `Need at least ${MIN_SIGNALS_REQUIRED} non-disqualified signals, got ${retained.length}.`,
      },
      422,
    )
  }

  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`
  const validIdsSet = new Set(retained.map((s) => s.id))
  const subjectIds = research_strategy.subjects.map((s) => s.id)

  const systemPrompt = buildSystemPrompt(lang)
  const userPrompt = buildUserPrompt(retained, research_strategy, lang)
  const proxyId = req.headers.get('x-proxy-user-id')?.trim()
  const internalAuth = req.headers.get('x-internal-auth')?.trim()
  const extraHeaders: Record<string, string> = {}
  if (proxyId) extraHeaders['x-proxy-user-id'] = proxyId
  if (internalAuth) extraHeaders['x-internal-auth'] = internalAuth

  // First pass.
  const t0 = Date.now()
  const firstCall = await callDispatch(dispatchUrl, auth, systemPrompt, userPrompt, extraHeaders)
  if (!firstCall.ok) {
    return json(
      {
        ok: false,
        error: 'dispatch_failed',
        detail: firstCall.error ?? 'unknown',
      },
      502,
    )
  }

  let parsed: SynthesizerOutput | null = null
  let parseError: string | null = null
  const firstParsed = safeJsonParse(firstCall.content ?? '')
  if (firstParsed.ok) {
    parsed = firstParsed.value as SynthesizerOutput
  } else {
    parseError = firstParsed.error
  }

  let usedRetry = false
  let validation1: ValidationResult = {
    ok: false,
    errors: parseError ? [parseError] : ['no_parse'],
    warnings: [],
    hallucinated_ids: [],
  }
  if (parsed) {
    validation1 = validateSynthesizerOutput(parsed, validIdsSet, subjectIds)
  }

  // Retry 1× on hallucination or schema break, with explicit correction message.
  let final: SynthesizerOutput | null = parsed && validation1.ok ? parsed : null
  let finalValidation: ValidationResult = validation1

  if (!final) {
    usedRetry = true
    const correctionUser = buildCorrectionPrompt(userPrompt, firstCall.content ?? '', validation1)
    const secondCall = await callDispatch(
      dispatchUrl,
      auth,
      systemPrompt,
      correctionUser,
      extraHeaders,
    )
    if (!secondCall.ok) {
      return json(
        {
          ok: false,
          error: 'validation_failed',
          detail: validation1.errors,
          hallucinated_ids: validation1.hallucinated_ids,
        },
        422,
      )
    }
    const secondParsed = safeJsonParse(secondCall.content ?? '')
    if (!secondParsed.ok) {
      return json(
        {
          ok: false,
          error: 'validation_failed_after_retry',
          detail: secondParsed.error,
        },
        422,
      )
    }
    const parsed2 = secondParsed.value as SynthesizerOutput
    const validation2 = validateSynthesizerOutput(parsed2, validIdsSet, subjectIds)
    if (!validation2.ok) {
      return json(
        {
          ok: false,
          error: 'validation_failed_after_retry',
          detail: validation2.errors,
          hallucinated_ids: validation2.hallucinated_ids,
        },
        422,
      )
    }
    final = parsed2
    finalValidation = validation2
  }

  // Sanitize all string fields.
  const sanitized = deepSanitizeJson(final)
  for (const t of sanitized.topics) {
    t.label = sanitizeUnicodeString(t.label)
    t.summary = sanitizeUnicodeString(t.summary)
  }

  const totalCost = firstCall.usage?.cost ?? 0
  const telemetry = {
    signals_in: signals.length,
    signals_retained: retained.length,
    topics_count: sanitized.topics.length,
    used_retry: usedRetry,
    warnings: finalValidation.warnings,
    latency_ms: Date.now() - t0,
    model_used: firstCall.model_used ?? null,
    cost_usd: totalCost,
  }

  // Best-effort log (do not fail on log error).
  try {
    await supabase.from('logs').insert({
      user_id: callerUserId,
      action: 'signal-synthesizer:run',
      status: 'ok',
      payload: telemetry,
    })
  } catch {
    // ignore
  }

  return json(
    {
      ok: true,
      topics: sanitized.topics,
      coverage_map: sanitized.coverage_map,
      cultural_warnings: sanitized.cultural_warnings,
      devil_advocate_topic_id: sanitized.devil_advocate_topic_id,
      telemetry,
    },
    200,
  )
}

// Guard so test runner can `import` this module without booting the listener.
if (import.meta.main) {
  Deno.serve(handler)
}

// --------------------------------------------------------------------------
// JSON parsing — exported for testing
// --------------------------------------------------------------------------

export type SafeJsonResult =
  | { ok: true; value: unknown; repaired: boolean }
  | { ok: false; error: string }

/**
 * Tolerant JSON parser for LLM outputs.
 *
 * DeepSeek / Qwen / Claude vary on whether they wrap JSON in markdown fences,
 * add a preamble, or emit trailing commas. Three escalating passes :
 *   1. strict JSON.parse on the trimmed input
 *   2. strip surrounding ```json … ``` fences (same regex as quality-auditor)
 *      + slice to outermost { … } if there's a preamble, then re-parse
 *   3. repair trailing commas (`, }` / `, ]`) — the most common LLM mistake
 *      that breaks strict JSON, then re-parse
 *
 * Returns { ok: true, value, repaired } on success (repaired=true means
 * we had to clean the input). On failure, returns { ok: false, error }
 * with a stable error message for the test suite.
 *
 * Defensively never throws.
 */
export function safeJsonParse(raw: string): SafeJsonResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'parse_failed:not_a_string' }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'parse_failed:empty' }
  }
  // Pass 1 — strict parse on trimmed input.
  try {
    return { ok: true, value: JSON.parse(trimmed), repaired: false }
  } catch (_e1) {
    // fall through
  }
  // Pass 2 — strip markdown fences (same regex as quality-auditor) and
  // slice to the outermost {…} block when a preamble or trailing prose
  // surrounds the JSON.
  let cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace > 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  } else if (firstBrace === -1) {
    return { ok: false, error: 'parse_failed:no_json_object_found' }
  }
  try {
    return { ok: true, value: JSON.parse(cleaned), repaired: true }
  } catch (_e2) {
    // fall through
  }
  // Pass 3 — repair trailing commas before } and ] (most common LLM bug).
  const repaired = cleaned.replace(/,(\s*[}\]])/g, '$1')
  try {
    return { ok: true, value: JSON.parse(repaired), repaired: true }
  } catch (e3) {
    const msg = e3 instanceof Error ? e3.message : 'parse_failed:unknown'
    return { ok: false, error: `parse_failed:${msg}` }
  }
}

// --------------------------------------------------------------------------
// Validation helpers — exported for testing
// --------------------------------------------------------------------------

export function validateRequestBody(body: unknown): { ok: true } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body_not_object' }
  }
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.signals)) {
    return { ok: false, error: 'signals_must_be_array' }
  }
  if (!b.research_strategy || typeof b.research_strategy !== 'object') {
    return { ok: false, error: 'research_strategy_required' }
  }
  const rs = b.research_strategy as Record<string, unknown>
  if (!Array.isArray(rs.subjects) || rs.subjects.length === 0) {
    return { ok: false, error: 'research_strategy.subjects_required' }
  }
  if (b.lang !== 'fr' && b.lang !== 'en' && b.lang !== 'ar') {
    return { ok: false, error: 'lang_invalid' }
  }
  return { ok: true }
}

/**
 * Strict schema validation matching PROMPT 3 spec.
 * Collects every error rather than short-circuiting, so a single retry
 * can correct everything at once.
 */
export function validateSynthesizerOutput(
  output: unknown,
  validSignalIds: Set<string>,
  subjectIds: string[],
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const hallucinated_ids: string[] = []

  if (!output || typeof output !== 'object') {
    return {
      ok: false,
      errors: ['output_not_object'],
      warnings,
      hallucinated_ids,
    }
  }

  const o = output as Record<string, unknown>

  // topics
  if (!Array.isArray(o.topics)) {
    return {
      ok: false,
      errors: ['topics_not_array'],
      warnings,
      hallucinated_ids,
    }
  }
  const topics = o.topics as Record<string, unknown>[]
  if (topics.length < MIN_TOPICS || topics.length > MAX_TOPICS) {
    errors.push(
      `topics_count_out_of_range: ${topics.length} (expected ${MIN_TOPICS}-${MAX_TOPICS})`,
    )
  }

  const topicIds = new Set<string>()
  let devilAdvocateCount = 0

  for (const [i, t] of topics.entries()) {
    if (typeof t.id !== 'string' || !t.id) {
      errors.push(`topic[${i}].id_missing`)
      continue
    }
    if (topicIds.has(t.id)) errors.push(`topic[${i}].id_duplicate:${t.id}`)
    topicIds.add(t.id)

    if (typeof t.label !== 'string') {
      errors.push(`topic[${t.id}].label_missing`)
    }
    if (typeof t.summary !== 'string') {
      errors.push(`topic[${t.id}].summary_missing`)
    }
    if (t.type !== 'regular' && t.type !== 'devil_advocate' && t.type !== 'emerging') {
      errors.push(`topic[${t.id}].type_invalid:${String(t.type)}`)
    }
    if (t.type === 'devil_advocate') devilAdvocateCount += 1

    // key_signals_supporting : 3-6 ids pour les topics réguliers/emerging,
    // 1-6 pour les devil_advocate (le system prompt dit explicitement
    // "≥ 3, sauf devil's advocate qui peut être moins"). On gardait
    // l'ancien minimum 3 partout, ce qui faisait planter le pipeline avec
    // `key_signals_supporting_count:2` sur des devil's advocate légitimes.
    const supporting = t.key_signals_supporting
    const minSupporting = t.type === 'devil_advocate' ? 1 : KEY_SIGNALS_MIN
    if (!Array.isArray(supporting)) {
      errors.push(`topic[${t.id}].key_signals_supporting_not_array`)
    } else {
      if (supporting.length < minSupporting || supporting.length > KEY_SIGNALS_MAX) {
        errors.push(
          `topic[${t.id}].key_signals_supporting_count:${supporting.length} (expected ${minSupporting}-${KEY_SIGNALS_MAX})`,
        )
      }
      for (const sid of supporting) {
        if (typeof sid !== 'string') {
          errors.push(`topic[${t.id}].supporting_non_string`)
          continue
        }
        if (!validSignalIds.has(sid)) {
          hallucinated_ids.push(sid)
          errors.push(`topic[${t.id}].supporting_hallucinated:${sid}`)
        }
      }
    }

    // key_signals_conflicting (optional but must be array if present)
    const conflicting = t.key_signals_conflicting
    if (conflicting !== undefined && conflicting !== null) {
      if (!Array.isArray(conflicting)) {
        errors.push(`topic[${t.id}].key_signals_conflicting_not_array`)
      } else {
        for (const sid of conflicting) {
          if (typeof sid !== 'string') {
            errors.push(`topic[${t.id}].conflicting_non_string`)
            continue
          }
          if (!validSignalIds.has(sid)) {
            hallucinated_ids.push(sid)
            errors.push(`topic[${t.id}].conflicting_hallucinated:${sid}`)
          }
        }
      }
    }

    // cross_topic_conflicts
    const xConflicts = t.cross_topic_conflicts
    if (xConflicts !== undefined && xConflicts !== null) {
      if (!Array.isArray(xConflicts)) {
        errors.push(`topic[${t.id}].cross_topic_conflicts_not_array`)
      } else {
        for (const c of xConflicts) {
          if (!c || typeof c !== 'object') {
            errors.push(`topic[${t.id}].cross_topic_conflicts_entry_invalid`)
            continue
          }
          const obj = c as Record<string, unknown>
          if (typeof obj.signal_id !== 'string') {
            errors.push(`topic[${t.id}].cross_topic_conflicts.signal_id_missing`)
            continue
          }
          if (!validSignalIds.has(obj.signal_id)) {
            hallucinated_ids.push(obj.signal_id)
            errors.push(`topic[${t.id}].cross_topic_conflict_hallucinated:${obj.signal_id}`)
          }
        }
      }
    }

    // brief_variants
    const variants = t.brief_variants
    if (!Array.isArray(variants)) {
      errors.push(`topic[${t.id}].brief_variants_not_array`)
    } else {
      if (variants.length < 1 || variants.length > 3) {
        errors.push(`topic[${t.id}].brief_variants_count:${variants.length} (expected 1-3)`)
      }
      for (const [j, v] of variants.entries()) {
        if (!v || typeof v !== 'object') {
          errors.push(`topic[${t.id}].brief_variants[${j}]_not_object`)
          continue
        }
        const vObj = v as Record<string, unknown>
        const brief = vObj.brief
        if (typeof brief !== 'string') {
          errors.push(`topic[${t.id}].brief_variants[${j}].brief_missing`)
          continue
        }
        if (brief.length < BRIEF_MIN_CHARS || brief.length > BRIEF_MAX_CHARS) {
          errors.push(
            `topic[${t.id}].brief_variants[${j}].brief_length:${brief.length} (expected ${BRIEF_MIN_CHARS}-${BRIEF_MAX_CHARS})`,
          )
        }
      }
    }

    // mono-source warning : provenance.source_diversity_score < 0.2 → flag.
    const prov = t.provenance as Record<string, unknown> | undefined
    if (prov && typeof prov.source_diversity_score === 'number') {
      if (prov.source_diversity_score < 0.2) {
        warnings.push(`topic[${t.id}].mono_source_warning`)
      }
    }
  }

  // devil_advocate_topic_id present + points an existing devil_advocate topic
  const devilId = o.devil_advocate_topic_id
  if (typeof devilId !== 'string' || !devilId) {
    errors.push('devil_advocate_topic_id_missing')
  } else if (!topicIds.has(devilId)) {
    errors.push(`devil_advocate_topic_id_unknown:${devilId}`)
  } else {
    const devilTopic = topics.find((t) => t.id === devilId)
    if (devilTopic && devilTopic.type !== 'devil_advocate') {
      errors.push(`devil_advocate_topic_id_type_mismatch:${String(devilTopic.type)}`)
    }
  }

  if (devilAdvocateCount === 0) {
    errors.push('no_devil_advocate_topic')
  }

  // coverage_map : entry for EACH subject of research_strategy
  const cm = o.coverage_map
  if (!cm || typeof cm !== 'object') {
    errors.push('coverage_map_not_object')
  } else {
    const map = cm as Record<string, unknown>
    for (const sid of subjectIds) {
      if (!(sid in map)) {
        errors.push(`coverage_map.missing_subject:${sid}`)
        continue
      }
      const entry = map[sid] as Record<string, unknown> | undefined
      if (!entry || typeof entry !== 'object') {
        errors.push(`coverage_map.${sid}_not_object`)
        continue
      }
      if (typeof entry.signals_count !== 'number') {
        errors.push(`coverage_map.${sid}.signals_count_missing`)
      }
      if (typeof entry.covered !== 'boolean') {
        errors.push(`coverage_map.${sid}.covered_missing`)
      }
      if (!Array.isArray(entry.topics)) {
        errors.push(`coverage_map.${sid}.topics_not_array`)
      }
    }
  }

  // cultural_warnings : array (may be empty)
  if (o.cultural_warnings !== undefined && !Array.isArray(o.cultural_warnings)) {
    errors.push('cultural_warnings_not_array')
  }

  return { ok: errors.length === 0, errors, warnings, hallucinated_ids }
}

/**
 * Compute per-topic provenance metrics from input signals — used by tests
 * and by the synthesizer's own checks.
 */
export function computeLangDistribution(
  signals: ScoredSignal[],
  ids: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of ids) {
    const s = signals.find((sig) => sig.id === id)
    if (!s) continue
    out[s.lang] = (out[s.lang] ?? 0) + 1
  }
  return out
}

// --------------------------------------------------------------------------
// Prompt construction
// --------------------------------------------------------------------------

/**
 * System prompt — verbatim from PROMPT 3 spec section
 * (kairos-bassira-research-prompts.md).
 */
export function buildSystemPrompt(lang: Lang): string {
  const langLine =
    lang === 'fr'
      ? 'Langue de sortie : français. Accents majuscules obligatoires (É, È, À, Ç, Ê, Ô, Î, Ù, Û).'
      : lang === 'ar'
        ? 'Langue de sortie : العربية. RTL respect, pas de mélange LTR sauf acronymes/URLs.'
        : 'Output language: English.'

  return `Tu reçois 30-80 signaux SCORÉS (id, titre, URL, source, lang, score 0-100, extrait court 200 chars, disqualified: bool, applied_boosts: [string]).
Tu reçois aussi la research_strategy (subjects, tensions, blind_spots).

Ta MISSION : transformer ce matériau brut en TOPICS exploitables par
Bassira pour générer des simulations prospectives multi-agents.

UN TOPIC RICHE EN PROSPECTIVE A 4 PROPRIÉTÉS :
1. UN CLUSTER COHÉRENT de signaux (≥ 3, sauf devil's advocate qui peut
   être moins).
2. UNE TENSION INTERNE ou un GAP ASSUMÉ (les signaux ne sont pas tous
   d'accord, ou il manque un acteur clé). Les topics tout-convergents
   sont des culs-de-sac.
3. UN BRIEF en 1-3 VARIANTES (frames différents : market, decision,
   crisis, policy, cerberus). Chaque variante simulable indépendamment
   avec un framework Bassira approprié.
4. UNE PROVENANCE TRACÉE : key_signals supporting, key_signals
   conflicting, et un confidence calibré.

ÉTAPES OBLIGATOIRES :

1. Filtre : ignore les signaux avec disqualified=true. Ils ne servent
   pas au clustering.

2. Clusterise sémantiquement les signaux retenus. Adaptatif :
   - 3-8 topics MACRO.
   - Si un topic macro contient ≥ 8 signaux, propose 2-3 sub-topics.

3. Pour chaque topic, identifie EXPLICITEMENT :
   - les signaux qui SUPPORTENT le narratif principal du cluster.
   - les signaux qui CONTREDISENT ou nuancent.
   Si aucun signal ne contredit dans le cluster, regarde dans les
   AUTRES topics si un signal d'un cluster voisin contredit. Référence
   par cross_topic_conflicts.

4. Génère 1-3 BRIEF VARIANTS par topic. Règles brief :
   - 250-400 caractères stricts (espaces inclus).
   - Question simulable avec horizon temporel explicite.
   - 2-4 acteurs identifiables nommés.
   - Seuil quantifiable si possible (taux, montant, %, date).
   - Commence par le scénario, jamais par "Le sujet de" ou "Étudions".
   - Frame différent par variante (market vs decision vs crisis...).

5. FORCE ≥ 1 topic "devil's advocate" : un topic qui ARGUMENTE LE
   CONTRAIRE de la lecture dominante de la graine. Même avec peu de
   signaux. Tag explicite : type="devil_advocate". Le brief de ce
   topic doit poser la question dans le sens opposé du seed
   (ex: si seed parle d'une réforme imminente, le devil's advocate
   demande "que se passe-t-il si la réforme est repoussée 18 mois ?").

6. COVERAGE MAP : pour chaque subject de la research_strategy, indique
   nombre de signaux retenus. Si un subject a 0 signaux, c'est un
   GAP qui peut déclencher iterative-deepening.

7. CULTURAL CHECK : si language_mix attendu était {fr, ar, en} mais
   100% des signaux retenus sont fr → flag dans cultural_warnings.

INTERDICTIONS :
- Inventer un signal_id absent de l'input.
- Mettre en key_signals_supporting plus de 6 ids (resté en focus).
- Brief hors longueur 250-400.
- Brief en langue ≠ ${lang}.
- Brief copy-collé à la graine.
- Topic mono-source (tous les signaux d'un cluster viennent de la
  même source) → flag mono_source_warning.

${langLine}

SCHEMA OUTPUT (JSON strict, aucun préambule, aucune balise XML, aucun markdown) :
{
  "topics": [
    {
      "id": "t_001",
      "label": "5-15 mots",
      "summary": "30-60 mots",
      "type": "regular|devil_advocate|emerging",
      "dominant_angle": "actors|metrics|...",
      "key_signals_supporting": ["sig_xx", "sig_yy", "sig_zz"],
      "key_signals_conflicting": ["sig_aa"],
      "cross_topic_conflicts": [{"topic_id": "t_005", "signal_id": "sig_bb"}],
      "internal_tension": "string 15-30 mots ou null",
      "brief_variants": [
        {
          "framework_hint": "cerberus|market|decision|crisis|policy",
          "brief": "string 250-400 chars",
          "rationale": "10-20 mots — pourquoi ce frame ici"
        }
      ],
      "provenance": {
        "lang_distribution": {"fr": 5, "en": 2, "ar": 1},
        "source_diversity_score": 0.0-1.0,
        "freshness_median_days": 0
      },
      "confidence": 0.0-1.0,
      "warnings": []
    }
  ],
  "coverage_map": {
    "s_001": { "signals_count": 12, "covered": true, "topics": ["t_001"] }
  },
  "cultural_warnings": [],
  "devil_advocate_topic_id": "t_007"
}`
}

export function buildUserPrompt(signals: ScoredSignal[], rs: ResearchStrategy, lang: Lang): string {
  // Cap excerpt length defensively (200 chars per spec).
  const compactSignals = signals.map((s) => ({
    id: s.id,
    title: s.title.slice(0, 200),
    url: s.url,
    source: s.source,
    lang: s.lang,
    score: s.score,
    excerpt: (s.excerpt ?? '').slice(0, 200),
    applied_boosts: s.applied_boosts ?? [],
  }))

  const subjects = rs.subjects.map((s) => ({
    id: s.id,
    title: s.title,
    angle: s.angle,
  }))

  return [
    `Output language: ${lang}.`,
    `research_strategy.domain = ${rs.domain ?? 'unknown'}`,
    `research_strategy.geo_scope = ${rs.geo_scope ?? 'unknown'}`,
    `research_strategy.language_mix = ${JSON.stringify(rs.language_mix ?? [])}`,
    'research_strategy.subjects =',
    JSON.stringify(subjects, null, 2),
    `signals (${signals.length} retenus, disqualified déjà filtrés) =`,
    JSON.stringify(compactSignals, null, 2),
    'Réponds UNIQUEMENT avec le JSON décrit dans le system prompt.',
  ].join('\n')
}

function buildCorrectionPrompt(
  originalUser: string,
  rawFirstResponse: string,
  validation: ValidationResult,
): string {
  const trimmedRaw =
    rawFirstResponse.length > 4000
      ? `${rawFirstResponse.slice(0, 4000)}…[truncated]`
      : rawFirstResponse
  return [
    originalUser,
    '',
    'TA RÉPONSE PRÉCÉDENTE EST INVALIDE. Voici les erreurs détectées :',
    validation.errors.map((e) => `  - ${e}`).join('\n'),
    validation.hallucinated_ids.length > 0
      ? `Signal_ids inventés (NE PAS RÉUTILISER) : ${validation.hallucinated_ids.join(', ')}`
      : '',
    '',
    'Précédente sortie partielle (pour contexte uniquement) :',
    trimmedRaw,
    '',
    'Corrige TOUS les défauts et retourne le JSON strict, complet, conforme au schéma. Aucun préambule.',
  ]
    .filter(Boolean)
    .join('\n')
}

// --------------------------------------------------------------------------
// dispatch-llm wrapper — task='enrichment', BYOK strict, no model imposed.
// --------------------------------------------------------------------------

async function callDispatch(
  dispatchUrl: string,
  auth: string,
  systemPrompt: string,
  userPrompt: string,
  extraHeaders: Record<string, string> = {},
): Promise<DispatchResponse> {
  const res = await fetch(dispatchUrl, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({
      task: 'enrichment',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 4000,
      },
    }),
  })
  return (await res.json()) as DispatchResponse
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
