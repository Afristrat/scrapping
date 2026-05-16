/**
 * topics-of-interest — Endpoint CRUD pour les sujets de veille permanents.
 *
 * Auth :
 *   - x-api-key (Bassira et autres clients externes) : valide contre
 *     `public_api_keys`, owner_user_id = `proxy_user_id` du caller.
 *   - Authorization Bearer <jwt> (UI Kairos future) : owner_user_id =
 *     `auth.uid()`. Pas implémenté V1 — focus Bassira d'abord.
 *
 * Méthodes :
 *   - POST /topics-of-interest → créer un sujet. Embed seeds, INSERT.
 *     Trigger une 1ʳᵉ collecte en background via EdgeRuntime.waitUntil.
 *   - GET /topics-of-interest → list owner's sujets (pagination simple).
 *   - GET /topics-of-interest?id=<uuid> → détail d'un sujet.
 *   - PATCH /topics-of-interest?id=<uuid> → update name/seeds/cron/status.
 *     Si seeds changent → re-embed + purge archive + retrigger collecte.
 *   - DELETE /topics-of-interest?id=<uuid> → cascade delete archive.
 *
 * BYOK strict — embedding via dashscope/openai/openrouter selon
 * settings.model_config.embedding + user_api_keys du proxy_user.
 * Cf. _shared/embeddings.ts.
 *
 * CORS strict (whitelist *.ai-mpower.com + localhost), comme research-from-seed.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  EMBEDDING_DIMS,
  embedTexts,
  meanEmbedding,
  NoEmbeddingProviderError,
  toPgVector,
} from '../_shared/embeddings.ts'
import { validateApiKey } from '../research-from-seed/lib.ts'
import {
  type CollectCron,
  computeNextCollectAt,
  seedsChanged,
  validateCreateBody,
  validatePatchBody,
} from './lib.ts'

const ALLOWED_ORIGIN_SUFFIXES = ['.ai-mpower.com']
const ALLOWED_ORIGINS_EXACT = ['https://prospectives.ai-mpower.com']
const DEV_ORIGIN_RE = /^http:\/\/localhost(:\d+)?$/

function resolveCorsOrigin(origin: string | null): string | null {
  if (!origin) return null
  if (ALLOWED_ORIGINS_EXACT.includes(origin)) return origin
  if (DEV_ORIGIN_RE.test(origin)) return origin
  try {
    const u = new URL(origin)
    if (ALLOWED_ORIGIN_SUFFIXES.some((s) => u.hostname.endsWith(s))) return origin
  } catch {
    // ignore
  }
  return null
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = resolveCorsOrigin(origin)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    Vary: 'Origin',
  }
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed
  }
  return headers
}

function jsonResp(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ─── Top-level handler ──────────────────────────────────────────────────────

export const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  const cors = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    if (!resolveCorsOrigin(origin)) {
      return new Response(null, { status: 403, headers: cors })
    }
    return new Response(null, { status: 204, headers: cors })
  }

  if (origin && !resolveCorsOrigin(origin)) {
    return jsonResp({ ok: false, error: 'cors_origin_not_allowed' }, 403, cors)
  }

  // Env / clients
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ ok: false, error: 'service_role_env_missing' }, 500, cors)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  // Auth : x-api-key obligatoire en V1.
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)
  }
  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }
  const proxyUserId = keyValidation.key.proxy_user_id
  if (!proxyUserId) {
    return jsonResp(
      {
        ok: false,
        error: 'service_setup_incomplete',
        detail: 'public_api_keys.proxy_user_id is NULL — run setup-bassira-proxy.sql',
      },
      500,
      cors,
    )
  }

  // Routing par méthode
  const url = new URL(req.url)
  const idParam = url.searchParams.get('id')

  try {
    if (req.method === 'GET') {
      if (idParam) {
        return await handleGetOne(supabase, proxyUserId, idParam, cors)
      }
      return await handleList(supabase, proxyUserId, url, cors)
    }
    if (req.method === 'POST') {
      return await handleCreate(req, supabase, supabaseUrl, serviceKey, proxyUserId, cors)
    }
    if (req.method === 'PATCH') {
      if (!idParam) {
        return jsonResp({ ok: false, error: 'id_required' }, 400, cors)
      }
      return await handlePatch(req, supabase, supabaseUrl, serviceKey, proxyUserId, idParam, cors)
    }
    if (req.method === 'DELETE') {
      if (!idParam) {
        return jsonResp({ ok: false, error: 'id_required' }, 400, cors)
      }
      return await handleDelete(supabase, proxyUserId, idParam, cors)
    }
    return jsonResp({ ok: false, error: 'method_not_allowed' }, 405, cors)
  } catch (err) {
    if (err instanceof NoEmbeddingProviderError) {
      return jsonResp(
        {
          ok: false,
          error: 'no_embedding_provider',
          detail:
            'No DashScope / OpenAI / OpenRouter key configured for proxy_user_id. Cannot compute seeds_embedding.',
        },
        500,
        cors,
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResp({ ok: false, error: 'internal_error', detail: msg.slice(0, 300) }, 500, cors)
  }
}

// ─── GET (list + detail) ────────────────────────────────────────────────────

const SELECT_COLUMNS =
  'id, owner_user_id, name, seeds, embedding_model, lang, sector_hint, scope_profile, hints_override, collect_cron, status, last_collected_at, next_collect_at, last_error, signals_count, topics_count, created_at, updated_at'

async function handleList(
  // deno-lint-ignore no-explicit-any -- SupabaseClient type est lourd à importer ici
  supabase: any,
  ownerUserId: string,
  url: URL,
  cors: Record<string, string>,
): Promise<Response> {
  const limitParam = Number(url.searchParams.get('limit') ?? '50')
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100)
  const statusFilter = url.searchParams.get('status')

  let q = supabase
    .from('topics_of_interest')
    .select(SELECT_COLUMNS)
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (statusFilter) q = q.eq('status', statusFilter)

  const { data, error } = await q
  if (error) {
    return jsonResp({ ok: false, error: 'db_query_failed', detail: error.message }, 500, cors)
  }
  return jsonResp(
    { ok: true, count: (data ?? []).length, topics_of_interest: data ?? [] },
    200,
    cors,
  )
}

async function handleGetOne(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerUserId: string,
  id: string,
  cors: Record<string, string>,
): Promise<Response> {
  const { data, error } = await supabase
    .from('topics_of_interest')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle()
  if (error) {
    return jsonResp({ ok: false, error: 'db_query_failed', detail: error.message }, 500, cors)
  }
  if (!data) {
    return jsonResp({ ok: false, error: 'not_found' }, 404, cors)
  }
  return jsonResp({ ok: true, topic_of_interest: data }, 200, cors)
}

// ─── POST (create + trigger 1st collect) ────────────────────────────────────

async function handleCreate(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  ownerUserId: string,
  cors: Record<string, string>,
): Promise<Response> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResp({ ok: false, error: 'invalid_json' }, 400, cors)
  }
  const v = validateCreateBody(raw)
  if (!v.ok) {
    return jsonResp({ ok: false, error: 'bad_body', detail: v.error }, 400, cors)
  }
  const body = v.body

  // Embed seeds (batch)
  const embResult = await embedTexts(supabase, ownerUserId, body.seeds, {
    dimensions: EMBEDDING_DIMS,
  })
  const centroid = meanEmbedding(embResult.embeddings)

  const id = crypto.randomUUID()
  const insertRow = {
    id,
    owner_user_id: ownerUserId,
    name: body.name,
    seeds: body.seeds,
    seeds_embedding: toPgVector(centroid),
    embedding_model: embResult.model,
    lang: body.lang,
    sector_hint: body.sector_hint ?? null,
    scope_profile: body.scope_profile ?? null,
    hints_override: body.hints_override ?? null,
    collect_cron: body.collect_cron ?? 'weekly',
    status: 'collecting' as const,
    next_collect_at: new Date().toISOString(), // immédiat
  }
  const { error: insErr, data: inserted } = await supabase
    .from('topics_of_interest')
    .insert(insertRow)
    .select(SELECT_COLUMNS)
    .single()
  if (insErr) {
    return jsonResp({ ok: false, error: 'insert_failed', detail: insErr.message }, 500, cors)
  }

  // Trigger 1st collect en background
  scheduleFirstCollect(supabaseUrl, serviceKey, id)

  return jsonResp(
    {
      ok: true,
      topic_of_interest: inserted,
      embedding: {
        model: embResult.model,
        provider: embResult.provider,
        dimensions: embResult.dimensions,
        cost: embResult.cost,
      },
      message: '1st collect scheduled in background. Poll status via GET ?id=' + id,
    },
    201,
    cors,
  )
}

/**
 * Lance la 1ʳᵉ collecte en fire-and-forget en appelant watchlist-tick avec
 * service_role. Sans ça, l'utilisateur attendrait jusqu'à 1h que le cron horaire
 * pickup le sujet (next_collect_at=NOW est déjà éligible mais cron tick au prochain
 * top d'heure). watchlist-tick est idempotent : il lock via topic_collect_runs
 * status='running', donc safe à appeler en parallèle du cron.
 */
function scheduleFirstCollect(supabaseUrl: string, serviceKey: string, _toiId: string): void {
  const url = `${supabaseUrl}/functions/v1/watchlist-tick`
  const promise = fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger: 'create_first_collect' }),
  }).catch(() => {
    /* fire-and-forget : log côté watchlist-tick si fail */
  })

  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime
  if (er && typeof er.waitUntil === 'function') {
    er.waitUntil(promise)
  } else {
    promise.catch(() => {})
  }
}

// ─── PATCH (update) ─────────────────────────────────────────────────────────

async function handlePatch(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  ownerUserId: string,
  id: string,
  cors: Record<string, string>,
): Promise<Response> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResp({ ok: false, error: 'invalid_json' }, 400, cors)
  }
  const v = validatePatchBody(raw)
  if (!v.ok) return jsonResp({ ok: false, error: 'bad_body', detail: v.error }, 400, cors)
  const patch = v.body

  // Charger la row existante pour comparer + checker ownership
  const { data: existing, error: getErr } = await supabase
    .from('topics_of_interest')
    .select('id, owner_user_id, seeds, collect_cron, status')
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle()
  if (getErr || !existing) {
    return jsonResp({ ok: false, error: 'not_found' }, 404, cors)
  }

  const updates: Record<string, unknown> = {}
  if (patch.name !== undefined) updates.name = patch.name
  if (patch.lang !== undefined) updates.lang = patch.lang
  if (patch.sector_hint !== undefined) updates.sector_hint = patch.sector_hint
  if (patch.scope_profile !== undefined) updates.scope_profile = patch.scope_profile
  if (patch.hints_override !== undefined) updates.hints_override = patch.hints_override
  if (patch.status !== undefined) updates.status = patch.status
  if (patch.collect_cron !== undefined) {
    updates.collect_cron = patch.collect_cron
    const next = computeNextCollectAt(patch.collect_cron)
    updates.next_collect_at = next ? next.toISOString() : new Date('9999-12-31').toISOString()
    // ↑ paused = next_collect_at très loin (le partial index WHERE status='collecting' évite déjà
    // de picker des rows paused, mais on garde une date stable pour ne pas avoir NULL).
  }

  // Si seeds changent : re-embed, purge archive, retrigger collecte.
  let reembedModel: string | undefined
  if (patch.seeds && seedsChanged(existing.seeds as string[] | null, patch.seeds)) {
    const embResult = await embedTexts(supabase, ownerUserId, patch.seeds, {
      dimensions: EMBEDDING_DIMS,
    })
    const centroid = meanEmbedding(embResult.embeddings)
    updates.seeds = patch.seeds
    updates.seeds_embedding = toPgVector(centroid)
    updates.embedding_model = embResult.model
    reembedModel = embResult.model
    // Purge archive (seeds changé → topics stale)
    await supabase.from('topics_archive').delete().eq('topic_of_interest_id', id)
    // Reset compteurs + status
    updates.signals_count = 0
    updates.topics_count = 0
    updates.status = 'collecting'
    updates.next_collect_at = new Date().toISOString()
    updates.last_collected_at = null
    updates.last_error = null
  }

  const { data: updated, error: updErr } = await supabase
    .from('topics_of_interest')
    .update(updates)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select(SELECT_COLUMNS)
    .single()
  if (updErr) {
    return jsonResp({ ok: false, error: 'update_failed', detail: updErr.message }, 500, cors)
  }

  // Si seeds re-embed → retrigger collect en background
  if (reembedModel) {
    scheduleFirstCollect(supabaseUrl, serviceKey, id)
  }

  return jsonResp(
    {
      ok: true,
      topic_of_interest: updated,
      ...(reembedModel ? { reembedded_with: reembedModel } : {}),
    },
    200,
    cors,
  )
}

// ─── DELETE (cascade) ───────────────────────────────────────────────────────

async function handleDelete(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerUserId: string,
  id: string,
  cors: Record<string, string>,
): Promise<Response> {
  // RLS + filtre owner_user_id : si la row n'appartient pas au caller, rien ne se passe.
  const { error, count } = await supabase
    .from('topics_of_interest')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
  if (error) {
    return jsonResp({ ok: false, error: 'delete_failed', detail: error.message }, 500, cors)
  }
  if (!count) {
    return jsonResp({ ok: false, error: 'not_found' }, 404, cors)
  }
  // topics_archive cascade automatique via FK ON DELETE CASCADE.
  return jsonResp({ ok: true, deleted: count }, 200, cors)
}

// Re-export pour les tests.
export { handler as topicsOfInterestHandler }

// Boot Deno.serve seulement si exécuté en runtime (pas en import test).
if (import.meta.main) {
  Deno.serve(handler)
}
