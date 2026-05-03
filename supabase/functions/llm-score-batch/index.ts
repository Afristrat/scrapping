import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatError, summarizeError } from '../_shared/errors.ts'
import { parseScoringResponse, ScoreParseError } from '../_shared/parse-score.ts'
import { buildEnrichPayload, triggerEnrichSignal } from './enrich-trigger.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  signal_ids: string[]
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

/**
 * Appelle dispatch-llm pour un modèle donné (format "provider:model_id").
 * Retourne null si l'appel échoue (pour Promise.allSettled).
 */
async function callDispatchForModel(
  supabaseUrl: string,
  auth: string,
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
        // Pass provider+model override so dispatch-llm uses the right model
        provider_override: provider,
        model_override: modelId,
        messages: [{ role: 'user', content: prompt }],
        options: {
          max_tokens: Math.min(400 * signalCount, 8000),
          response_format: { type: 'json_object' },
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

Deno.serve(async (req) => {
  // HTTP 204 « No Content » INTERDIT un body — `json({...}, 204)` crashait
  // Cloudflare/Deno avec un 500 silencieux au preflight, le navigateur recevait
  // « Failed to fetch ». Retour Response sans body avec headers CORS uniquement.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!Array.isArray(body.signal_ids) || body.signal_ids.length === 0)
    return json({ error: 'signal_ids_required' }, 400)

  const ids = body.signal_ids.slice(0, 30)

  const [signalsRes, settingsRes] = await Promise.all([
    supabase
      .from('signals')
      .select('id, source, title, raw_payload, signal_date, org_id')
      .in('id', ids),
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

  const itemsBlock = signals
    .map((s, i) => {
      const p = s.raw_payload as Record<string, unknown>
      const summary = p?.summary ?? p?.selftext ?? p?.text ?? ''
      const datePart = s.signal_date ? `[${String(s.signal_date).slice(0, 10)}] ` : ''
      return `[${i + 1}] id=${s.id} | source=${s.source} ${datePart}\n   Titre: ${s.title ?? '(sans titre)'}\n   Extrait: ${String(summary).slice(0, 500)}`
    })
    .join('\n\n')

  const prompt = `${scoringPrompt}${criteriaBlock}\nTu vas scorer ${signals.length} signaux d'un coup. Pour CHAQUE signal, donne un score de 0 a 100 et une justification d'1 phrase courte.\n\nReponds en JSON strict (et UNIQUEMENT en JSON) :\n{"scores":[{"id":"<uuid du signal>","score":<0-100>,"reasoning":"<1 phrase>"},...]}\n\nSignaux a scorer :\n\n${itemsBlock}`

  // Determine if consensus mode is active
  const consensusModels: string[] = Array.isArray(settings.consensus_models)
    ? settings.consensus_models
    : []
  const isConsensusMode = consensusModels.length >= 2

  if (isConsensusMode) {
    // ─────────────────────────────────────────────────────────────────────
    // CONSENSUS MODE : score chaque signal avec N modèles en parallèle
    // ─────────────────────────────────────────────────────────────────────
    const knownIds = new Set(signals.map((s) => s.id))
    const orgId = signals[0]?.org_id as string | undefined

    // Lancer tous les appels dispatch en parallèle
    const settled = await Promise.allSettled(
      consensusModels.map((modelSpec) =>
        callDispatchForModel(supabaseUrl, auth, prompt, signals.length, modelSpec, knownIds),
      ),
    )

    const successResults: ConsensusScoreResult[] = settled
      .filter(
        (r): r is PromiseFulfilledResult<ConsensusScoreResult> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value)

    const failedCount = consensusModels.length - successResults.length

    // Fallback si moins de 2 modèles ont réussi
    if (successResults.length < 2) {
      // On utilise le comportement original (dispatch-llm standard)
      let dispatchResult: DispatchResponse
      try {
        const dispatchRes = await fetch(`${supabaseUrl}/functions/v1/dispatch-llm`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'scoring',
            messages: [{ role: 'user', content: prompt }],
            options: {
              max_tokens: Math.min(400 * signals.length, 8000),
              response_format: { type: 'json_object' },
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

    // Insérer les score_runs individuels pour chaque modèle ayant réussi
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

    // Calculer consensus + variance par signal
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
      // Reasoning from the first model that scored this signal
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

    // Déclencher enrich-signal best-effort après scoring consensus
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
        messages: [{ role: 'user', content: prompt }],
        options: {
          max_tokens: Math.min(400 * signals.length, 8000),
          response_format: { type: 'json_object' },
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
})

/**
 * Gère le flow standard (1 seul modèle) depuis la réponse dispatch-llm.
 */
async function handleSingleDispatch(
  supabase: ReturnType<typeof createClient>,
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
    await supabase.from('llm_costs').insert({
      user_id: userId,
      task: 'scoring',
      model: dispatchModel,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost: totalCost,
    })
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

  await supabase.from('llm_costs').insert({
    user_id: userId,
    task: 'scoring',
    model: dispatchModel,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost: totalCost,
  })

  // Déclencher enrich-signal best-effort après scoring standard
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
