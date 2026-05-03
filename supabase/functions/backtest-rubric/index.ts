import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_SIGNALS = 100

interface RequestBody {
  rubric_prompt: string
  criteria?: Array<{ label: string; weight: number }>
  max_signals?: number
}

interface BacktestResult {
  signal_id: string
  title: string
  current_score: number | null
  backtested_score: number
  delta: number
  reasoning_new: string
}

interface DispatchResponse {
  ok: boolean
  error?: string
  detail?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
}

interface SignalRow {
  id: string
  title: string | null
  raw_payload: Record<string, unknown> | null
}

interface ScoreRow {
  signal_id: string
  score: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ ok: false, error: 'invalid_token' }, 401)

  // Parse body
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body.rubric_prompt || typeof body.rubric_prompt !== 'string' || body.rubric_prompt.trim().length === 0) {
    return json({ ok: false, error: 'rubric_prompt_required' }, 400)
  }

  const limit = Math.min(
    typeof body.max_signals === 'number' && body.max_signals > 0 ? body.max_signals : MAX_SIGNALS,
    MAX_SIGNALS,
  )

  // Lookup org_id via organization_members
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const orgId: string | null = (membership as { org_id: string } | null)?.org_id ?? null

  // Concurrent lock via advisory lock
  // We use a raw SQL query via rpc to try pg_try_advisory_lock
  const lockKey = `backtest:${user.id}`
  const { data: lockData } = await supabase.rpc('pg_try_advisory_lock_text', { key: lockKey }).single()
    .catch(() => ({ data: null }))

  // Fallback: if rpc doesn't exist, use insert-based lock in logs
  let lockAcquired = false
  let usedRpcLock = false

  if (lockData !== null && lockData !== undefined) {
    lockAcquired = lockData === true || lockData === 1
    usedRpcLock = true
  } else {
    // Use advisory lock via raw query through a custom approach
    // Since pg_try_advisory_lock_text may not be exposed as RPC, use hashtext approach
    const { data: hashLock } = await supabase
      .rpc('backtest_try_lock', { p_user_id: user.id })
      .maybeSingle()
      .catch(() => ({ data: null }))

    if (hashLock !== null && hashLock !== undefined) {
      lockAcquired = hashLock === true || hashLock === 1
      usedRpcLock = true
    } else {
      // Final fallback: use a logs-based concurrency check (non-atomic but best-effort)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data: runningLog } = await supabase
        .from('logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('action', 'backtest:lock')
        .eq('status', 'running')
        .gte('ts', fiveMinutesAgo)
        .limit(1)
        .maybeSingle()

      if (runningLog) {
        return json({ ok: false, error: 'backtest_in_progress' }, 409)
      }

      // Insert lock marker
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'backtest:lock',
        status: 'running',
        payload: { started_at: new Date().toISOString() },
      })
      lockAcquired = true
    }
  }

  if (!lockAcquired) {
    return json({ ok: false, error: 'backtest_in_progress' }, 409)
  }

  const startedAt = Date.now()

  try {
    // Fetch signals from the last 30 days scoped to org (or user)
    let signalsQuery = supabase
      .from('signals')
      .select('id, title, raw_payload')
      .gte('scraped_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(limit)

    if (orgId) {
      signalsQuery = signalsQuery.eq('org_id', orgId)
    } else {
      signalsQuery = signalsQuery.eq('user_id', user.id)
    }

    const { data: signals, error: signalsErr } = await signalsQuery

    if (signalsErr) {
      const f = formatError(signalsErr)
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'backtest:run',
        status: 'error',
        payload: { stage: 'fetch_signals', ...f },
      })
      return json({ ok: false, error: 'signals_fetch_failed', detail: f.message }, 500)
    }

    const signalList = (signals ?? []) as SignalRow[]

    if (signalList.length === 0) {
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'backtest:run',
        status: 'complete',
        payload: { count: 0, duration_ms: Date.now() - startedAt },
      })
      return json({ ok: true, results: [] }, 200)
    }

    // Lookup current scores for these signals
    const signalIds = signalList.map((s) => s.id)
    let scoresQuery = supabase
      .from('scores')
      .select('signal_id, score')
      .in('signal_id', signalIds)

    if (orgId) {
      scoresQuery = scoresQuery.eq('org_id', orgId)
    } else {
      scoresQuery = scoresQuery.eq('user_id', user.id)
    }

    const { data: currentScores } = await scoresQuery
    const scoreMap = new Map<string, number>()
    for (const row of (currentScores ?? []) as ScoreRow[]) {
      scoreMap.set(row.signal_id, row.score)
    }

    // Build criteria block if provided
    let criteriaBlock = ''
    if (body.criteria && Array.isArray(body.criteria) && body.criteria.length > 0) {
      const lines = body.criteria.map((c) => `- ${c.label} (poids ${c.weight})`)
      criteriaBlock = `\nCriteres de scoring ponderes :\n${lines.join('\n')}\n`
    }

    // Score each signal with the new rubric (no persistence)
    const supabaseUrlEnv = Deno.env.get('SUPABASE_URL')!
    const results: BacktestResult[] = []

    for (const signal of signalList) {
      const userContent = `Title: ${signal.title ?? '(no title)'}\nPayload: ${JSON.stringify(signal.raw_payload ?? {}).slice(0, 2000)}`

      let dispatchResult: DispatchResponse
      try {
        const dispatchRes = await fetch(`${supabaseUrlEnv}/functions/v1/dispatch-llm`, {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task: 'scoring',
            messages: [
              { role: 'system', content: `${body.rubric_prompt}${criteriaBlock}` },
              { role: 'user', content: userContent },
            ],
            options: { max_tokens: 200 },
          }),
        })
        dispatchResult = (await dispatchRes.json()) as DispatchResponse
      } catch (err) {
        // On dispatch error for one signal, use score 0 and log
        const reason = err instanceof Error ? err.message : String(err)
        results.push({
          signal_id: signal.id,
          title: signal.title ?? '(no title)',
          current_score: scoreMap.get(signal.id) ?? null,
          backtested_score: 0,
          delta: 0 - (scoreMap.get(signal.id) ?? 0),
          reasoning_new: `dispatch_error: ${reason.slice(0, 100)}`,
        })
        continue
      }

      let backtested_score = 0
      let reasoning_new = '(no reasoning)'

      if (dispatchResult.ok && dispatchResult.content) {
        // Parse score using regex fallback as specified
        const match = dispatchResult.content.match(/score:?\s*(\d+)/i)
        if (match) {
          const parsed = parseInt(match[1], 10)
          backtested_score = Math.max(0, Math.min(100, isNaN(parsed) ? 0 : parsed))
        } else {
          // Try JSON parse
          try {
            const parsed = JSON.parse(dispatchResult.content)
            if (typeof parsed.score === 'number' && isFinite(parsed.score)) {
              backtested_score = Math.max(0, Math.min(100, Math.round(parsed.score)))
            }
            if (typeof parsed.reasoning === 'string') {
              reasoning_new = parsed.reasoning.slice(0, 1000)
            }
          } catch {
            backtested_score = 0
          }
        }
        // Try to extract reasoning from content
        if (reasoning_new === '(no reasoning)') {
          try {
            const parsed = JSON.parse(dispatchResult.content)
            if (typeof parsed.reasoning === 'string') {
              reasoning_new = parsed.reasoning.slice(0, 1000)
            }
          } catch {
            // Keep default
          }
        }
      }

      const current_score = scoreMap.get(signal.id) ?? null
      const delta = backtested_score - (current_score ?? backtested_score)

      results.push({
        signal_id: signal.id,
        title: signal.title ?? '(no title)',
        current_score,
        backtested_score,
        delta,
        reasoning_new,
      })
    }

    const duration = Date.now() - startedAt

    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'backtest:run',
      status: 'complete',
      payload: { count: results.length, duration_ms: duration },
    })

    return json({ ok: true, results }, 200)
  } finally {
    if (usedRpcLock) {
      // Release advisory lock if acquired via RPC
      await supabase.rpc('pg_advisory_unlock_text', { key: lockKey }).catch(() => {})
    } else {
      // Clean up log-based lock
      await supabase
        .from('logs')
        .delete()
        .eq('user_id', user.id)
        .eq('action', 'backtest:lock')
        .eq('status', 'running')
        .catch(() => {})
    }
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
