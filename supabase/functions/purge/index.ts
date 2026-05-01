import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type PurgeScope = 'signals' | 'all'

interface RequestBody {
  scope: PurgeScope
  confirm: boolean
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

  if (!body.confirm) return json({ error: 'confirmation_required' }, 400)
  if (body.scope !== 'signals' && body.scope !== 'all') {
    return json({ error: 'invalid_scope', detail: 'scope must be "signals" or "all"' }, 400)
  }

  const counts: Record<string, number> = {}

  // signals : suppression cascade scores via FK
  const sig = await supabase.from('signals').delete({ count: 'exact' }).eq('user_id', user.id)
  if (sig.error) return json({ error: 'delete_signals_failed', detail: sig.error.message }, 500)
  counts.signals = sig.count ?? 0

  if (body.scope === 'all') {
    const logs = await supabase.from('logs').delete({ count: 'exact' }).eq('user_id', user.id)
    if (logs.error) return json({ error: 'delete_logs_failed', detail: logs.error.message }, 500)
    counts.logs = logs.count ?? 0

    const costs = await supabase.from('llm_costs').delete({ count: 'exact' }).eq('user_id', user.id)
    if (costs.error) return json({ error: 'delete_costs_failed', detail: costs.error.message }, 500)
    counts.llm_costs = costs.count ?? 0
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'purge',
    status: 'ok',
    payload: { scope: body.scope, counts },
  })

  return json({ scope: body.scope, counts }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
