import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom'
import { buildSessionRow, isSessionMode, parseSessionRouting } from '../_shared/session-routing.ts'
import { internalServiceClient, resolveCaller, resolveOrgId } from '../_shared/internal-auth.ts'
import { buildGoogleNewsSearchUrl, type GoogleNewsLang } from './google-news.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_FEEDS = 20
const MAX_KEYWORDS = 8
const FETCH_TIMEOUT_MS = 10_000

interface RssFeed {
  id: string
  org_id: string
  name: string
  url: string
  active: boolean
}

interface ParsedItem {
  title: string
  link: string
  pubDate: string | null
  description: string
}

interface RequestBody {
  org_id?: string
  // K03 — routage session (optionnel, rétrocompat préservée)
  target_table?: 'signals' | 'signals_session'
  session_id?: string
  created_by_api_key?: string
  ttl_hours?: number
  /** Mode session : URLs RSS à scraper (pas de lookup `rss_feeds`). */
  feed_urls?: string[]
  /**
   * Mode session, alternative à feed_urls : mots-clés routés vers Google News
   * RSS search (cf. google-news.ts). RSS n'a pas de mécanisme de recherche
   * natif — c'est le seul moyen de transformer un rss_keyword de
   * research_strategy en flux exploitable sans feed pré-souscrit.
   */
  keywords?: string[]
  lang?: GoogleNewsLang
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    // org_id optionnel
  }

  // Routage signals vs signals_session (K03)
  const routing = parseSessionRouting(body)
  if (!routing.ok) return json({ error: routing.error, detail: routing.detail }, routing.status)
  const sessionMode = isSessionMode(routing.config)

  // Mode session : feed_urls OU keywords requis (pas de lookup rss_feeds car
  // pas d'org rattachée à une session research-from-seed). keywords route
  // vers Google News RSS search (google-news.ts) — RSS n'a pas de mécanisme
  // de recherche natif, contrairement à feed_urls qui pointe des flux fixes.
  const hasFeedUrls = Array.isArray(body.feed_urls) && body.feed_urls.length > 0
  const hasKeywords = Array.isArray(body.keywords) && body.keywords.length > 0
  if (sessionMode && !hasFeedUrls && !hasKeywords) {
    return json(
      {
        error: 'feed_urls_or_keywords_required',
        detail:
          'target_table=signals_session requires a non-empty feed_urls[] or keywords[] in body',
      },
      400,
    )
  }

  // SupabaseClient sans generic Database évite les conflits entre modes
  // session/legacy (cf. pattern _shared/api-keys.ts).
  let supabase: SupabaseClient
  let userId: string | null = null
  let orgId: string | null = null
  let feeds: RssFeed[] = []

  if (sessionMode) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'service_role_env_missing' }, 500)
    }
    supabase = createClient(supabaseUrl, serviceKey)
    // Construire des "feeds" éphémères : feed_urls tels quels + keywords
    // convertis en recherche Google News RSS (un keyword = un flux de
    // résultats, cf. google-news.ts).
    const urlFeeds = (body.feed_urls ?? []).slice(0, MAX_FEEDS).map((url, idx) => ({
      id: `session-url-${idx}`,
      org_id: 'session',
      name: url,
      url,
      active: true,
    }))
    const lang = body.lang ?? 'fr'
    const keywordFeeds = (body.keywords ?? []).slice(0, MAX_KEYWORDS).map((keyword, idx) => ({
      id: `session-kw-${idx}`,
      org_id: 'session',
      name: `google-news:${keyword}`,
      url: buildGoogleNewsSearchUrl(keyword, lang),
      active: true,
    }))
    feeds = [...urlFeeds, ...keywordFeeds]
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

    // Résoudre org_id : paramètre body ou premier org rejoint
    orgId = body.org_id ?? (await resolveOrgId(supabase, userId))
    if (!orgId) return json({ error: 'org_id_required' }, 400)

    // Récupérer les flux actifs de l'org
    const { data: feedsData, error: feedsErr } = await supabase
      .from('rss_feeds')
      .select('id, org_id, name, url, active')
      .eq('org_id', orgId)
      .eq('active', true)
      .limit(MAX_FEEDS)

    if (feedsErr) return json({ error: 'feeds_query_failed', detail: feedsErr.message }, 500)
    if (!feedsData || feedsData.length === 0) {
      return json({ ok: true, feeds_processed: 0, signals_inserted: 0 }, 200)
    }
    feeds = feedsData as RssFeed[]
  }

  if (!sessionMode && userId) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'scraper:rss',
      status: 'start',
      payload: { feeds_count: feeds.length, org_id: orgId },
    })
  }

  let feedsProcessed = 0
  let signalsInserted = 0
  const errors: Array<{ feed_id: string; name: string; reason: string }> = []

  for (const feed of feeds) {
    try {
      const xml = await fetchWithTimeout(feed.url, FETCH_TIMEOUT_MS)
      const items = parseXml(xml, feed.url)

      if (items.length > 0) {
        // Dedup defensif par link
        const seenLinks = new Set<string>()

        if (sessionMode) {
          const sessionRows = []
          for (const item of items) {
            if (!item.link || seenLinks.has(item.link)) continue
            seenLinks.add(item.link)
            sessionRows.push(
              buildSessionRow(
                {
                  source: 'rss',
                  external_id: item.link,
                  url: item.link,
                  title: item.title,
                  raw_payload: {
                    feed_url: feed.url,
                    feed_name: feed.name,
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    pub_date: item.pubDate,
                  },
                },
                routing.config,
              ),
            )
          }
          if (sessionRows.length > 0) {
            const { data: ins, error: insErr } = await supabase
              .from('signals_session')
              .insert(sessionRows)
              .select('id')
            if (insErr) throw new Error(`db_insert: ${insErr.message}`)
            signalsInserted += ins?.length ?? 0
          }
        } else {
          const rows: Array<{
            user_id: string
            org_id: string | null
            source: string
            external_id: string
            url: string
            title: string
            raw_payload: Record<string, unknown>
            signal_date: string | null
          }> = []

          for (const item of items) {
            if (!item.link || seenLinks.has(item.link)) continue
            seenLinks.add(item.link)
            const signalDate = item.pubDate ? safeParse(item.pubDate) : null
            rows.push({
              user_id: userId!,
              org_id: orgId,
              source: 'rss',
              external_id: item.link,
              url: item.link,
              title: item.title,
              raw_payload: {
                feed_url: feed.url,
                feed_name: feed.name,
                title: item.title,
                link: item.link,
                description: item.description,
                pub_date: item.pubDate,
              },
              signal_date: signalDate,
            })
          }

          if (rows.length > 0) {
            const { data: upserted, error: upErr } = await supabase
              .from('signals')
              .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
              .select('id')

            if (upErr) throw new Error(`db_upsert: ${upErr.message}`)
            signalsInserted += upserted?.length ?? 0
          }
        }
      }

      // Mise à jour du statut du feed : succès — uniquement mode legacy
      // (les "feeds" du mode session sont éphémères et n'ont pas de row DB).
      if (!sessionMode) {
        await supabase
          .from('rss_feeds')
          .update({
            last_fetched_at: new Date().toISOString(),
            last_error: null,
            error_count: 0,
            signal_count: items.length,
          })
          .eq('id', feed.id)
      }

      feedsProcessed++
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ feed_id: feed.id, name: feed.name, reason })

      if (!sessionMode) {
        // Incrémenter error_count : on appelle la RPC, et si elle n'existe
        // pas encore (deploy DB pas encore appliqué) on fallback sur un
        // update direct du flux. Le `.catch()` chainé sur la RPC builder
        // n'est pas typé correct par postgrest-js : on encapsule via try.
        try {
          const { error: rpcErr } = await supabase.rpc('increment_rss_feed_error', {
            p_feed_id: feed.id,
            p_error: reason,
          })
          if (rpcErr) {
            // Fallback si la RPC n'existe pas encore
            await supabase.from('rss_feeds').update({ last_error: reason }).eq('id', feed.id)
          }
        } catch {
          // best-effort : ne jamais faire échouer le scraper sur un log
        }
      }
    }
  }

  if (!sessionMode && userId) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'scraper:rss',
      status: errors.length > 0 && feedsProcessed === 0 ? 'error' : 'ok',
      payload: {
        feeds_count: feeds.length,
        feeds_processed: feedsProcessed,
        signals_inserted: signalsInserted,
        errors,
      },
    })
  }

  return json(
    {
      ok: true,
      feeds_processed: feedsProcessed,
      signals_inserted: signalsInserted,
      errors,
      ...(sessionMode
        ? { session_id: routing.config.sessionId, target_table: 'signals_session' }
        : {}),
    },
    200,
  )
})

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Kairos-RSS-Scraper/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) throw new Error(`http_${resp.status}`)
  return await resp.text()
}

function parseXml(xml: string, feedUrl: string): ParsedItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/html')
  if (!doc) return []

  // Détecter format : Atom (<feed>) ou RSS 2.0 (<rss> / <channel>)
  const hasFeedElement = !!doc.querySelector('feed')
  if (hasFeedElement) {
    return parseAtom(doc)
  }
  return parseRss(doc, feedUrl)
}

function parseAtom(doc: ReturnType<DOMParser['parseFromString']>): ParsedItem[] {
  const entries = Array.from(doc.querySelectorAll('entry')) as Element[]
  return entries
    .map((entry) => {
      const title = entry.querySelector('title')?.textContent?.trim() ?? ''
      // <link href="..."> ou <id>
      const linkEl = entry.querySelector('link')
      const link =
        (linkEl as Element | null)?.getAttribute('href') ??
        entry.querySelector('id')?.textContent?.trim() ??
        ''
      const pubDate =
        entry.querySelector('updated')?.textContent?.trim() ??
        entry.querySelector('published')?.textContent?.trim() ??
        null
      const description =
        entry.querySelector('summary')?.textContent?.trim() ??
        entry.querySelector('content')?.textContent?.trim() ??
        ''
      return { title, link, pubDate, description }
    })
    .filter((item) => item.link)
}

function parseRss(doc: ReturnType<DOMParser['parseFromString']>, _feedUrl: string): ParsedItem[] {
  const items = Array.from(doc.querySelectorAll('item')) as Element[]
  return items
    .map((item) => {
      const title = item.querySelector('title')?.textContent?.trim() ?? ''
      const link = item.querySelector('link')?.textContent?.trim() ?? ''
      const pubDate = item.querySelector('pubdate')?.textContent?.trim() ?? null
      const description = item.querySelector('description')?.textContent?.trim() ?? ''
      return { title, link, pubDate, description }
    })
    .filter((item) => item.link)
}

function safeParse(dateStr: string): string | null {
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
