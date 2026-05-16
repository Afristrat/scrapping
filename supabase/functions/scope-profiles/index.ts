/**
 * scope-profiles — Endpoint GET pour lister les scope_profiles publics.
 *
 * Lecture seule. Permet à Bassira (et autres clients externes) de découvrir
 * dynamiquement les profils de coverage disponibles (morocco-tech, mena-business,
 * + futurs ajouts). Évite la liste hardcodée côté UI MiroShark.
 *
 * Auth : x-api-key (Bassira). Le scope_profiles.is_public=TRUE est lisible
 * par tout caller authentifié, indépendamment du proxy_user_id.
 *
 * GET /scope-profiles → { profiles: [{name, description, ...}] }
 *
 * Pas d'écriture exposée publiquement : les profils admin sont créés via
 * migration ou Studio.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { validateApiKey } from '../research-from-seed/lib.ts'

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
  if (allowed) headers['Access-Control-Allow-Origin'] = allowed
  return headers
}

function jsonResp(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  const cors = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    if (!resolveCorsOrigin(origin)) {
      return new Response(null, { status: 403, headers: cors })
    }
    return new Response(null, { status: 204, headers: cors })
  }
  if (req.method !== 'GET') {
    return jsonResp({ ok: false, error: 'method_not_allowed' }, 405, cors)
  }
  if (origin && !resolveCorsOrigin(origin)) {
    return jsonResp({ ok: false, error: 'cors_origin_not_allowed' }, 403, cors)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ ok: false, error: 'service_role_env_missing' }, 500, cors)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  // Auth x-api-key (tout caller authentifié peut voir les is_public=TRUE)
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)
  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }

  // Fetch les profils publics actifs (PostgREST direct, pas besoin de RPC)
  const { data, error } = await supabase
    .from('scope_profiles')
    .select(
      'id, name, description, x_handles, reddit_subs, arxiv_categories, rss_keywords, created_at, updated_at',
    )
    .eq('is_public', true)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) {
    return jsonResp({ ok: false, error: 'db_query_failed', detail: error.message }, 500, cors)
  }

  return jsonResp({ ok: true, count: (data ?? []).length, profiles: data ?? [] }, 200, cors)
}

if (import.meta.main) {
  Deno.serve(handler)
}
