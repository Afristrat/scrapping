import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { isQualitySignal } from '../_shared/filter.ts'
import { formatError, type FormattedError, summarizeError } from '../_shared/errors.ts'
import { deepSanitizeJson, safeSliceString, sanitizeUnicodeString } from '../_shared/unicode.ts'
import { buildSessionRow, isSessionMode, parseSessionRouting } from '../_shared/session-routing.ts'
import { internalServiceClient, resolveCaller, resolveOrgId } from '../_shared/internal-auth.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APIFY_ACTOR = 'apidojo~twitter-list-scraper'
const DEFAULT_MAX_ITEMS = 100

interface RequestBody {
  listIds?: string[]
  // K03 — routage session (optionnel, rétrocompat préservée)
  target_table?: 'signals' | 'signals_session'
  session_id?: string
  created_by_api_key?: string
  ttl_hours?: number
  /** Mode session : token Apify direct (Bassira injecte sa clé). */
  apify_token?: string
  /** Mode session : maxItems override. */
  max_items?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

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
  let orgId: string | null = null
  let listIds: string[] = []
  let maxItems = DEFAULT_MAX_ITEMS
  let apifyToken: string | null = null

  if (sessionMode) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'service_role_env_missing' }, 500)
    }
    supabase = createClient(supabaseUrl, serviceKey)

    if (!Array.isArray(body.listIds) || body.listIds.length === 0) {
      return json(
        {
          error: 'list_ids_required',
          detail: 'target_table=signals_session requires a non-empty listIds[] in body',
        },
        400,
      )
    }
    listIds = body.listIds
    maxItems = typeof body.max_items === 'number' ? body.max_items : DEFAULT_MAX_ITEMS
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
    // Auth dual-mode (ADR 0009) : JWT user OU appel interne (cron / orchestrateur)
    const authHeader = req.headers.get('Authorization')
    const userScoped = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: authHeader ? { Authorization: authHeader } : {} } },
    )
    const caller = await resolveCaller(userScoped, req)
    if (!caller.ok) return json({ error: caller.error }, 401)
    userId = caller.userId
    supabase = caller.mode === 'internal' ? internalServiceClient(createClient) : userScoped

    // org explicite sur toutes les écritures : le DEFAULT user_default_org_id()
    // repose sur auth.uid(), nul en service_role (mode internal).
    orgId = await resolveOrgId(supabase, userId)

    const { data: settings } = await supabase
      .from('settings')
      .select('apify_config')
      .eq('user_id', userId)
      .single()

    const apifyConfig =
      (settings as { apify_config?: Record<string, unknown> } | null)?.apify_config ?? {}
    listIds = (body.listIds ?? (apifyConfig.x_list_ids as string[] | undefined) ?? []) as string[]
    maxItems = (apifyConfig.x_max_items as number | undefined) ?? DEFAULT_MAX_ITEMS

    if (!Array.isArray(listIds) || listIds.length === 0) {
      return json(
        {
          error: 'list_ids_required',
          detail: 'No X list IDs found in body or settings.apify_config.x_list_ids',
        },
        400,
      )
    }

    apifyToken = await getUserApiKey(supabase, userId, 'apify')
    if (!apifyToken) {
      await supabase.from('logs').insert({
        user_id: userId,
        org_id: orgId,
        action: 'scrape:x',
        status: 'degraded',
        payload: {
          reason: 'no_apify_key',
          detail: 'No Apify key in user_api_keys and no APIFY_TOKEN env var',
        },
      })
      return json({ fetched: 0, inserted: 0, errors: [{ reason: 'no_apify_key' }] }, 200)
    }
  }

  if (!sessionMode && userId) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'scrape:x',
      status: 'start',
      payload: { listIds, maxItems, actor: APIFY_ACTOR },
    })
  }

  let fetched = 0
  let inserted = 0
  let invalidDates = 0
  let filteredOut = 0
  const errors: FormattedError[] = []
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

      // Items canoniques (extraction commune aux deux modes)
      const items = tweets.map((tweet) => {
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
        const url = sanitizeUnicodeString(
          (tweet.url as string) ?? `https://x.com/${userName}/status/${tweetId}`,
        )
        return {
          external_id: tweetId,
          url,
          title,
          raw_payload: deepSanitizeJson(tweet, sanitizeStats) as Record<string, unknown>,
          signal_date: signalDate,
        }
      })

      const filtered = items
        .filter((r) => r.external_id !== '')
        .filter((r) => {
          const keep = isQualitySignal({ title: r.title, raw_payload: r.raw_payload, source: 'x' })
          if (!keep) filteredOut++
          return keep
        })

      // Dedup par external_id (cf. bug 21000 ON CONFLICT)
      const seenExt = new Set<string>()
      const dedupedItems = filtered.filter((r) => {
        if (seenExt.has(r.external_id)) return false
        seenExt.add(r.external_id)
        return true
      })

      if (dedupedItems.length > 0) {
        if (sessionMode) {
          const sessionRows = dedupedItems.map((it) =>
            buildSessionRow(
              {
                source: 'x',
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
          if (insErr) throw insErr
          inserted = ins?.length ?? 0
        } else {
          const rows = dedupedItems.map((it) => ({
            user_id: userId!,
            org_id: orgId,
            source: 'x' as const,
            external_id: it.external_id,
            url: it.url,
            title: it.title,
            raw_payload: it.raw_payload,
            signal_date: it.signal_date,
          }))

          const { data: upserted, error: upErr } = await supabase
            .from('signals')
            .upsert(rows, {
              onConflict: 'user_id,source,external_id',
              ignoreDuplicates: false,
            })
            .select('id')
          if (upErr) throw upErr
          inserted = upserted?.length ?? 0
        }
      }

      // Detail log helps debugging when fetched > 0 but inserted == 0
      if (!sessionMode && userId) {
        await supabase.from('logs').insert({
          user_id: userId,
          org_id: orgId,
          action: 'scrape:x',
          status: 'info',
          payload: {
            stage: 'after_filter',
            fetched: beforeFilter,
            kept: dedupedItems.length,
            filtered_out: filteredOut,
            invalid_dates: invalidDates,
            unicode_fixes: sanitizeStats.fixed,
            sample_problems: sampleProblems,
          },
        })
      }
    }

    if (!sessionMode && userId) {
      await supabase.from('logs').insert({
        user_id: userId,
        org_id: orgId,
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
    }
  } catch (err) {
    const formatted = formatError(err)
    errors.push(formatted)
    if (!sessionMode && userId) {
      await supabase.from('logs').insert({
        user_id: userId,
        org_id: orgId,
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
  }

  if (!sessionMode && userId) {
    const finalStatus = inserted > 0 ? 'ok' : errors.length > 0 ? 'error' : 'degraded'
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
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
