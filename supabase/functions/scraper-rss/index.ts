import { createClient } from 'jsr:@supabase/supabase-js@2'
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_FEEDS = 20
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

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

  let body: { org_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    // org_id optionnel
  }

  // Résoudre org_id : paramètre body ou lookup dans organization_members
  let orgId: string | null = body.org_id ?? null
  if (!orgId) {
    const { data: member } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    orgId = member?.org_id ?? null
  }
  if (!orgId) return json({ error: 'org_id_required' }, 400)

  // Récupérer les flux actifs de l'org
  const { data: feeds, error: feedsErr } = await supabase
    .from('rss_feeds')
    .select('id, org_id, name, url, active')
    .eq('org_id', orgId)
    .eq('active', true)
    .limit(MAX_FEEDS)

  if (feedsErr) return json({ error: 'feeds_query_failed', detail: feedsErr.message }, 500)
  if (!feeds || feeds.length === 0) {
    return json({ ok: true, feeds_processed: 0, signals_inserted: 0 }, 200)
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scraper:rss',
    status: 'start',
    payload: { feeds_count: feeds.length, org_id: orgId },
  })

  let feedsProcessed = 0
  let signalsInserted = 0
  const errors: Array<{ feed_id: string; name: string; reason: string }> = []

  for (const feed of feeds as RssFeed[]) {
    try {
      const xml = await fetchWithTimeout(feed.url, FETCH_TIMEOUT_MS)
      const items = parseXml(xml, feed.url)

      if (items.length > 0) {
        // Dedup defensif par link
        const seenLinks = new Set<string>()
        const rows: Array<{
          user_id: string
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
            user_id: user.id,
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

      // Mise à jour du statut du feed : succès
      await supabase
        .from('rss_feeds')
        .update({
          last_fetched_at: new Date().toISOString(),
          last_error: null,
          error_count: 0,
          signal_count: items.length,
        })
        .eq('id', feed.id)

      feedsProcessed++
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ feed_id: feed.id, name: feed.name, reason })

      // Incrémenter error_count
      await supabase
        .rpc('increment_rss_feed_error', {
          p_feed_id: feed.id,
          p_error: reason,
        })
        .catch(() => {
          // fallback si la RPC n'existe pas encore
          supabase
            .from('rss_feeds')
            .update({ last_error: reason })
            .eq('id', feed.id)
            .then(() => {})
        })
    }
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scraper:rss',
    status: errors.length > 0 && feedsProcessed === 0 ? 'error' : 'ok',
    payload: {
      feeds_count: feeds.length,
      feeds_processed: feedsProcessed,
      signals_inserted: signalsInserted,
      errors,
    },
  })

  return json(
    { ok: true, feeds_processed: feedsProcessed, signals_inserted: signalsInserted, errors },
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
