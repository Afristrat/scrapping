// =============================================================================
// Wave 6 — Sub-wave 6.4 — Story S6-BYOKProvisioning
// Edge function `validate-api-key`
//
// Pingue un provider externe avec une clé API fournie pour vérifier qu'elle
// est valide. NE STOCKE PAS la clé — c'est uniquement un test de connectivité
// + d'authentification.
//
// Pour chaque provider on appelle un endpoint léger (souvent `/models`) avec
// un timeout de 10 s. Le statut renvoyé est l'un de :
//   - 'verified'      → 2xx, la clé est bonne
//   - 'invalid'       → 401/403 ou auth refusée
//   - 'rate_limited'  → 429
//   - 'unreachable'   → timeout, DNS, 5xx, autre erreur réseau
//
// Sécurité : la clé reçue dans le body N'EST JAMAIS loggée (même tronquée).
// Seuls le provider et le statut sont écrits dans `audit_log` / `logs`.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { audit, extractAuditContext } from '../_shared/audit.ts'
import { formatError } from '../_shared/errors.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIMEOUT_MS = 10_000

type ValidationStatus = 'verified' | 'invalid' | 'rate_limited' | 'unreachable'

interface RequestBody {
  provider: string
  api_key: string
  base_url?: string
}

interface ValidationResult {
  ok: boolean
  provider: string
  status: ValidationStatus
  detail?: string
  models_count?: number
  latency_ms: number
}

/**
 * Configuration de ping par provider.
 *
 * `auth_query` : pour Google et Apify, la clé passe en query-string (`?key=…`
 * ou `?token=…`) plutôt qu'en header — pattern documenté chez chaque
 * provider. C'est volontaire pour rester aligné avec leurs SDK officiels.
 */
type PingConfig = {
  url: string
  method?: 'GET' | 'POST'
  authHeader?: string
  authValue?: (k: string) => string
  authQuery?: string
  body?: unknown
  extraHeaders?: Record<string, string>
  parseModelsCount?: (json: unknown) => number | undefined
  noAuth?: boolean
}

const PROVIDER_PING: Record<string, PingConfig> = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  anthropic: {
    // Endpoint /v1/models existe et accepte une simple GET avec x-api-key.
    url: 'https://api.anthropic.com/v1/models',
    method: 'GET',
    authHeader: 'x-api-key',
    authValue: (k) => k,
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  google: {
    // Gemini : endpoint OpenAI-compatible expose /models avec Bearer.
    // On garde l'endpoint legacy pour bénéficier de l'auth via query-param
    // qui est le pattern documenté par Google.
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    method: 'GET',
    authQuery: 'key',
    parseModelsCount: (j) => (j as { models?: unknown[] })?.models?.length,
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  together: {
    url: 'https://api.together.xyz/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) =>
      Array.isArray(j) ? j.length : (j as { data?: unknown[] })?.data?.length,
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  moonshot: {
    url: 'https://api.moonshot.ai/v1/models',
    method: 'GET',
    authHeader: 'Authorization',
    authValue: (k) => `Bearer ${k}`,
    parseModelsCount: (j) => (j as { data?: unknown[] })?.data?.length,
  },
  apify: {
    // Apify utilise un query-param `token` pour l'auth — pattern officiel
    // documenté dans l'API REST Apify.
    url: 'https://api.apify.com/v2/users/me',
    method: 'GET',
    authQuery: 'token',
  },
  // Ollama est traité dynamiquement (base_url custom + pas d'auth)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ ok: false, error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body.provider || typeof body.provider !== 'string') {
    return json({ ok: false, error: 'provider_required' }, 400)
  }
  if (!body.api_key && body.provider !== 'ollama') {
    return json({ ok: false, error: 'api_key_required' }, 400)
  }

  // Résolution de l'org pour audit_log (nullable si user pas dans une org)
  const { data: memberRow } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  const orgId = (memberRow as { org_id?: string } | null)?.org_id ?? null

  const result = await validateProvider(body)

  // Audit log : on ne log JAMAIS la clé (même tronquée), seulement provider + statut.
  if (orgId) {
    await audit(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'api_key.update',
      severity: result.status === 'verified' ? 'info' : 'warning',
      entity_type: 'api_key',
      entity_id: body.provider,
      description: `Validation clé API ${body.provider} → ${result.status}`,
      metadata: {
        provider: body.provider,
        status: result.status,
        latency_ms: result.latency_ms,
      },
      ...extractAuditContext(req),
    })
  }

  return json(result, 200)
})

async function validateProvider(body: RequestBody): Promise<ValidationResult> {
  const start = performance.now()
  const provider = body.provider

  // Cas Ollama : pas dans PROVIDER_PING, traitement custom (no-auth + base_url)
  if (provider === 'ollama') {
    return await pingOllama(body.base_url, start)
  }

  const cfg = PROVIDER_PING[provider]
  if (!cfg) {
    return {
      ok: false,
      provider,
      status: 'unreachable',
      detail: `unknown_provider: ${provider}`,
      latency_ms: Math.round(performance.now() - start),
    }
  }

  let url = cfg.url
  const headers: Record<string, string> = { ...(cfg.extraHeaders ?? {}) }

  if (cfg.authQuery) {
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}${cfg.authQuery}=${encodeURIComponent(body.api_key)}`
  } else if (cfg.authHeader && cfg.authValue) {
    headers[cfg.authHeader] = cfg.authValue(body.api_key)
  }

  return await doFetch({
    provider,
    url,
    method: cfg.method ?? 'GET',
    headers,
    body: cfg.body,
    parseModelsCount: cfg.parseModelsCount,
    start,
  })
}

async function pingOllama(baseUrl: string | undefined, start: number): Promise<ValidationResult> {
  const url = `${(baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '')}/api/tags`
  return await doFetch({
    provider: 'ollama',
    url,
    method: 'GET',
    headers: {},
    parseModelsCount: (j) => (j as { models?: unknown[] })?.models?.length,
    start,
  })
}

interface DoFetchArgs {
  provider: string
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: unknown
  parseModelsCount?: (json: unknown) => number | undefined
  start: number
}

async function doFetch(args: DoFetchArgs): Promise<ValidationResult> {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const init: RequestInit = {
    method: args.method,
    headers: {
      ...args.headers,
      ...(args.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: ctrl.signal,
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
  }

  try {
    const res = await fetch(args.url, init)
    clearTimeout(timeout)
    const latency = Math.round(performance.now() - args.start)

    if (res.ok) {
      let modelsCount: number | undefined
      if (args.parseModelsCount) {
        try {
          const parsed = await res.json()
          modelsCount = args.parseModelsCount(parsed)
        } catch {
          // Pas grave : la clé est valide même si la réponse n'est pas JSON
        }
      }
      return {
        ok: true,
        provider: args.provider,
        status: 'verified',
        models_count: modelsCount,
        latency_ms: latency,
      }
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        provider: args.provider,
        status: 'invalid',
        detail: `http_${res.status}`,
        latency_ms: latency,
      }
    }
    if (res.status === 429) {
      return {
        ok: false,
        provider: args.provider,
        status: 'rate_limited',
        detail: `http_${res.status}`,
        latency_ms: latency,
      }
    }
    return {
      ok: false,
      provider: args.provider,
      status: 'unreachable',
      detail: `http_${res.status}`,
      latency_ms: latency,
    }
  } catch (err) {
    clearTimeout(timeout)
    const latency = Math.round(performance.now() - args.start)
    const formatted = formatError(err)
    const isAbort = formatted.name === 'AbortError' || /abort/i.test(formatted.message)
    return {
      ok: false,
      provider: args.provider,
      status: 'unreachable',
      detail: isAbort ? 'timeout' : formatted.message.slice(0, 200),
      latency_ms: latency,
    }
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
