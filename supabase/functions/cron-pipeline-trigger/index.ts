// cron-pipeline-trigger — porté de Saqr (P1, doc portage
// docs/bridges/prompt-portage-saqr-vers-kairos.md), adapté multi-tenant Kairos.
//
// Wrapper invoqué par pg_cron pour déclencher le pipeline quotidien.
// Protégé par un secret partagé (x-cron-secret = env CRON_SECRET, comparaison
// constant-time), puis pour chaque utilisateur ciblé :
//   1. POST /functions/v1/run-pipeline en mode interne (ADR 0009 :
//      buildInternalHeaders — x-internal-secret + x-proxy-user-id)
//   2. Met à jour settings.cron_last_run_at + cron_last_run_status
//
// Ciblage : body { user_id } → un seul utilisateur ; body vide → tous les
// utilisateurs avec settings.cron_enabled = true (opt-in, migration
// 20260512000002). Exécution séquentielle : les runs partagent les quotas
// Apify/LLM, le parallélisme n'apporterait que des 429.
//
// IMPORTANT : déployer avec --no-verify-jwt. Protection = x-cron-secret.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildInternalHeaders, constantTimeEquals, isUuid } from '../_shared/internal-auth.ts'
import { retryWithBackoff } from '../_shared/retry.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  user_id?: string
}

interface RunResult {
  user_id: string
  status: string
  detail: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'supabase_env_missing' }, 500)

  // Auth : secret cron dédié, comparé en constant-time.
  const expectedSecret = Deno.env.get('CRON_SECRET')?.trim() ?? ''
  if (!expectedSecret) return json({ error: 'cron_secret_not_configured' }, 500)
  const provided = req.headers.get('x-cron-secret')?.trim() ?? ''
  if (!provided || !constantTimeEquals(provided, expectedSecret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    // body vide = tous les users opt-in
  }

  // Ciblage
  let userIds: string[]
  if (body.user_id !== undefined) {
    const userId = body.user_id.trim()
    if (!isUuid(userId)) return json({ error: 'user_id_invalid' }, 400)
    userIds = [userId]
  } else {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('user_id')
      .eq('cron_enabled', true)
    if (error) return json({ error: 'settings_query_failed', detail: error.message }, 500)
    userIds = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
  }

  if (userIds.length === 0) {
    return json({ ok: true, triggered: 0, results: [] }, 200)
  }

  const runPipelineUrl = `${supabaseUrl}/functions/v1/run-pipeline`
  const results: RunResult[] = []

  for (const userId of userIds) {
    await supabaseAdmin
      .from('settings')
      .update({ cron_last_run_at: new Date().toISOString(), cron_last_run_status: 'running' })
      .eq('user_id', userId)

    let status = 'unknown'
    let detail = ''
    try {
      // Retry 3x sur 5xx + 429 (transient). Un autre 4xx n'est PAS retried :
      // ré-essayer ne corrige ni l'auth ni le payload.
      const res = await retryWithBackoff(
        async () => {
          const r = await fetch(runPipelineUrl, {
            method: 'POST',
            headers: buildInternalHeaders(userId),
            body: JSON.stringify({}),
          })
          if (r.status >= 500 || r.status === 429) {
            throw new Error(`run_pipeline_http_${r.status}`)
          }
          return r
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          shouldRetry: (e: unknown) =>
            /run_pipeline_http_(?:5\d{2}|429)|fetch failed|abort|timeout|ECONNRESET|ETIMEDOUT/i.test(
              e instanceof Error ? e.message : String(e),
            ),
        },
      )
      if (res.ok) {
        status = 'ok'
        detail = (await res.text().catch(() => '')).slice(0, 200)
      } else {
        status = `http_${res.status}`
        detail = (await res.text().catch(() => '')).slice(0, 200)
      }
    } catch (err) {
      status = 'fetch_failed'
      detail = err instanceof Error ? err.message : String(err)
    }

    await supabaseAdmin
      .from('settings')
      .update({ cron_last_run_status: status })
      .eq('user_id', userId)

    // Log best-effort (logs.org_id NOT NULL → org du user résolu explicitement)
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const orgId = (member as { org_id?: string } | null)?.org_id ?? null
    if (orgId) {
      await supabaseAdmin.from('logs').insert({
        user_id: userId,
        org_id: orgId,
        action: 'cron:pipeline-trigger',
        status: status === 'ok' ? 'ok' : 'error',
        payload: { status, detail },
      })
    }

    results.push({ user_id: userId, status, detail })
  }

  const allOk = results.every((r) => r.status === 'ok')
  return json({ ok: allOk, triggered: results.length, results }, allOk ? 200 : 500)
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
