import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatError, summarizeError } from '../_shared/errors.ts'
import { parseScoringResponse, ScoreParseError } from '../_shared/parse-score.ts'

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

Deno.serve(async (req) => {
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
    supabase.from('signals').select('id, source, title, raw_payload, signal_date').in('id', ids),
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

  if (!dispatchResult.ok) {
    const reason = dispatchResult.error ?? 'dispatch_failed'
    const detail = dispatchResult.detail
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score-batch',
      status: 'error',
      payload: {
        stage: 'dispatch_call',
        count: signals.length,
        prompt_chars: prompt.length,
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
      user_id: user.id,
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
    return json({ error: 'parse_failed', detail: reason }, 502)
  }

  // Critical : do NOT insert placeholder rows for missed signals. A row
  // with score=0 used to be written for every absent id, which polluted
  // the dashboard with false-positive zeros. Missed ids stay unscored
  // (visible in the UI as "—") and remain eligible for the next run via
  // the `unscored_signals` RPC.
  const scoreRows = signals
    .filter((sig) => validById.has(sig.id))
    .map((sig) => {
      const v = validById.get(sig.id)!
      return {
        signal_id: sig.id,
        user_id: user.id,
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
      user_id: user.id,
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
    user_id: user.id,
    task: 'scoring',
    model: dispatchModel,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost: totalCost,
  })

  await supabase.from('logs').insert({
    user_id: user.id,
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
    },
  })

  return json(
    {
      batch_size: signals.length,
      scored: validById.size,
      missed: signals.length - validById.size,
      cost: totalCost,
    },
    200,
  )
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
