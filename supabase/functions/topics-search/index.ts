/**
 * topics-search — Endpoint cœur du workflow watchlist Bassira.
 *
 * Bassira appelle CET endpoint avant tout pipeline live :
 *   - Compute embedding du seed user
 *   - Match contre les seeds_embedding des topics_of_interest de l'owner
 *   - Si match (cosine ≥ threshold) ET freshness OK → return topics_archive (cache)
 *   - Sinon → suggestion : create_or_collect
 *
 * Auth : x-api-key (Bassira). owner_user_id = proxy_user_id.
 *
 * Body :
 *   {
 *     "seed": "string 50-3000 chars",
 *     "lang": "fr" | "en" | "ar",
 *     "min_similarity": 0.75,    // optionnel, défaut 0.75
 *     "max_age_days": 30,        // optionnel, défaut 30 (cohérent avec TTL archive)
 *     "limit_topics": 8          // optionnel, défaut 8 (cohérent output_profile=light)
 *   }
 *
 * Réponse 200 (matched) :
 *   {
 *     ok: true, matched: true,
 *     topic_of_interest: { id, name, similarity, ... },
 *     topics: [ ...topics_archive rows non-expirés du sujet... ],
 *     source: "cache",
 *     freshness: { last_collected_at, age_hours },
 *     embedding: { model, provider, dimensions }
 *   }
 *
 * Réponse 200 (no match) :
 *   {
 *     ok: true, matched: false,
 *     suggestion: "create_or_collect",
 *     embedding: { model, provider, dimensions }
 *   }
 *
 * Réponse 4xx/5xx sur erreur (cf. error codes inline).
 *
 * BYOK strict — embedding via dashscope/openai/openrouter selon proxy_user settings.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  EMBEDDING_DIMS,
  embedText,
  NoEmbeddingProviderError,
  toPgVector,
} from '../_shared/embeddings.ts'
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const SEED_MIN = 50
const SEED_MAX = 3000
const DEFAULT_MIN_SIMILARITY = 0.75
const DEFAULT_MAX_AGE_DAYS = 30
const DEFAULT_LIMIT_TOPICS = 8

interface SearchBody {
  seed: string
  lang: 'fr' | 'en' | 'ar'
  min_similarity: number
  max_age_days: number
  limit_topics: number
}

interface BodyValidationResult {
  ok: boolean
  body?: SearchBody
  error?: string
}

function validateSearchBody(raw: unknown): BodyValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' }
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.seed !== 'string') return { ok: false, error: 'seed_required' }
  const seed = obj.seed.trim()
  if (seed.length < SEED_MIN) return { ok: false, error: 'seed_too_short' }
  if (seed.length > SEED_MAX) return { ok: false, error: 'seed_too_long' }

  if (
    typeof obj.lang !== 'string' ||
    (obj.lang !== 'fr' && obj.lang !== 'en' && obj.lang !== 'ar')
  ) {
    return { ok: false, error: 'lang_unsupported' }
  }

  let min_similarity = DEFAULT_MIN_SIMILARITY
  if (obj.min_similarity !== undefined && obj.min_similarity !== null) {
    if (typeof obj.min_similarity !== 'number' || !Number.isFinite(obj.min_similarity)) {
      return { ok: false, error: 'min_similarity_must_be_number' }
    }
    if (obj.min_similarity < 0 || obj.min_similarity > 1) {
      return { ok: false, error: 'min_similarity_out_of_range' }
    }
    min_similarity = obj.min_similarity
  }

  let max_age_days = DEFAULT_MAX_AGE_DAYS
  if (obj.max_age_days !== undefined && obj.max_age_days !== null) {
    if (
      typeof obj.max_age_days !== 'number' ||
      !Number.isInteger(obj.max_age_days) ||
      obj.max_age_days < 1 ||
      obj.max_age_days > 365
    ) {
      return { ok: false, error: 'max_age_days_invalid' }
    }
    max_age_days = obj.max_age_days
  }

  let limit_topics = DEFAULT_LIMIT_TOPICS
  if (obj.limit_topics !== undefined && obj.limit_topics !== null) {
    if (
      typeof obj.limit_topics !== 'number' ||
      !Number.isInteger(obj.limit_topics) ||
      obj.limit_topics < 1 ||
      obj.limit_topics > 50
    ) {
      return { ok: false, error: 'limit_topics_invalid' }
    }
    limit_topics = obj.limit_topics
  }

  return {
    ok: true,
    body: {
      seed,
      lang: obj.lang as 'fr' | 'en' | 'ar',
      min_similarity,
      max_age_days,
      limit_topics,
    },
  }
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
  if (req.method !== 'POST') {
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

  // Auth x-api-key
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)
  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }
  const proxyUserId = keyValidation.key.proxy_user_id
  if (!proxyUserId) {
    return jsonResp({ ok: false, error: 'service_setup_incomplete' }, 500, cors)
  }

  // Body
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResp({ ok: false, error: 'invalid_json' }, 400, cors)
  }
  const v = validateSearchBody(raw)
  if (!v.ok) return jsonResp({ ok: false, error: 'bad_body', detail: v.error }, 400, cors)
  const body = v.body!

  // Embed le seed user
  let embedding: number[]
  let embProvider: string
  let embModel: string
  try {
    const result = await embedText(supabase, proxyUserId, body.seed, { dimensions: EMBEDDING_DIMS })
    embedding = result.embedding
    embProvider = result.provider
    embModel = result.model
  } catch (err) {
    if (err instanceof NoEmbeddingProviderError) {
      return jsonResp(
        {
          ok: false,
          error: 'no_embedding_provider',
          detail:
            'No DashScope / OpenAI / OpenRouter key configured for proxy_user. Cannot match against watchlist.',
        },
        500,
        cors,
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResp({ ok: false, error: 'embedding_failed', detail: msg.slice(0, 200) }, 502, cors)
  }

  // Match contre topics_of_interest via RPC pgvector
  const { data: matches, error: rpcErr } = await supabase.rpc('topics_of_interest_match', {
    query_embedding: toPgVector(embedding),
    owner_uid: proxyUserId,
    match_threshold: body.min_similarity,
    match_count: 1,
  })
  if (rpcErr) {
    return jsonResp({ ok: false, error: 'rpc_failed', detail: rpcErr.message }, 500, cors)
  }

  const matched = Array.isArray(matches) && matches.length > 0 ? matches[0] : null
  const embMetadata = {
    model: embModel,
    provider: embProvider,
    dimensions: EMBEDDING_DIMS,
  }

  if (!matched) {
    return jsonResp(
      {
        ok: true,
        matched: false,
        suggestion: 'create_or_collect',
        message:
          'No matching topic_of_interest found above threshold. Create one via POST /topics-of-interest or use research-from-seed for a one-shot pipeline.',
        embedding: embMetadata,
      },
      200,
      cors,
    )
  }

  // Match trouvé — fetch topics_archive non-expirés du sujet
  const ageCutoff = new Date(Date.now() - body.max_age_days * 24 * 60 * 60 * 1000).toISOString()
  const { data: topics, error: archErr } = await supabase
    .from('topics_archive')
    .select(
      'id, topic_label, topic_summary, topic_type, dominant_angle, brief_variants, key_signals, provenance, cultural_warnings, source_seed, source_seed_index, audit_verdict, quality_warning, collected_at, expires_at',
    )
    .eq('topic_of_interest_id', matched.id)
    .gt('expires_at', new Date().toISOString())
    .gt('collected_at', ageCutoff)
    .order('collected_at', { ascending: false })
    .limit(body.limit_topics)
  if (archErr) {
    return jsonResp(
      { ok: false, error: 'archive_query_failed', detail: archErr.message },
      500,
      cors,
    )
  }

  const lastCollectedAt = matched.last_collected_at as string | null
  let ageHours: number | null = null
  if (lastCollectedAt) {
    ageHours = Math.round((Date.now() - new Date(lastCollectedAt).getTime()) / (1000 * 60 * 60))
  }

  return jsonResp(
    {
      ok: true,
      matched: true,
      topic_of_interest: {
        id: matched.id,
        name: matched.name,
        seeds: matched.seeds,
        lang: matched.lang,
        scope_profile: matched.scope_profile,
        status: matched.status,
        similarity: matched.similarity,
        last_collected_at: matched.last_collected_at,
        topics_count: matched.topics_count,
      },
      topics: topics ?? [],
      source: 'cache',
      freshness: {
        last_collected_at: lastCollectedAt,
        age_hours: ageHours,
        archive_count: (topics ?? []).length,
      },
      embedding: embMetadata,
    },
    200,
    cors,
  )
}

if (import.meta.main) {
  Deno.serve(handler)
}
