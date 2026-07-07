import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildInternalHeaders,
  internalServiceClient,
  resolveCaller,
  resolveOrgId,
} from '../_shared/internal-auth.ts'
import { parseScoreResponse } from './parse-single.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  signal_id: string
}

interface ScoringCriterion {
  label: string
  weight: number
}

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
  provider_used?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  // Auth dual-mode (ADR 0009) : JWT user OU appel interne (run-pipeline cron)
  const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: auth ? { Authorization: auth } : {} },
  })
  const caller = await resolveCaller(userScoped, req)
  if (!caller.ok) return json({ error: caller.error }, 401)
  const userId = caller.userId
  const supabase = caller.mode === 'internal' ? internalServiceClient(createClient) : userScoped

  // org explicite : les DEFAULT SQL reposent sur auth.uid(), nul en service_role
  const orgId = await resolveOrgId(supabase, userId)

  // Vers dispatch-llm : propager le mode (le Bearer service_role ne passe pas getUser)
  const dispatchHeaders: Record<string, string> =
    caller.mode === 'internal'
      ? buildInternalHeaders(userId)
      : { Authorization: auth ?? '', 'Content-Type': 'application/json' }

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
    supabase.from('signals').select('*').eq('id', body.signal_id).eq('user_id', userId).single(),
    supabase.from('settings').select('*').eq('user_id', userId).single(),
  ])
  if (signalRes.error || !signalRes.data) return json({ error: 'signal_not_found' }, 404)
  if (settingsRes.error || !settingsRes.data) return json({ error: 'settings_not_found' }, 404)

  const signal = signalRes.data
  const settings = settingsRes.data

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

  let dispatchResult: DispatchResponse
  try {
    const dispatchRes = await fetch(`${supabaseUrl}/functions/v1/dispatch-llm`, {
      method: 'POST',
      headers: dispatchHeaders,
      body: JSON.stringify({
        task: 'scoring',
        messages: [{ role: 'user', content: prompt }],
        options: {
          max_tokens: 200,
          response_format: { type: 'json_object' },
        },
      }),
    })
    dispatchResult = (await dispatchRes.json()) as DispatchResponse
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'llm:score',
      status: 'error',
      payload: { signal_id: body.signal_id, error: reason, stage: 'dispatch_fetch' },
    })
    return json({ error: 'dispatch_unreachable', detail: reason }, 502)
  }

  if (!dispatchResult.ok) {
    const reason = dispatchResult.error ?? 'dispatch_failed'
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'llm:score',
      status: 'error',
      payload: { signal_id: body.signal_id, error: reason },
    })
    return json({ error: 'llm_failed', detail: reason }, 502)
  }

  const raw = dispatchResult.content ?? '{}'
  const { score, reasoning } = parseScoreResponse(raw)

  // Score illisible → on NE crée PAS de row score=0 (faux positif qui pollue le
  // dashboard et sort le signal de unscored_signals). On loggue et on skip :
  // le signal reste récupérable par le prochain run de scoring.
  if (score === null) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'llm-score:parse_fail',
      status: 'error',
      payload: { signal_id: body.signal_id, raw_preview: raw.slice(0, 2000) },
    })
    return json({ signal_id: body.signal_id, skipped: true, reason: 'parse_fail' }, 200)
  }

  const usage = dispatchResult.usage
  const cost = usage?.cost ?? 0
  const modelUsed = dispatchResult.model_used ?? 'unknown'

  // Coût déjà enregistré par dispatch-llm (péage unique, ADR 0010).
  const scoreInsert = await supabase.from('scores').upsert(
    {
      signal_id: body.signal_id,
      user_id: userId,
      org_id: orgId,
      score,
      reasoning,
      model_used: modelUsed,
      cost,
    },
    { onConflict: 'signal_id,user_id' },
  )
  if (scoreInsert.error) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'llm:score',
      status: 'error',
      payload: {
        signal_id: body.signal_id,
        score_err: scoreInsert.error.message,
      },
    })
    return json({ error: 'db_write_failed' }, 500)
  }

  return json({ signal_id: body.signal_id, score, reasoning, cost }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
