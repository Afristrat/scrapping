import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SCORE_LIMIT = 50
const SCORE_CONCURRENCY = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const startedAt = Date.now()

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  const { data: settings, error: settingsErr } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (settingsErr || !settings) return json({ error: 'settings_not_found' }, 404)

  const base = Deno.env.get('SUPABASE_URL')!
  const headers = { Authorization: auth, 'Content-Type': 'application/json' }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'pipeline:run',
    status: 'start',
    payload: {},
  })

  // Phase 1 - scrape parallele (X et Reddit via Apify, ArXiv inchange, RSS natif)
  const scrapePromises = [
    callScraper('scraper-reddit', { subs: settings.reddit_subs ?? [] }, base, headers),
    callScraper('scraper-arxiv', { categories: settings.arxiv_categories ?? [] }, base, headers),
    callScraper('scraper-x', { listIds: settings.apify_config?.x_list_ids ?? [] }, base, headers),
    callScraper(
      'scraper-rss',
      { org_id: (settings as unknown as { org_id?: string }).org_id ?? user.id },
      base,
      headers,
    ),
  ]
  const scrapeResults = await Promise.allSettled(scrapePromises)
  const scrapeSummary = scrapeResults.map((r, i) => ({
    name: ['reddit', 'arxiv', 'x', 'rss'][i],
    status: r.status,
    value: r.status === 'fulfilled' ? r.value : null,
    reason: r.status === 'rejected' ? String(r.reason) : null,
  }))

  // Phase 2 - signaux non scores (RPC)
  const { data: unscored, error: rpcErr } = await supabase.rpc('unscored_signals', {
    lim: SCORE_LIMIT,
  })
  if (rpcErr) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'pipeline:run',
      status: 'error',
      payload: { phase: 'unscored_query', error: rpcErr.message },
    })
    return json({ error: 'unscored_query_failed', detail: rpcErr.message }, 500)
  }

  const ids = (unscored ?? []).map((r: { id: string }) => r.id)
  const scrapeMs = Date.now() - startedAt

  // Phase 3 - scoring en BACKGROUND (waitUntil) pour ne pas bloquer la réponse
  // -> côté client, le bouton revient vite ; les scores apparaissent dans le dashboard au fur et à mesure (refresh).
  const scoringTask = scoreInBackground({
    ids,
    base,
    headers,
    supabase,
    userId: user.id,
    scrapeSummary,
    scrapeMs,
  })

  // EdgeRuntime.waitUntil étend l'exécution au-delà de la response
  // (disponible dans Supabase Edge Runtime, sinon fallback à un fire-and-forget non-tracké)
  const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (er?.waitUntil) er.waitUntil(scoringTask)

  return json(
    {
      scrape: scrapeSummary,
      scoring: 'in_progress',
      to_score: ids.length,
      duration_ms: scrapeMs,
    },
    202,
  )
})

async function scoreInBackground(opts: {
  ids: string[]
  base: string
  headers: Record<string, string>
  supabase: ReturnType<typeof createClient>
  userId: string
  scrapeSummary: unknown
  scrapeMs: number
}) {
  const { ids, base, headers, supabase, userId, scrapeSummary, scrapeMs } = opts
  const t0 = Date.now()
  let scored = 0
  let failed = 0

  for (let i = 0; i < ids.length; i += SCORE_CONCURRENCY) {
    const batch = ids.slice(i, i + SCORE_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map((id) =>
        fetch(`${base}/functions/v1/llm-score`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ signal_id: id }),
        }).then(async (r) => {
          if (!r.ok) throw new Error(`http_${r.status}`)
          return r.json()
        }),
      ),
    )
    scored += results.filter((r) => r.status === 'fulfilled').length
    failed += results.filter((r) => r.status === 'rejected').length
  }

  const scoreMs = Date.now() - t0

  // Topic classification (fire-and-forget — non-bloquant)
  if (ids.length > 0) {
    fetch(`${base}/functions/v1/topic-classifier`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        signal_ids: ids,
        run_at: new Date().toISOString(),
      }),
    }).catch(() => {
      // Erreurs déjà loggées par topic-classifier
    })
  }

  await supabase.from('logs').insert({
    user_id: userId,
    action: 'pipeline:run',
    status: 'ok',
    payload: {
      scrape: scrapeSummary,
      scored,
      failed,
      total: ids.length,
      scrape_ms: scrapeMs,
      score_ms: scoreMs,
    },
  })
}

async function callScraper(
  name: string,
  body: unknown,
  base: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const r = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${name}_http_${r.status}`)
  return await r.json()
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
