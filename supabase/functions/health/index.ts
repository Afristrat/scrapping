import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * health — Edge function GET publique qui exécute en parallèle 4 sondes :
 *   - DB Postgres (SELECT 1 from organizations limit 1)
 *   - MinIO / S3 (HEAD bucket si MINIO_* configuré)
 *   - LLM provider (ping OpenRouter /api/v1/models si OPENROUTER_API_KEY set)
 *   - Apify (ping users/me si APIFY_TOKEN set)
 *
 * Retourne 200 si tous OK, 503 sinon. Le body est toujours un tableau de
 * { service, status, latency_ms, error? } — utilisable directement par les
 * sondes externes (UptimeRobot, BetterStack, statuspage.io...) ainsi que par
 * la edge fn `record-health-check` qui persiste les résultats.
 *
 * Note : aucune auth — endpoint volontairement public pour permettre aux
 * outils de monitoring tiers de pinger sans configurer de clé. La fonction
 * ne lit aucune donnée tenant : seule la connectivité technique est testée.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Seuil de latence au-delà duquel un service est `degraded` (en ms).
const DEGRADED_LATENCY_MS = 1500
// Timeout par sonde — au-delà, on considère le service `down`.
const PROBE_TIMEOUT_MS = 5000

type ServiceName = 'db' | 'minio' | 'llm' | 'apify'
type Status = 'ok' | 'degraded' | 'down'

interface ProbeResult {
  service: ServiceName
  status: Status
  latency_ms: number | null
  error?: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(
      [{ service: 'db', status: 'down', latency_ms: null, error: 'method_not_allowed' }],
      405,
    )
  }

  const probes: Array<Promise<ProbeResult>> = [probeDb(), probeMinio(), probeLlm(), probeApify()]

  const results = await Promise.all(probes)

  const allOk = results.every((r) => r.status === 'ok')
  const anyDown = results.some((r) => r.status === 'down')

  // 503 dès qu'un service est down ; 200 sinon (degraded reste 200, on
  // signale la dégradation par la valeur du champ `status` du payload).
  const httpStatus = anyDown ? 503 : 200

  return new Response(
    JSON.stringify({
      ok: allOk,
      checked_at: new Date().toISOString(),
      results,
    }),
    {
      status: httpStatus,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    },
  )
})

// =============================================================================
// Probes
// =============================================================================

async function probeDb(): Promise<ProbeResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey) {
    return { service: 'db', status: 'down', latency_ms: null, error: 'supabase_env_missing' }
  }

  const start = performance.now()
  try {
    const supabase = createClient(supabaseUrl, serviceKey)
    const { error } = await withTimeout(
      supabase.from('organizations').select('id').limit(1),
      PROBE_TIMEOUT_MS,
    )
    const latency = Math.round(performance.now() - start)
    if (error) {
      return { service: 'db', status: 'down', latency_ms: latency, error: error.message }
    }
    return {
      service: 'db',
      status: latency > DEGRADED_LATENCY_MS ? 'degraded' : 'ok',
      latency_ms: latency,
    }
  } catch (err) {
    return {
      service: 'db',
      status: 'down',
      latency_ms: Math.round(performance.now() - start),
      error: errMsg(err),
    }
  }
}

async function probeMinio(): Promise<ProbeResult> {
  const endpoint = Deno.env.get('MINIO_ENDPOINT')
  const bucket = Deno.env.get('MINIO_BUCKET')
  if (!endpoint || !bucket) {
    // MinIO non configuré → marqué `ok` mais signalé via error pour clarté.
    return { service: 'minio', status: 'ok', latency_ms: 0, error: 'not_configured' }
  }

  const start = performance.now()
  try {
    const url = `${endpoint.replace(/\/$/, '')}/${bucket}`
    const res = await withTimeout(fetch(url, { method: 'HEAD' }), PROBE_TIMEOUT_MS)
    const latency = Math.round(performance.now() - start)
    // 200, 403 (auth requise mais bucket joignable) et 404 sont acceptables.
    // 5xx ou erreur réseau = down.
    if (res.status >= 500) {
      return { service: 'minio', status: 'down', latency_ms: latency, error: `http_${res.status}` }
    }
    return {
      service: 'minio',
      status: latency > DEGRADED_LATENCY_MS ? 'degraded' : 'ok',
      latency_ms: latency,
    }
  } catch (err) {
    return {
      service: 'minio',
      status: 'down',
      latency_ms: Math.round(performance.now() - start),
      error: errMsg(err),
    }
  }
}

async function probeLlm(): Promise<ProbeResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return { service: 'llm', status: 'ok', latency_ms: 0, error: 'not_configured' }
  }

  const start = performance.now()
  try {
    const res = await withTimeout(
      fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }),
      PROBE_TIMEOUT_MS,
    )
    const latency = Math.round(performance.now() - start)
    if (!res.ok) {
      return { service: 'llm', status: 'down', latency_ms: latency, error: `http_${res.status}` }
    }
    return {
      service: 'llm',
      status: latency > DEGRADED_LATENCY_MS ? 'degraded' : 'ok',
      latency_ms: latency,
    }
  } catch (err) {
    return {
      service: 'llm',
      status: 'down',
      latency_ms: Math.round(performance.now() - start),
      error: errMsg(err),
    }
  }
}

async function probeApify(): Promise<ProbeResult> {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) {
    return { service: 'apify', status: 'ok', latency_ms: 0, error: 'not_configured' }
  }

  const start = performance.now()
  try {
    const res = await withTimeout(
      fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`, {
        method: 'GET',
      }),
      PROBE_TIMEOUT_MS,
    )
    const latency = Math.round(performance.now() - start)
    if (!res.ok) {
      return { service: 'apify', status: 'down', latency_ms: latency, error: `http_${res.status}` }
    }
    return {
      service: 'apify',
      status: latency > DEGRADED_LATENCY_MS ? 'degraded' : 'ok',
      latency_ms: latency,
    }
  } catch (err) {
    return {
      service: 'apify',
      status: 'down',
      latency_ms: Math.round(performance.now() - start),
      error: errMsg(err),
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function withTimeout<T>(promise: Promise<T> | PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500)
  if (typeof err === 'string') return err.slice(0, 500)
  try {
    return JSON.stringify(err).slice(0, 500)
  } catch {
    return 'unknown_error'
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
