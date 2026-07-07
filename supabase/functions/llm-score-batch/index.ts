/**
 * llm-score-batch — Edge function Kairos.
 *
 * BYOK strict — aucun modèle hardcodé. Tous les appels LLM passent par
 * dispatch-llm (task='scoring' pour criteria, task='enrichment' pour
 * disqualifier/soft_boost gates qui sont des classifications binaires).
 *
 * 3 modes d'invocation (Story Ralph K04) :
 *
 * 1. LEGACY USER (rétrocompat total — comportement historique inchangé)
 *    Body : { signal_ids: string[] }
 *    → Lit signaux depuis 'signals' (filtrés par user_id JWT)
 *    → Lit rubric depuis settings.active_rubric_id
 *    → Mode consensus si settings.consensus_models.length ≥ 2
 *    → Upsert dans 'scores' + 'score_runs' + déclenche enrich-signal
 *
 * 2. HYBRIDE (signal_ids + rubric_override + source_table)
 *    Body : { signal_ids, rubric_override, source_table?: 'signals' | 'signals_session' }
 *    → Lit signaux depuis source_table
 *    → Applique rubric ad-hoc 3-couches (skip DB read settings)
 *    → Retourne résultats par signal SANS persistance scores (caller décide)
 *
 * 3. AD-HOC PUR (signals_input + rubric_override)
 *    Body : { signals_input: ScoredSignalInput[], rubric_override }
 *    → Pas de DB read signaux. rubric_override OBLIGATOIRE (sinon 400).
 *    → Applique rubric 3-couches sur l'array fourni.
 *    → Retourne résultats SANS persistance.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { formatError, summarizeError } from '../_shared/errors.ts'
import { parseScoringResponse, ScoreParseError } from '../_shared/parse-score.ts'
import { renderSignalBlock } from '../_shared/signal-text.ts'
import { DATA_GUARD_FR, JSON_STRICT_GUARD_FR } from '../_shared/llm-guards.ts'
import { buildEnrichPayload, triggerEnrichSignal } from './enrich-trigger.ts'
import {
  type RubricOverride,
  type ScoredSignalInput,
  validateRubricOverride,
  validateScoredSignalInput,
} from './rubric-override.ts'
import { makeFetchDispatchCaller, scoreSignalWithRubric } from './scoring-engine.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// =============================================================================
// Types
// =============================================================================

export interface LlmScoreBatchBody {
  /** Mode legacy : ids à lire depuis 'signals' (ou source_table). */
  signal_ids?: string[]
  /** Mode ad-hoc pur : signaux fournis directement. */
  signals_input?: ScoredSignalInput[]
  /** Rubric ad-hoc K02. Skip DB read settings.active_rubric_id si présent. */
  rubric_override?: RubricOverride
  /** Table d'où lire les signaux (default 'signals'). */
  source_table?: 'signals' | 'signals_session'
}

interface ScoringCriterion {
  label: string
  weight: number
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

interface ConsensusScoreResult {
  model: string
  provider: string
  scores: Map<string, { score: number; reasoning: string }>
  promptTokens: number
  completionTokens: number
  cost: number
}

const VALID_SOURCE_TABLES: ReadonlySet<string> = new Set(['signals', 'signals_session'])

// =============================================================================
// Validation purs (testables)
// =============================================================================

export type BodyMode = 'legacy' | 'hybrid' | 'ad_hoc'

export interface BodyValidationResult {
  ok: boolean
  mode?: BodyMode
  error?: string
  detail?: string
}

/**
 * Détermine le mode et valide la cohérence du body.
 * Pure — pas d'I/O.
 */
export function validateBody(body: unknown): BodyValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' }
  }
  const b = body as LlmScoreBatchBody

  const hasSignalIds = Array.isArray(b.signal_ids) && b.signal_ids.length > 0
  const hasSignalsInput = Array.isArray(b.signals_input) && b.signals_input.length > 0
  const hasRubricOverride = b.rubric_override !== undefined && b.rubric_override !== null

  if (!hasSignalIds && !hasSignalsInput) {
    return { ok: false, error: 'signal_ids_or_signals_input_required' }
  }
  if (hasSignalIds && hasSignalsInput) {
    return {
      ok: false,
      error: 'mutually_exclusive_inputs',
      detail: 'Provide signal_ids OR signals_input, not both',
    }
  }

  // Mode ad-hoc pur : rubric_override OBLIGATOIRE.
  if (hasSignalsInput) {
    if (!hasRubricOverride) {
      return { ok: false, error: 'RUBRIC_REQUIRED_FOR_AD_HOC' }
    }
    // Valider chaque signal
    for (let i = 0; i < (b.signals_input ?? []).length; i++) {
      const v = validateScoredSignalInput(b.signals_input![i])
      if (!v.valid) {
        return {
          ok: false,
          error: 'invalid_signals_input',
          detail: `signals_input[${i}]: ${v.errors[0]?.message ?? 'invalid'}`,
        }
      }
    }
  }

  if (hasRubricOverride) {
    const v = validateRubricOverride(b.rubric_override)
    if (!v.valid) {
      return {
        ok: false,
        error: 'invalid_rubric_override',
        detail: v.errors.map((e) => `${e.code}: ${e.message}`).join('; '),
      }
    }
  }

  if (b.source_table !== undefined && !VALID_SOURCE_TABLES.has(b.source_table)) {
    return {
      ok: false,
      error: 'invalid_source_table',
      detail: `source_table must be 'signals' or 'signals_session'`,
    }
  }

  if (hasSignalIds) {
    if (hasRubricOverride) return { ok: true, mode: 'hybrid' }
    return { ok: true, mode: 'legacy' }
  }
  return { ok: true, mode: 'ad_hoc' }
}

// =============================================================================
// Consensus mode helper (legacy/hybrid uniquement)
// =============================================================================

/**
 * Appelle dispatch-llm pour un modèle donné (format "provider:model_id").
 * Retourne null si l'appel échoue (pour Promise.allSettled).
 */
async function callDispatchForModel(
  supabaseUrl: string,
  auth: string,
  systemPrompt: string,
  prompt: string,
  signalCount: number,
  modelSpec: string,
  knownIds: Set<string>,
): Promise<ConsensusScoreResult | null> {
  const [provider, ...modelParts] = modelSpec.split(':')
  const modelId = modelParts.join(':')

  let dispatchResult: DispatchResponse
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/dispatch-llm`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'scoring',
        provider_override: provider,
        model_override: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        options: {
          max_tokens: Math.min(400 * signalCount, 8000),
          response_format: { type: 'json_object' },
          temperature: 0,
        },
      }),
    })
    dispatchResult = (await res.json()) as DispatchResponse
  } catch {
    return null
  }

  if (!dispatchResult.ok) return null

  const raw = dispatchResult.content ?? ''
  let parsedScores: Map<string, { score: number; reasoning: string }>
  try {
    const entries = parseScoringResponse(raw)
    parsedScores = new Map()
    for (const e of entries) {
      if (knownIds.has(e.id)) parsedScores.set(e.id, { score: e.score, reasoning: e.reasoning })
    }
  } catch {
    return null
  }

  const usage = dispatchResult.usage
  return {
    model: dispatchResult.model_used ?? modelId,
    provider: dispatchResult.provider_used ?? provider,
    scores: parsedScores,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    cost: usage?.cost ?? 0,
  }
}

// =============================================================================
// Edge handler
// =============================================================================

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const validation = validateBody(rawBody)
  if (!validation.ok) {
    return json({ error: validation.error, detail: validation.detail }, 400)
  }
  const body = rawBody as LlmScoreBatchBody
  const mode: BodyMode = validation.mode!

  // ─────────────────────────────────────────────────────────────────────────
  // MODE AD-HOC PUR — pas de DB read signaux, scoring direct via rubric_override
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'ad_hoc') {
    return await handleAdHocOrHybridScoring({
      supabase,
      supabaseUrl,
      auth,
      userId: user.id,
      signals: body.signals_input!,
      rubric: body.rubric_override!,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODES LEGACY + HYBRID — partagent la lecture signaux depuis DB
  // ─────────────────────────────────────────────────────────────────────────
  const ids = (body.signal_ids ?? []).slice(0, 30)
  const sourceTable = body.source_table ?? 'signals'

  // Pour signals_session, le filtre user_id n'est pas pertinent — RLS gère l'accès
  // côté table. On filtre par id uniquement et laissons RLS rejeter les non-autorisés.
  const signalsQuery = supabase
    .from(sourceTable)
    .select('id, source, title, raw_payload, signal_date, org_id, url, lang')
    .in('id', ids)

  if (mode === 'hybrid') {
    // Hybrid : on a déjà rubric_override, pas besoin de settings.
    const signalsRes = await signalsQuery
    if (signalsRes.error || !signalsRes.data) {
      const f = formatError(signalsRes.error)
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'llm:score-batch',
        status: 'error',
        payload: {
          stage: 'fetch_signals',
          mode,
          source_table: sourceTable,
          ids_count: ids.length,
          ...f,
        },
      })
      return json({ error: 'signals_not_found', detail: f.message }, 404)
    }

    const signalsInput: ScoredSignalInput[] = signalsRes.data.map((s) => ({
      id: s.id as string,
      source: s.source as string,
      url: (s.url as string | null) ?? undefined,
      title: (s.title as string | null) ?? undefined,
      raw_payload: (s.raw_payload as Record<string, unknown> | null) ?? undefined,
      lang: (s.lang as string | null) ?? undefined,
    }))

    return await handleAdHocOrHybridScoring({
      supabase,
      supabaseUrl,
      auth,
      userId: user.id,
      signals: signalsInput,
      rubric: body.rubric_override!,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE LEGACY — comportement historique inchangé
  // ─────────────────────────────────────────────────────────────────────────
  const [signalsRes, settingsRes] = await Promise.all([
    signalsQuery,
    supabase.from('settings').select('*').eq('user_id', user.id).single(),
  ])
  if (signalsRes.error || !signalsRes.data) {
    const f = formatError(signalsRes.error)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score-batch',
      status: 'error',
      payload: { stage: 'fetch_signals', ids_count: ids.length, ...f },
    })
    return json({ error: 'signals_not_found', detail: f.message }, 404)
  }
  if (settingsRes.error || !settingsRes.data) {
    const f = formatError(settingsRes.error)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score-batch',
      status: 'error',
      payload: { stage: 'fetch_settings', ...f },
    })
    return json({ error: 'settings_not_found', detail: f.message }, 404)
  }

  const signals = signalsRes.data
  const settings = settingsRes.data

  let scoringPrompt = settings.prompt_scoring ?? ''
  let criteriaBlock = ''
  if (settings.active_rubric_id) {
    const { data: rubric } = await supabase
      .from('scoring_rubrics')
      .select('*')
      .eq('id', settings.active_rubric_id)
      .single()
    if (rubric?.prompt) scoringPrompt = rubric.prompt
    if (rubric?.criteria && Array.isArray(rubric.criteria) && rubric.criteria.length > 0) {
      const lines = (rubric.criteria as ScoringCriterion[]).map(
        (c) => `- ${c.label} (poids ${c.weight})`,
      )
      criteriaBlock = `\nCriteres ponderes :\n${lines.join('\n')}\n`
    }
  }

  // Signaux en blocs délimités (contenu scrapé = UNTRUSTED, OWASP LLM01) :
  // extraction canonique + sanitization via _shared/signal-text.ts.
  const itemsBlock = signals
    .map((s) =>
      renderSignalBlock(
        {
          id: s.id,
          source: s.source,
          title: s.title,
          date: s.signal_date ? String(s.signal_date) : null,
          raw_payload: s.raw_payload,
        },
        500,
      ),
    )
    .join('\n\n')

  const systemPrompt = `${scoringPrompt}${criteriaBlock}
Tu vas scorer ${signals.length} signaux d'un coup. Pour CHAQUE signal, donne un score de 0 à 100 et une justification d'1 phrase courte.

${DATA_GUARD_FR}

${JSON_STRICT_GUARD_FR}
Format attendu :
{"scores":[{"id":"<uuid du signal>","score":<0-100>,"reasoning":"<1 phrase>"},...]}`

  const prompt = `Signaux à scorer :\n\n${itemsBlock}`

  // Determine if consensus mode is active
  const consensusModels: string[] = Array.isArray(settings.consensus_models)
    ? settings.consensus_models
    : []
  const isConsensusMode = consensusModels.length >= 2

  if (isConsensusMode) {
    // ─────────────────────────────────────────────────────────────────────
    // CONSENSUS MODE
    // ─────────────────────────────────────────────────────────────────────
    const knownIds = new Set(signals.map((s) => s.id))
    const orgId = signals[0]?.org_id as string | undefined

    const settled = await Promise.allSettled(
      consensusModels.map((modelSpec) =>
        callDispatchForModel(
          supabaseUrl,
          auth,
          systemPrompt,
          prompt,
          signals.length,
          modelSpec,
          knownIds,
        ),
      ),
    )

    const successResults: ConsensusScoreResult[] = settled
      .filter(
        (r): r is PromiseFulfilledResult<ConsensusScoreResult> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value)

    const failedCount = consensusModels.length - successResults.length

    if (successResults.length < 2) {
      let dispatchResult: DispatchResponse
      try {
        const dispatchRes = await fetch(`${supabaseUrl}/functions/v1/dispatch-llm`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'scoring',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            options: {
              max_tokens: Math.min(400 * signals.length, 8000),
              response_format: { type: 'json_object' },
              temperature: 0,
            },
          }),
        })
        dispatchResult = (await dispatchRes.json()) as DispatchResponse
      } catch (err) {
        const formatted = formatError(err)
        await supabase.from('logs').insert({
          user_id: user.id,
          action: 'llm:score-batch',
          status: 'error',
          payload: { stage: 'dispatch_fetch_fallback', count: signals.length, ...formatted },
        })
        return json({ error: 'dispatch_unreachable', ...formatted }, 502)
      }

      return await handleSingleDispatch(
        supabase,
        dispatchResult,
        signals,
        user.id,
        auth,
        supabaseUrl,
        prompt,
        orgId,
      )
    }

    const scoreRunsRows: Array<{
      signal_id: string
      org_id: string
      user_id: string
      model: string
      provider: string
      score: number
      reasoning: string | null
      prompt_tokens: number
      completion_tokens: number
      cost: number
      ts: string
    }> = []
    const now = new Date().toISOString()

    for (const result of successResults) {
      for (const sig of signals) {
        const v = result.scores.get(sig.id)
        if (!v) continue
        const sigOrgId = (sig.org_id as string | undefined) ?? orgId ?? ''
        scoreRunsRows.push({
          signal_id: sig.id,
          org_id: sigOrgId,
          user_id: user.id,
          model: result.model,
          provider: result.provider,
          score: v.score,
          reasoning: v.reasoning,
          prompt_tokens: Math.round(result.promptTokens / signals.length),
          completion_tokens: Math.round(result.completionTokens / signals.length),
          cost: result.cost / signals.length,
          ts: now,
        })
      }
    }

    if (scoreRunsRows.length > 0) {
      const { error: runsErr } = await supabase.from('score_runs').insert(scoreRunsRows)
      if (runsErr) {
        const f = formatError(runsErr)
        await supabase.from('logs').insert({
          user_id: user.id,
          action: 'llm:score-consensus',
          status: 'error',
          payload: { stage: 'db_insert_score_runs', count: scoreRunsRows.length, ...f },
        })
      }
    }

    const scoreRows: Array<{
      signal_id: string
      user_id: string
      score: number
      reasoning: string
      model_used: string
      cost: number
      score_consensus: number
      score_variance: number
      models_used: string[]
    }> = []

    let totalScored = 0
    for (const sig of signals) {
      const perModelScores = successResults
        .map((r) => r.scores.get(sig.id))
        .filter((v): v is { score: number; reasoning: string } => v !== undefined)

      if (perModelScores.length === 0) continue

      const scoreValues = perModelScores.map((v) => v.score)
      const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      const variance =
        scoreValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / scoreValues.length
      const modelsUsed = successResults.filter((r) => r.scores.has(sig.id)).map((r) => r.model)
      const totalCostForSignal = successResults.reduce(
        (acc, r) => acc + (r.scores.has(sig.id) ? r.cost / signals.length : 0),
        0,
      )
      const primaryReasoning = perModelScores[0].reasoning

      scoreRows.push({
        signal_id: sig.id,
        user_id: user.id,
        score: Math.round(mean),
        reasoning: primaryReasoning,
        model_used: modelsUsed[0] ?? 'consensus',
        cost: totalCostForSignal,
        score_consensus: Math.round(mean * 100) / 100,
        score_variance: Math.round(variance * 10000) / 10000,
        models_used: modelsUsed,
      })
      totalScored++
    }

    const { error: scoreErr } = await supabase
      .from('scores')
      .upsert(scoreRows, { onConflict: 'signal_id,user_id' })
    if (scoreErr) {
      const formatted = formatError(scoreErr)
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'llm:score-consensus',
        status: 'error',
        payload: {
          stage: 'db_upsert_scores',
          count: signals.length,
          ...formatted,
          summary: summarizeError(scoreErr),
        },
      })
      return json({ error: 'db_write_failed', ...formatted }, 500)
    }

    const totalCost = successResults.reduce((acc, r) => acc + r.cost, 0)

    const consensusScoredIds = scoreRows.map((r) => r.signal_id)
    const enrichPayloadConsensus = buildEnrichPayload(consensusScoredIds, orgId)
    let enrichTriggeredConsensus = false
    const enrichTriggeredAtConsensus = new Date().toISOString()
    if (enrichPayloadConsensus !== null) {
      enrichTriggeredConsensus = triggerEnrichSignal(supabaseUrl, auth, enrichPayloadConsensus)
    }

    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score-consensus',
      status: 'ok',
      payload: {
        count: signals.length,
        scored: totalScored,
        missed: signals.length - totalScored,
        models_requested: consensusModels.length,
        models_succeeded: successResults.length,
        models_failed: failedCount,
        models_used: successResults.map((r) => r.model),
        cost: totalCost,
        enrich_triggered: enrichTriggeredConsensus,
        enrichTriggeredAt: enrichTriggeredConsensus ? enrichTriggeredAtConsensus : null,
      },
    })

    return json(
      {
        batch_size: signals.length,
        scored: totalScored,
        missed: signals.length - totalScored,
        cost: totalCost,
        consensus: true,
        models_used: successResults.map((r) => r.model),
        models_failed: failedCount,
        enrich_triggered: enrichTriggeredConsensus,
      },
      200,
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // MODE STANDARD (1 modèle ou consensus_models vide)
  // ─────────────────────────────────────────────────────────────────────
  let dispatchResult: DispatchResponse
  try {
    const dispatchRes = await fetch(`${supabaseUrl}/functions/v1/dispatch-llm`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'scoring',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        options: {
          max_tokens: Math.min(400 * signals.length, 8000),
          response_format: { type: 'json_object' },
          temperature: 0,
        },
      }),
    })
    dispatchResult = (await dispatchRes.json()) as DispatchResponse
  } catch (err) {
    const formatted = formatError(err)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score-batch',
      status: 'error',
      payload: {
        stage: 'dispatch_fetch',
        count: signals.length,
        prompt_chars: prompt.length,
        ...formatted,
        summary: summarizeError(err),
      },
    })
    return json({ error: 'dispatch_unreachable', ...formatted }, 502)
  }

  const standardOrgId = signals[0]?.org_id as string | undefined
  return await handleSingleDispatch(
    supabase,
    dispatchResult,
    signals,
    user.id,
    auth,
    supabaseUrl,
    prompt,
    standardOrgId,
  )
}

// Guard so test runner can `import` this module without booting the listener.
if (import.meta.main) {
  Deno.serve(handler)
}

// =============================================================================
// Mode rubric_override — 3-couches scoring (hybrid + ad_hoc)
// =============================================================================

async function handleAdHocOrHybridScoring(args: {
  supabase: SupabaseClient
  supabaseUrl: string
  auth: string
  userId: string
  signals: ScoredSignalInput[]
  rubric: RubricOverride
}): Promise<Response> {
  const { supabase, supabaseUrl, auth, userId, signals, rubric } = args
  const dispatch = makeFetchDispatchCaller({ supabaseUrl, auth })

  // Limite par batch — éviter l'explosion de coût/latence
  const limited = signals.slice(0, 30)

  const startedAt = Date.now()
  const settled = await Promise.allSettled(
    limited.map((sig) => scoreSignalWithRubric({ signal: sig, rubric, dispatch })),
  )

  const results = settled
    .filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scoreSignalWithRubric>>> =>
        r.status === 'fulfilled',
    )
    .map((r) => r.value)

  const failedCount = settled.length - results.length
  const totalCost = results.reduce((acc, r) => acc + (r.cost ?? 0), 0)
  const disqualifiedCount = results.filter((r) => r.disqualified).length
  // Gates illisibles = neutralisées par défaut → tracer (faux négatifs sinon
  // invisibles, finding L99 C#4).
  const gateParseFailures = results.filter((r) => r.gate_parse_failed).length

  await supabase.from('logs').insert({
    user_id: userId,
    action: 'llm:score-rubric-override',
    status: gateParseFailures > 0 ? 'warning' : 'ok',
    payload: {
      mode: signals.length === limited.length ? 'no_truncation' : 'truncated_to_30',
      count: limited.length,
      scored: results.length,
      failed: failedCount,
      disqualified: disqualifiedCount,
      gate_parse_failures: gateParseFailures,
      cost: totalCost,
      duration_ms: Date.now() - startedAt,
    },
  })

  return json(
    {
      batch_size: limited.length,
      scored: results.length,
      failed: failedCount,
      disqualified: disqualifiedCount,
      cost: totalCost,
      results,
    },
    200,
  )
}

// =============================================================================
// Legacy single-dispatch handler (inchangé)
// =============================================================================

async function handleSingleDispatch(
  supabase: SupabaseClient,
  dispatchResult: DispatchResponse,
  signals: Array<{
    id: string
    source: string
    title: string | null
    raw_payload: unknown
    signal_date: string | null
  }>,
  userId: string,
  auth: string,
  supabaseUrl: string,
  _prompt: string,
  orgId?: string,
): Promise<Response> {
  if (!dispatchResult.ok) {
    const reason = dispatchResult.error ?? 'dispatch_failed'
    const detail = dispatchResult.detail
    await supabase.from('logs').insert({
      user_id: userId,
      action: 'llm:score-batch',
      status: 'error',
      payload: {
        stage: 'dispatch_call',
        count: signals.length,
        error: reason,
        detail,
        hint:
          reason === 'missing_api_key'
            ? 'Aucune cle API trouvee pour ce provider. Verifie Parametres -> Cles API.'
            : undefined,
      },
    })
    return json({ error: 'llm_failed', detail: detail ?? reason }, 502)
  }

  const dispatchModel = dispatchResult.model_used ?? 'unknown'
  const raw = dispatchResult.content ?? ''

  const usage = dispatchResult.usage
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const totalCost = usage?.cost ?? 0
  const costPerSignal = signals.length > 0 ? totalCost / signals.length : 0

  const validById = new Map<string, { score: number; reasoning: string }>()
  try {
    const entries = parseScoringResponse(raw)
    const knownIds = new Set(signals.map((s) => s.id))
    for (const e of entries) {
      if (!knownIds.has(e.id)) continue
      validById.set(e.id, { score: e.score, reasoning: e.reasoning })
    }
  } catch (err) {
    const reason = err instanceof ScoreParseError ? err.message : 'unknown_parse_error'
    await supabase.from('logs').insert({
      user_id: userId,
      action: 'llm-score-batch:parse_fail',
      status: 'error',
      payload: {
        stage: 'parse_response',
        count: signals.length,
        reason,
        model: dispatchModel,
        raw_preview: raw.slice(0, 2000),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    })
    // Coût déjà enregistré par dispatch-llm (péage unique, ADR 0010) — l'appel
    // LLM a bien eu lieu même si sa sortie est illisible.
    return json(
      {
        batch_size: signals.length,
        scored: 0,
        missed: signals.length,
        cost: totalCost,
        parse_failed: true,
        error: 'parse_failed',
        detail: reason,
      },
      200,
    )
  }

  const scoreRows = signals
    .filter((sig) => validById.has(sig.id))
    .map((sig) => {
      const v = validById.get(sig.id)!
      return {
        signal_id: sig.id,
        user_id: userId,
        score: v.score,
        reasoning: v.reasoning,
        model_used: dispatchModel,
        cost: costPerSignal,
      }
    })

  const { error: scoreErr } = await supabase
    .from('scores')
    .upsert(scoreRows, { onConflict: 'signal_id,user_id' })
  if (scoreErr) {
    const formatted = formatError(scoreErr)
    await supabase.from('logs').insert({
      user_id: userId,
      action: 'llm:score-batch',
      status: 'error',
      payload: {
        stage: 'db_upsert_scores',
        count: signals.length,
        ...formatted,
        summary: summarizeError(scoreErr),
      },
    })
    return json({ error: 'db_write_failed', ...formatted }, 500)
  }

  // Coût déjà enregistré par dispatch-llm (péage unique, ADR 0010).

  const scoredIds = scoreRows.map((r) => r.signal_id)
  const enrichPayload = buildEnrichPayload(scoredIds, orgId)
  let enrichTriggered = false
  const enrichTriggeredAt = new Date().toISOString()
  if (enrichPayload !== null) {
    enrichTriggered = triggerEnrichSignal(supabaseUrl, auth, enrichPayload)
  }

  await supabase.from('logs').insert({
    user_id: userId,
    action: 'llm:score-batch',
    status: 'ok',
    payload: {
      count: signals.length,
      scored: validById.size,
      missed: signals.length - validById.size,
      cost: totalCost,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      model: dispatchModel,
      enrich_triggered: enrichTriggered,
      enrichTriggeredAt: enrichTriggered ? enrichTriggeredAt : null,
    },
  })

  return json(
    {
      batch_size: signals.length,
      scored: validById.size,
      missed: signals.length - validById.size,
      cost: totalCost,
      enrich_triggered: enrichTriggered,
    },
    200,
  )
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
