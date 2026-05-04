import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'
import {
  buildDispatchList,
  buildLogPayload,
  filterRequeuable,
  PASS_KIND_TO_FN,
  type PassKind,
  type PendingCountRow,
  type DispatchResult,
} from './orchestrator.ts'

/**
 * process-pending-enrichments — Orchestrateur cron 30min.
 *
 * POST /process-pending-enrichments
 * Auth : SUPABASE_SERVICE_ROLE_KEY (cron système, pas de user auth)
 *
 * Logique :
 *   1. Requeue les jobs failed (attempts < 5) : UPDATE status='pending'
 *   2. Compte les pending par pass_kind
 *   3. Pour chaque pass_kind avec >= 1 job pending : appel HTTP fire-and-forget
 *      vers l'edge fn correspondante (enrich-entities / compute-reputation / cluster-signals)
 *   4. Loggue l'exécution dans logs (action='cron:process-pending')
 *   5. Retourne { ok: true, dispatched: string[], requeued: number }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Timeout de validation de réponse pour chaque fn (ms) */
const DISPATCH_TIMEOUT_MS = 5_000

interface FailedJobRow {
  id: string
  attempts: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 204)
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  // Client service_role : bypass RLS, pas d'auth user
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // -------------------------------------------------------------------------
  // 1. Requeue les jobs failed avec attempts < 5
  // -------------------------------------------------------------------------
  const { data: failedJobs, error: failedErr } = await supabase
    .from('pending_enrichments')
    .select('id, attempts')
    .eq('status', 'failed')
    .lt('attempts', 5)

  if (failedErr) {
    const f = formatError(failedErr)
    return json({ error: 'fetch_failed_jobs_error', detail: f.message }, 500)
  }

  const requeuableIds = filterRequeuable((failedJobs ?? []) as FailedJobRow[])
  let requeued = 0

  if (requeuableIds.length > 0) {
    const { error: requeueErr } = await supabase
      .from('pending_enrichments')
      .update({ status: 'pending', scheduled_at: new Date().toISOString() })
      .in('id', requeuableIds)

    if (requeueErr) {
      // Non bloquant : on log et on continue
      console.error('[process-pending-enrichments] requeue error:', formatError(requeueErr))
    } else {
      requeued = requeuableIds.length
    }
  }

  // -------------------------------------------------------------------------
  // 2. Compter les pending par pass_kind
  // -------------------------------------------------------------------------
  // On interroge les 3 pass_kind connus directement pour éviter un GROUP BY
  // qui n'est pas supporté facilement via le client Supabase JS.
  const passKinds: PassKind[] = ['entities', 'reputation', 'clustering']
  const pendingCounts: PendingCountRow[] = []

  for (const kind of passKinds) {
    const { count, error: countErr } = await supabase
      .from('pending_enrichments')
      .select('id', { count: 'exact', head: true })
      .eq('pass_kind', kind)
      .eq('status', 'pending')

    if (countErr) {
      console.error(`[process-pending-enrichments] count error for ${kind}:`, formatError(countErr))
      pendingCounts.push({ pass_kind: kind, count: 0 })
    } else {
      pendingCounts.push({ pass_kind: kind, count: count ?? 0 })
    }
  }

  // -------------------------------------------------------------------------
  // 3. Dispatcher vers chaque fn concernée (fire-and-forget)
  // -------------------------------------------------------------------------
  const toDispatch = buildDispatchList(pendingCounts)
  const dispatchResults: DispatchResult[] = []

  const serviceRoleHeader = `Bearer ${serviceRoleKey}`

  for (const kind of toDispatch) {
    const fnPath = PASS_KIND_TO_FN[kind]
    const fnUrl = `${supabaseUrl}${fnPath}`

    let result: DispatchResult
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS)

      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: serviceRoleHeader,
        },
        body: '{}',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      result = { kind, ok: resp.ok, status: resp.status }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result = { kind, ok: false, error: msg }
    }

    dispatchResults.push(result)
  }

  // -------------------------------------------------------------------------
  // 4. Logger dans la table logs (user_id null pour les crons système)
  // -------------------------------------------------------------------------
  const logPayload = buildLogPayload(toDispatch, requeued, dispatchResults)

  await supabase.from('logs').insert({
    user_id: null,
    org_id: null,
    action: 'cron:process-pending',
    status: 'ok',
    payload: logPayload,
  })

  // -------------------------------------------------------------------------
  // 5. Réponse
  // -------------------------------------------------------------------------
  return json(
    {
      ok: true,
      dispatched: toDispatch,
      requeued,
    },
    200,
  )
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
