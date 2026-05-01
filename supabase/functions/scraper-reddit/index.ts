import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { isQualitySignal } from '../_shared/filter.ts'

const SUBS_PER_CHUNK = 6

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_REDDIT_ACTOR = 'automation-lab/reddit-scraper'
const DEFAULT_SORT = 'top'
const DEFAULT_TIME_FILTER = 'week'
const DEFAULT_MAX_PER_SUB = 25

interface RequestBody {
  subs?: string[]
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return json({ error: 'invalid_token' }, 401)

  // Body (subs optional, overrides settings)
  let body: RequestBody = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine, we read from settings
  }

  // Settings
  const { data: settings } = await supabase
    .from('settings')
    .select('reddit_subs, apify_config')
    .eq('user_id', user.id)
    .single()

  const subs: string[] = body.subs ?? settings?.reddit_subs ?? []
  if (!Array.isArray(subs) || subs.length === 0) {
    return json(
      { error: 'subs_required', detail: 'No subreddits found in body or settings.reddit_subs' },
      400,
    )
  }

  const apifyConfig = settings?.apify_config ?? {}
  const redditActor = apifyConfig.reddit_actor ?? DEFAULT_REDDIT_ACTOR
  const sort = apifyConfig.reddit_sort ?? DEFAULT_SORT
  const timeFilter = apifyConfig.reddit_time_filter ?? DEFAULT_TIME_FILTER
  const maxPerSub = apifyConfig.reddit_max_per_sub ?? DEFAULT_MAX_PER_SUB

  // Apify token: user key > env fallback > degraded
  const apifyToken = await getUserApiKey(supabase, user.id, 'apify')
  if (!apifyToken) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'scrape:reddit',
      status: 'degraded',
      payload: {
        reason: 'no_apify_key',
        detail: 'No Apify key in user_api_keys and no APIFY_TOKEN env var',
      },
    })
    return json({ fetched: 0, inserted: 0, errors: [{ reason: 'no_apify_key' }] }, 200)
  }

  // Log start
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:reddit',
    status: 'start',
    payload: { subs, sort, timeFilter, maxPerSub, actor: redditActor },
  })

  let fetched = 0
  let inserted = 0
  const errors: Array<{ reason: string }> = []

  // Split subs in chunks to keep each Apify run under timeout budget
  const chunks: string[][] = []
  for (let i = 0; i < subs.length; i += SUBS_PER_CHUNK) {
    chunks.push(subs.slice(i, i + SUBS_PER_CHUNK))
  }

  const actorSlug = redditActor.replace('/', '~')
  const apifyUrl = `https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${apifyToken}`
  const allRows: Array<Record<string, unknown>> = []

  for (const chunk of chunks) {
    try {
      const urls = chunk.map((sub) => `https://www.reddit.com/r/${sub}/`)
      const resp = await fetch(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          sort,
          timeFilter,
          maxPostsPerSource: maxPerSub,
          includeComments: false,
          deduplicatePosts: true,
        }),
        signal: AbortSignal.timeout(50000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`apify_http_${resp.status}: ${text.slice(0, 300)}`)
      }

      const posts = (await resp.json()) as Array<Record<string, unknown>>
      fetched += posts.length

      const rows = posts
        .map((post) => {
          const externalId = String(post.id ?? post.permalink ?? '')
          const permalink = post.permalink as string | undefined
          const createdAt = (post.createdAt ?? post.created_at) as string | undefined
          const createdUtc = post.created_utc as number | string | undefined
          let signalDate: string | null = null
          if (createdAt) signalDate = safeIsoDate(createdAt)
          else if (createdUtc != null) {
            const sec = typeof createdUtc === 'number' ? createdUtc : Number(createdUtc)
            if (Number.isFinite(sec)) signalDate = new Date(sec * 1000).toISOString()
          }
          return {
            user_id: user.id,
            source: 'reddit' as const,
            external_id: externalId,
            url: (post.url as string) ?? (permalink ? `https://reddit.com${permalink}` : ''),
            title: String(post.title ?? ''),
            raw_payload: post,
            signal_date: signalDate,
          }
        })
        .filter((r) => r.external_id !== '')
        .filter((r) =>
          isQualitySignal({ title: r.title, raw_payload: r.raw_payload, source: 'reddit' }),
        )

      allRows.push(...rows)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ reason: `chunk[${chunk.join(',')}]: ${reason}` })
    }
  }

  if (allRows.length > 0) {
    const { data: upserted, error: upErr } = await supabase
      .from('signals')
      .upsert(allRows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: false })
      .select('id')
    if (upErr) errors.push({ reason: `db_upsert: ${upErr.message}` })
    else inserted = upserted?.length ?? 0
  }

  // Log end (include error reasons for debugging)
  const finalStatus = inserted > 0 ? 'ok' : errors.length > 0 ? 'error' : 'degraded'
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:reddit',
    status: finalStatus,
    payload: { fetched, inserted, errors, subs, chunks: chunks.length },
  })

  return json({ fetched, inserted, errors }, 200)
})

function safeIsoDate(input: string): string | null {
  const d = new Date(input)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
