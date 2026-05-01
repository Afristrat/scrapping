import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { isQualitySignal } from '../_shared/filter.ts'
import { formatError, summarizeError } from '../_shared/errors.ts'
import { deepSanitizeJson, safeSliceString, sanitizeUnicodeString } from '../_shared/unicode.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APIFY_ACTOR = 'apidojo~twitter-list-scraper'
const DEFAULT_MAX_ITEMS = 100

interface RequestBody {
  listIds?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

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

  let body: RequestBody = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine, we read from settings
  }

  const { data: settings } = await supabase
    .from('settings')
    .select('apify_config')
    .eq('user_id', user.id)
    .single()

  const apifyConfig = settings?.apify_config ?? {}
  const listIds = body.listIds ?? apifyConfig.x_list_ids ?? []
  const maxItems = apifyConfig.x_max_items ?? DEFAULT_MAX_ITEMS

  if (!Array.isArray(listIds) || listIds.length === 0) {
    return json(
      {
        error: 'list_ids_required',
        detail: 'No X list IDs found in body or settings.apify_config.x_list_ids',
      },
      400,
    )
  }

  const apifyToken = await getUserApiKey(supabase, user.id, 'apify')
  if (!apifyToken) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'scrape:x',
      status: 'degraded',
      payload: {
        reason: 'no_apify_key',
        detail: 'No Apify key in user_api_keys and no APIFY_TOKEN env var',
      },
    })
    return json({ fetched: 0, inserted: 0, errors: [{ reason: 'no_apify_key' }] }, 200)
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:x',
    status: 'start',
    payload: { listIds, maxItems, actor: APIFY_ACTOR },
  })

  let fetched = 0
  let inserted = 0
  let invalidDates = 0
  let filteredOut = 0
  const errors: Array<Record<string, unknown>> = []
  const sampleProblems: Array<Record<string, unknown>> = []
  const sanitizeStats = { fixed: 0 }

  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}`
    const resp = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listIds, maxItems }),
      signal: AbortSignal.timeout(60000),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`apify_http_${resp.status}: ${text.slice(0, 200)}`)
    }

    const tweets = (await resp.json()) as Array<Record<string, unknown>>
    fetched = tweets.length

    if (tweets.length > 0) {
      const beforeFilter = tweets.length
      const rows = tweets
        .map((tweet) => {
          const tweetId = String(tweet.id ?? tweet.id_str ?? '')
          const author = tweet.author as Record<string, unknown> | undefined
          const userName = author?.userName ?? author?.username ?? 'unknown'
          const createdAtRaw = (tweet.createdAt ?? tweet.created_at) as string | undefined
          const signalDate = createdAtRaw ? safeIsoDate(createdAtRaw) : null
          if (createdAtRaw && !signalDate) {
            invalidDates++
            if (sampleProblems.length < 3) {
              sampleProblems.push({
                kind: 'invalid_date',
                tweetId,
                createdAtRaw: String(createdAtRaw).slice(0, 60),
              })
            }
          }
          const rawTitle = String(tweet.text ?? '')
          const title = sanitizeUnicodeString(safeSliceString(rawTitle, 280))
          return {
            user_id: user.id,
            source: 'x' as const,
            external_id: tweetId,
            url: sanitizeUnicodeString(
              (tweet.url as string) ?? `https://x.com/${userName}/status/${tweetId}`,
            ),
            title,
            raw_payload: deepSanitizeJson(tweet, sanitizeStats),
            signal_date: signalDate,
          }
        })
        .filter((r) => r.external_id !== '')
        .filter((r) => {
          const keep = isQualitySignal({ title: r.title, raw_payload: r.raw_payload, source: 'x' })
          if (!keep) filteredOut++
          return keep
        })

      if (rows.length > 0) {
        const { data: upserted, error: upErr } = await supabase
          .from('signals')
          .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: false })
          .select('id')
        if (upErr) throw upErr
        inserted = upserted?.length ?? 0
      }

      // Detail log helps debugging when fetched > 0 but inserted == 0
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:x',
        status: 'info',
        payload: {
          stage: 'after_filter',
          fetched: beforeFilter,
          kept: rows.length,
          filtered_out: filteredOut,
          invalid_dates: invalidDates,
          unicode_fixes: sanitizeStats.fixed,
          sample_problems: sampleProblems,
        },
      })
    }

    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'scrape:x',
      status: 'ok',
      payload: {
        fetched,
        inserted,
        listIds,
        invalid_dates: invalidDates,
        filtered_out: filteredOut,
        unicode_fixes: sanitizeStats.fixed,
      },
    })
  } catch (err) {
    const formatted = formatError(err)
    errors.push(formatted)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'scrape:x',
      status: 'error',
      payload: {
        ...formatted,
        summary: summarizeError(err),
        listIds,
        fetched_so_far: fetched,
      },
    })
  }

  const finalStatus = inserted > 0 ? 'ok' : errors.length > 0 ? 'error' : 'degraded'
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:x',
    status: finalStatus,
    payload: {
      stage: 'final',
      fetched,
      inserted,
      filtered_out: filteredOut,
      invalid_dates: invalidDates,
      errors,
      listIds,
    },
  })

  return json({ fetched, inserted, errors }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * Twitter dates from Apify can come as ISO ("2026-04-30T14:00:00Z") OR
 * legacy Twitter format ("Sat Apr 30 14:00:00 +0000 2026"). Both are
 * accepted by JS Date constructor. Returns null if unparseable so the
 * Postgres timestamptz column receives NULL instead of an invalid string.
 */
function safeIsoDate(input: string): string | null {
  const d = new Date(input)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
