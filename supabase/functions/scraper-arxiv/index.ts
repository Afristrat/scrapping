import { createClient } from 'jsr:@supabase/supabase-js@2'
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ARXIV_API = 'https://export.arxiv.org/api/query'
const USER_AGENT = 'zlatan-scrap/0.1'
const RATE_LIMIT_MS = 3000

interface ArxivEntry {
  id: string
  title: string
  summary: string
  published: string
  authors: string[]
  categories: string[]
}

interface RequestBody {
  categories: string[]
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

  // Body
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return json(
      { error: 'categories_required', detail: 'body.categories must be a non-empty string[]' },
      400,
    )
  }

  const categories = body.categories.slice(0, 5)

  let fetched = 0
  let inserted = 0
  const errors: Array<{ category: string; reason: string }> = []

  // Log start
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:arxiv',
    status: 'start',
    payload: { categories },
  })

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    try {
      const url = `${ARXIV_API}?search_query=cat:${encodeURIComponent(cat)}&sortBy=submittedDate&sortOrder=descending&max_results=25`
      const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!resp.ok) {
        errors.push({ category: cat, reason: `http_${resp.status}` })
        await supabase.from('logs').insert({
          user_id: user.id,
          action: 'scrape:arxiv',
          status: 'error',
          payload: { category: cat, http_status: resp.status },
        })
        continue
      }
      const xml = await resp.text()
      const entries = parseAtomEntries(xml)
      const rows = entries.map((e) => {
        const d = e.published ? new Date(e.published) : null
        const signalDate = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
        return {
          user_id: user.id,
          source: 'arxiv' as const,
          external_id: e.id,
          url: e.id,
          title: e.title,
          raw_payload: {
            summary: e.summary,
            published: e.published,
            authors: e.authors,
            categories: e.categories,
          },
          signal_date: signalDate,
        }
      })
      fetched += rows.length

      if (rows.length > 0) {
        // Dedup defensif par external_id (cf. scraper-x meme bug 21000 ON CONFLICT)
        const seenExt = new Set<string>()
        const dedupedRows: typeof rows = []
        for (const r of rows) {
          if (seenExt.has(r.external_id)) continue
          seenExt.add(r.external_id)
          dedupedRows.push(r)
        }
        const { data: upserted, error: upErr } = await supabase
          .from('signals')
          .upsert(dedupedRows, {
            onConflict: 'user_id,source,external_id',
            ignoreDuplicates: false,
          })
          .select('id')
        if (upErr) throw upErr
        inserted += upserted?.length ?? 0
      }

      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:arxiv',
        status: 'ok',
        payload: { category: cat, fetched: rows.length, returned: rows.length },
      })

      // Rate-limit Arxiv (sauf après le dernier)
      if (i < categories.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ category: cat, reason })
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:arxiv',
        status: 'error',
        payload: { category: cat, error: reason },
      })
    }
  }

  // Log end
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:arxiv',
    status: 'ok',
    payload: { fetched, inserted, errors_count: errors.length, categories },
  })

  return json({ fetched, inserted, errors }, 200)
})

function parseAtomEntries(xml: string): ArxivEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'text/html')
  if (!doc) return []
  // Atom <entry> elements (deno-dom parses as HTML so tag names are lowercased)
  const entries = Array.from(doc.querySelectorAll('entry')) as Element[]
  return entries
    .map((entry) => {
      const id = entry.querySelector('id')?.textContent?.trim() ?? ''
      const title = entry.querySelector('title')?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
      const summary = entry.querySelector('summary')?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
      const published = entry.querySelector('published')?.textContent?.trim() ?? ''
      const authors = Array.from(entry.querySelectorAll('author > name'))
        .map((n) => n.textContent?.trim() ?? '')
        .filter(Boolean)
      const categories = Array.from(entry.querySelectorAll('category'))
        .map((c) => (c as Element).getAttribute('term') ?? '')
        .filter(Boolean)
      return { id, title, summary, published, authors, categories }
    })
    .filter((e) => e.id)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
