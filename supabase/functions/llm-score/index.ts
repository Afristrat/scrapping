import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { retryWithBackoff } from '../_shared/retry.ts'
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
  signal_id: string
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

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body.signal_id || typeof body.signal_id !== 'string') {
    return json({ error: 'signal_id_required' }, 400)
  }

  const [signalRes, settingsRes] = await Promise.all([
    supabase.from('signals').select('*').eq('id', body.signal_id).single(),
    supabase.from('settings').select('*').eq('user_id', user.id).single(),
  ])
  if (signalRes.error || !signalRes.data) return json({ error: 'signal_not_found' }, 404)
  if (settingsRes.error || !settingsRes.data) return json({ error: 'settings_not_found' }, 404)

  const signal = signalRes.data
  const settings = settingsRes.data

  // Resolve provider + model from BYOK model_config (preferred) or legacy model_scoring
  const taskCfg = (settings.model_config as Record<string, { provider: string; model: string } | null> | null)
    ?.scoring
  const providerId: ProviderId = (taskCfg?.provider as ProviderId | undefined) ?? 'openrouter'
  const legacyModel = (settings as { model_scoring?: string | null }).model_scoring ?? null
  const modelId: string = taskCfg?.model || legacyModel || 'openrouter/auto'
  const providerCfg = getProviderConfig(providerId)
  if (!providerCfg) return json({ error: 'unknown_provider', provider: providerId }, 500)

  const apiKey = await getUserApiKey(supabase, user.id, providerId)
  if (!apiKey && providerCfg.modelsRequiresAuth)
    return json(
      { error: 'missing_api_key', provider: providerId },
      500,
    )

  // Resolve rubric: active rubric > settings.prompt_scoring fallback
  let scoringPrompt = settings.prompt_scoring ?? ''
  let criteriaBlock = ''

  if (settings.active_rubric_id) {
    const { data: rubric } = await supabase
      .from('scoring_rubrics')
      .select('*')
      .eq('id', settings.active_rubric_id)
      .single()

    if (rubric?.prompt) {
      scoringPrompt = rubric.prompt
    }

    if (rubric?.criteria && Array.isArray(rubric.criteria) && rubric.criteria.length > 0) {
      const lines = (rubric.criteria as ScoringCriterion[]).map(
        (c) => `- ${c.label} (poids ${c.weight})`,
      )
      criteriaBlock = `\nCriteres de scoring ponderes :\n${lines.join('\n')}\n`
    }
  }

  const prompt = `${scoringPrompt}${criteriaBlock}
Signal:
Source: ${signal.source}
Title: ${signal.title ?? '(no title)'}
Payload: ${JSON.stringify(signal.raw_payload).slice(0, 4000)}

Reponds en JSON strict : {"score": <0-100>, "reasoning": "<1 phrase>"}`

  const client = new OpenAI({
    baseURL: providerCfg.baseURL,
    apiKey: apiKey ?? 'not-required',
    defaultHeaders: {
      ...(providerCfg.extraHeaders ?? {}),
      'HTTP-Referer': 'https://zlatan-scrap.local',
      'X-Title': 'zlatan-scrap',
    },
  })

  let completion
  try {
    completion = await retryWithBackoff(
      () =>
        client.chat.completions.create({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 200,
        }),
      { maxAttempts: 5, baseDelayMs: 1500 },
    )
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score',
      status: 'error',
      payload: { signal_id: body.signal_id, error: reason },
    })
    return json({ error: 'llm_failed', provider: providerId, detail: reason }, 502)
  }

  const raw = completion.choices[0]?.message?.content ?? '{}'
  const { score, reasoning } = parseScoreResponse(raw)

  const usage = completion.usage as
    | { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    | undefined
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const cost = usage?.cost ?? estimateCost(modelId, promptTokens, completionTokens)

  const [scoreInsert, costInsert] = await Promise.all([
    supabase.from('scores').upsert(
      {
        signal_id: body.signal_id,
        user_id: user.id,
        score,
        reasoning,
        model_used: modelId,
        cost,
      },
      { onConflict: 'signal_id,user_id' },
    ),
    supabase.from('llm_costs').insert({
      user_id: user.id,
      task: 'scoring',
      model: modelId,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    }),
  ])
  if (scoreInsert.error || costInsert.error) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score',
      status: 'error',
      payload: {
        signal_id: body.signal_id,
        score_err: scoreInsert.error?.message,
        cost_err: costInsert.error?.message,
      },
    })
    return json({ error: 'db_write_failed' }, 500)
  }

  return json({ signal_id: body.signal_id, score, reasoning, cost }, 200)
})

function parseScoreResponse(raw: string): { score: number; reasoning: string } {
  try {
    const parsed = JSON.parse(raw)
    const rawScore = Number(parsed.score)
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0
    const reasoning =
      typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 1000) : '(no reasoning)'
    return { score, reasoning }
  } catch {
    return { score: 0, reasoning: '(invalid LLM output)' }
  }
}

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
