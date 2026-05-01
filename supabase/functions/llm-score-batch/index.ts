import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { formatError, summarizeError } from '../_shared/errors.ts'
import { getProviderConfig, type ProviderId } from '../_shared/providers.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const PRICE_FALLBACK_PER_1K: Record<string, { in: number; out: number }> = {
  'anthropic/claude-haiku-4.5': { in: 0.001, out: 0.005 },
  'openrouter/auto': { in: 0.002, out: 0.006 },
}

interface RequestBody {
  signal_ids: string[]
}
interface ScoringCriterion {
  label: string
  weight: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  // Provider+model resolution happens after we load settings (below).

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

  const taskCfg = (
    (settings as { model_config?: Record<string, { provider: string; model: string } | null> })
      .model_config ?? {}
  )['scoring']
  const providerId: ProviderId = (taskCfg?.provider as ProviderId | undefined) ?? 'openrouter'
  const legacyModel = (settings as { model_scoring?: string | null }).model_scoring ?? null
  const dispatchModel: string =
    taskCfg?.model || legacyModel || 'openrouter/auto'
  const providerCfg = getProviderConfig(providerId)
  if (!providerCfg) return json({ error: 'unknown_provider', provider: providerId }, 500)

  const apiKey = await getUserApiKey(supabase, user.id, providerId)
  if (!apiKey && providerCfg.modelsRequiresAuth) {
    return json(
      { error: 'missing_api_key', provider: providerId },
      500,
    )
  }

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

  const client = new OpenAI({
    baseURL: providerCfg.baseURL,
    apiKey: apiKey ?? 'not-required',
    defaultHeaders: {
      ...(providerCfg.extraHeaders ?? {}),
      'HTTP-Referer': 'https://theresa-scrap.local',
      'X-Title': 'theresa-scrap-batch',
    },
  })

  let completion
  try {
    completion = await client.chat.completions.create({
      model: dispatchModel,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: Math.min(400 * signals.length, 8000),
    })
  } catch (err) {
    const formatted = formatError(err)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score-batch',
      status: 'error',
      payload: {
        stage: 'openrouter_call',
        count: signals.length,
        model: dispatchModel,
        prompt_chars: prompt.length,
        ...formatted,
        summary: summarizeError(err),
        hint:
          formatted.status === 401
            ? 'OpenRouter rejette la cle. Verifie Parametres -> Cles API et la validite sur openrouter.ai/keys.'
            : formatted.hint,
      },
    })
    return json({ error: 'openrouter_failed', ...formatted }, 502)
  }

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let parsed: { scores?: Array<{ id: string; score: number; reasoning: string }> }
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }

  const usage = completion.usage as
    | { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    | undefined
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const totalCost =
    usage?.cost ?? estimateCost(dispatchModel, promptTokens, completionTokens)
  const costPerSignal = signals.length > 0 ? totalCost / signals.length : 0

  const validById = new Map<string, { score: number; reasoning: string }>()
  for (const s of parsed.scores ?? []) {
    if (typeof s.id !== 'string' || !signals.find((x) => x.id === s.id)) continue
    const score = Math.max(0, Math.min(100, Number(s.score) || 0))
    const reasoning = typeof s.reasoning === 'string' ? s.reasoning.slice(0, 1000) : ''
    validById.set(s.id, { score, reasoning })
  }

  const scoreRows = signals.map((sig) => {
    const v = validById.get(sig.id) ?? { score: 0, reasoning: '(LLM batch missed this signal)' }
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

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const price = PRICE_FALLBACK_PER_1K[model]
  if (!price) return 0
  return (promptTokens * price.in + completionTokens * price.out) / 1000
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
