import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom'
import { buildSessionRow, isSessionMode, parseSessionRouting } from '../_shared/session-routing.ts'
import { internalServiceClient, resolveCaller, resolveOrgId } from '../_shared/internal-auth.ts'

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
  // K03 — routage session (optionnel, rétrocompat préservée)
  target_table?: 'signals' | 'signals_session'
  session_id?: string
  created_by_api_key?: string
  ttl_hours?: number
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Body
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return json(
      { error: 'categories_required', detail: 'body.categories must be a non-empty string[]' },
      400,
    )
  }

  // Routage signals vs signals_session (K03)
  const routing = parseSessionRouting(body)
  if (!routing.ok) return json({ error: routing.error, detail: routing.detail }, routing.status)
  const sessionMode = isSessionMode(routing.config)

  // Selon le mode, on utilise soit le client user-scoped (legacy) soit le
  // client service_role (session — bypass RLS, pas de user_id à attacher).
  // SupabaseClient sans generic Database évite les conflits de types entre
  // les deux modes et matche le pattern utilisé dans `_shared/api-keys.ts`.
  let supabase: SupabaseClient
  let userId: string | null = null
  let orgId: string | null = null

  if (sessionMode) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'service_role_env_missing' }, 500)
    }
    supabase = createClient(supabaseUrl, serviceKey)
  } else {
    // Mode legacy : auth user JWT obligatoire
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
  }

  const categories = body.categories.slice(0, 5)

  let fetched = 0
  let inserted = 0
  const errors: Array<{ category: string; reason: string }> = []

  // Log start (uniquement mode legacy : signals_session ne doit pas polluer
  // les logs user-scoped).
  if (!sessionMode && userId) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'scrape:arxiv',
      status: 'start',
      payload: { categories },
    })
  }

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    try {
      const url = `${ARXIV_API}?search_query=cat:${encodeURIComponent(cat)}&sortBy=submittedDate&sortOrder=descending&max_results=25`
      const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!resp.ok) {
        errors.push({ category: cat, reason: `http_${resp.status}` })
        if (!sessionMode && userId) {
          await supabase.from('logs').insert({
            user_id: userId,
            org_id: orgId,
            action: 'scrape:arxiv',
            status: 'error',
            payload: { category: cat, http_status: resp.status },
          })
        }
        continue
      }
      const xml = await resp.text()
      const entries = parseAtomEntries(xml)

      if (sessionMode) {
        // Mode session : insert dans signals_session, pas de user_id, pas de
        // signal_date (table éphémère minimaliste).
        const sessionRows = entries.map((e) =>
          buildSessionRow(
            {
              source: 'arxiv',
              external_id: e.id,
              url: e.id,
              title: e.title,
              raw_payload: {
                summary: e.summary,
                published: e.published,
                authors: e.authors,
                categories: e.categories,
              },
            },
            routing.config,
          ),
        )
        fetched += sessionRows.length
        if (sessionRows.length > 0) {
          // Dedup défensif par external_id (cf. scraper-x bug 21000 ON CONFLICT)
          const seen = new Set<string>()
          const deduped = sessionRows.filter((r) => {
            if (!r.external_id) return true
            if (seen.has(r.external_id)) return false
            seen.add(r.external_id)
            return true
          })
          const { data: ins, error: insErr } = await supabase
            .from('signals_session')
            .insert(deduped)
            .select('id')
          if (insErr) throw insErr
          inserted += ins?.length ?? 0
        }
      } else {
        // Mode legacy (user-scoped signals + signal_date)
        const rows = entries.map((e) => {
          const d = e.published ? new Date(e.published) : null
          const signalDate = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
          return {
            user_id: userId!,
            org_id: orgId,
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

        if (userId) {
          await supabase.from('logs').insert({
            user_id: userId,
            org_id: orgId,
            action: 'scrape:arxiv',
            status: 'ok',
            payload: { category: cat, fetched: rows.length, returned: rows.length },
          })
        }
      }

      // Rate-limit Arxiv (sauf après le dernier)
      if (i < categories.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ category: cat, reason })
      if (!sessionMode && userId) {
        await supabase.from('logs').insert({
          user_id: userId,
          org_id: orgId,
          action: 'scrape:arxiv',
          status: 'error',
          payload: { category: cat, error: reason },
        })
      }
    }
  }

  // Log end
  if (!sessionMode && userId) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'scrape:arxiv',
      status: 'ok',
      payload: { fetched, inserted, errors_count: errors.length, categories },
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
