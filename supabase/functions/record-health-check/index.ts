import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * record-health-check — Edge function POST appelée par :
 *   - le pg_cron (toutes les minutes via supabase_functions.http_request)
 *   - ou un système externe type UptimeRobot / BetterStack avec un secret partagé
 *
 * Elle invoque la edge fn `health`, parse les résultats, et persiste chaque
 * sonde dans la table `health_checks` via le client `service_role` (qui
 * bypasse RLS — la table n'a aucune policy INSERT pour les rôles standards,
 * cf. migration 20260502000012_health_checks.sql).
 *
 * Sécurité : un secret `HEALTH_RECORD_SECRET` est attendu dans le header
 * `x-health-secret` ; sans correspondance → 401. Si le secret n'est pas
 * configuré côté serveur, la fonction refuse tout appel (fail-closed).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-health-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ServiceName = 'db' | 'minio' | 'llm' | 'apify'
type Status = 'ok' | 'degraded' | 'down'

interface ProbeResult {
  service: ServiceName
  status: Status
  latency_ms: number | null
  error?: string
}

interface HealthResponse {
  ok: boolean
  checked_at: string
  results: ProbeResult[]
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // --- Auth shared-secret (fail-closed) ---
  const expected = Deno.env.get('HEALTH_RECORD_SECRET')
  if (!expected) {
    return json({ ok: false, error: 'health_record_secret_not_configured' }, 500)
  }
  const provided = req.headers.get('x-health-secret')
  if (provided !== expected) {
    return json({ ok: false, error: 'forbidden' }, 401)
  }

  // --- Env ---
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  // --- Invoke health probe ---
  const healthUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/health`
  let healthRes: HealthResponse
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    // 200 (all ok) ou 503 (some down) sont des réponses valides ici — on
    // veut justement enregistrer les `down`. Seul un crash réseau est fatal.
    healthRes = (await res.json()) as HealthResponse
  } catch (err) {
    return json({ ok: false, error: 'health_probe_failed', detail: errMsg(err) }, 502)
  }

  if (!Array.isArray(healthRes?.results)) {
    return json({ ok: false, error: 'invalid_health_response' }, 502)
  }

  // --- Persist en bulk ---
  const supabase = createClient(supabaseUrl, serviceKey)
  const rows = healthRes.results.map((r) => ({
    checked_at: healthRes.checked_at ?? new Date().toISOString(),
    service: r.service,
    status: r.status,
    latency_ms: r.latency_ms,
    error: r.error ? r.error.slice(0, 500) : null,
  }))

  const { error } = await supabase.from('health_checks').insert(rows)
  if (error) {
    return json({ ok: false, error: 'insert_failed', detail: error.message }, 500)
  }

  return json(
    {
      ok: true,
      recorded: rows.length,
      checked_at: healthRes.checked_at,
      all_ok: healthRes.ok,
    },
    200,
  )
})

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
