import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { isQualitySignal } from '../_shared/filter.ts'
import { buildSessionRow, isSessionMode, parseSessionRouting } from '../_shared/session-routing.ts'

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
  // K03 — routage session (optionnel, rétrocompat préservée)
  target_table?: 'signals' | 'signals_session'
  session_id?: string
  created_by_api_key?: string
  ttl_hours?: number
  /** Mode session : token Apify direct (Bassira injecte sa clé). */
  apify_token?: string
  /** Mode session : override Reddit actor / sort / timeFilter / maxPerSub. */
  reddit_actor?: string
  sort?: string
  time_filter?: string
  max_per_sub?: number
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Body
  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    // empty body is fine, we read from settings
  }

  // Routage signals vs signals_session (K03)
  const routing = parseSessionRouting(body)
  if (!routing.ok) return json({ error: routing.error, detail: routing.detail }, routing.status)
  const sessionMode = isSessionMode(routing.config)

  // SupabaseClient sans generic Database évite les conflits entre modes
  // session/legacy (cf. pattern _shared/api-keys.ts).
  let supabase: SupabaseClient
  let userId: string | null = null
  let subs: string[] = []
  let redditActor: string = DEFAULT_REDDIT_ACTOR
  let sort: string = DEFAULT_SORT
  let timeFilter: string = DEFAULT_TIME_FILTER
  let maxPerSub: number = DEFAULT_MAX_PER_SUB
  let apifyToken: string | null = null

  if (sessionMode) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'service_role_env_missing' }, 500)
    }
    supabase = createClient(supabaseUrl, serviceKey)

    if (!Array.isArray(body.subs) || body.subs.length === 0) {
      return json(
        {
          error: 'subs_required',
          detail: 'target_table=signals_session requires a non-empty subs[] in body',
        },
        400,
      )
    }
    subs = body.subs
    redditActor = body.reddit_actor ?? DEFAULT_REDDIT_ACTOR
    sort = body.sort ?? DEFAULT_SORT
    timeFilter = body.time_filter ?? DEFAULT_TIME_FILTER
    maxPerSub = body.max_per_sub ?? DEFAULT_MAX_PER_SUB
    apifyToken = body.apify_token ?? Deno.env.get('APIFY_TOKEN') ?? null
    if (!apifyToken) {
      return json(
        {
          error: 'apify_token_required',
          detail: 'target_table=signals_session requires apify_token in body or APIFY_TOKEN env',
        },
        400,
      )
    }
  } else {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'missing_authorization' }, 401)

    supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) return json({ error: 'invalid_token' }, 401)
    userId = user.id

    // Settings
    const { data: settings } = await supabase
      .from('settings')
      .select('reddit_subs, apify_config')
      .eq('user_id', user.id)
      .single()

    const settingsRow = settings as {
      reddit_subs?: string[]
      apify_config?: Record<string, unknown>
    } | null
    subs = body.subs ?? settingsRow?.reddit_subs ?? []
    if (!Array.isArray(subs) || subs.length === 0) {
      return json(
        { error: 'subs_required', detail: 'No subreddits found in body or settings.reddit_subs' },
        400,
      )
    }

    const apifyConfig = settingsRow?.apify_config ?? {}
    redditActor = (apifyConfig.reddit_actor as string | undefined) ?? DEFAULT_REDDIT_ACTOR
    sort = (apifyConfig.reddit_sort as string | undefined) ?? DEFAULT_SORT
    timeFilter = (apifyConfig.reddit_time_filter as string | undefined) ?? DEFAULT_TIME_FILTER
    maxPerSub = (apifyConfig.reddit_max_per_sub as number | undefined) ?? DEFAULT_MAX_PER_SUB

    // Apify token: user key > env fallback > degraded
    apifyToken = await getUserApiKey(supabase, user.id, 'apify')
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
  }

  // Log start
  if (!sessionMode && userId) {
    await supabase.from('logs').insert({
      user_id: userId,
      action: 'scrape:reddit',
      status: 'start',
      payload: { subs, sort, timeFilter, maxPerSub, actor: redditActor },
    })
  }

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

  // Items canoniques (extraits une fois, dispatchés vers la bonne table après)
  const allItems: Array<{
    external_id: string
    url: string
    title: string
    raw_payload: Record<string, unknown>
    signal_date: string | null
  }> = []

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

      const items = posts
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

      allItems.push(...items)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ reason: `chunk[${chunk.join(',')}]: ${reason}` })
    }
  }

  if (allItems.length > 0) {
    // Dedup defensif par external_id (cf. scraper-x meme bug 21000 ON CONFLICT)
    const seenExt = new Set<string>()
    const dedupedItems = allItems.filter((r) => {
      if (seenExt.has(r.external_id)) return false
      seenExt.add(r.external_id)
      return true
    })

    if (sessionMode) {
      const sessionRows = dedupedItems.map((it) =>
        buildSessionRow(
          {
            source: 'reddit',
            external_id: it.external_id,
            url: it.url,
            title: it.title,
            raw_payload: it.raw_payload,
          },
          routing.config,
        ),
      )
      const { data: ins, error: insErr } = await supabase
        .from('signals_session')
        .insert(sessionRows)
        .select('id')
      if (insErr) errors.push({ reason: `db_insert: ${insErr.message}` })
      else inserted = ins?.length ?? 0
    } else {
      const rows = dedupedItems.map((it) => ({
        user_id: userId!,
        source: 'reddit' as const,
        external_id: it.external_id,
        url: it.url,
        title: it.title,
        raw_payload: it.raw_payload,
        signal_date: it.signal_date,
      }))
      const { data: upserted, error: upErr } = await supabase
        .from('signals')
        .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: false })
        .select('id')
      if (upErr) errors.push({ reason: `db_upsert: ${upErr.message}` })
      else inserted = upserted?.length ?? 0
    }
  }

  // Log end (include error reasons for debugging)
  if (!sessionMode && userId) {
    const finalStatus = inserted > 0 ? 'ok' : errors.length > 0 ? 'error' : 'degraded'
    await supabase.from('logs').insert({
      user_id: userId,
      action: 'scrape:reddit',
      status: finalStatus,
      payload: { fetched, inserted, errors, subs, chunks: chunks.length },
    })
  }

  return json(
    {
      fetched,
      inserted,
      errors,
      ...(sessionMode
        ? { session_id: routing.config.sessionId, target_table: 'signals_session' }
        : {}),
    },
    200,
  )
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
