import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'
import { constantTimeEquals } from '../_shared/internal-auth.ts'
import { computeReputationScore } from './reputation.ts'

/**
 * compute-reputation — Recalcule le score de réputation des auteurs (entités kind='person')
 * en traitant la file d'attente pending_enrichments WHERE pass_kind='reputation'.
 *
 * POST /compute-reputation
 * Auth : x-cron-secret (service_role, toutes orgs) OU bearer JWT user standard.
 *
 * Logique :
 *   1. Récupère jusqu'à 100 pending_enrichments WHERE pass_kind='reputation' AND status='pending'
 *      ORDER BY scheduled_at ASC
 *   2. Marque status='in_progress', started_at=now() pour le batch
 *   3. Pour chaque job :
 *      a. Récupère l'entité kind='person' liée au signal (via signal_entities)
 *      b. Si aucune entité person → skip, marquer completed
 *      c. Calcule reputation_score sur une fenêtre glissante de 90 jours :
 *           n_total = COUNT(signal_entities WHERE entity = auteur, dans la fenêtre)
 *           n_high  = COUNT(signaux scorés >= 70, dans la même fenêtre)
 *           reputation = (n_high / GREATEST(n_total, 1)) × 0.8
 *                      + log(1 + n_total) / 10 × 0.2
 *           clampé dans [0, 1]
 *      d. Met à jour entities.metadata avec { reputation_score: <valeur> }
 *      e. Met à jour entities.last_seen_at = now()
 *      f. Marque pending_enrichment status='completed', completed_at=now()
 *   4. Log global dans logs (action='compute:reputation')
 *   5. Aucun appel LLM → coût = 0
 *   6. Retourne { ok: true, processed, failed }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BATCH_SIZE = 100
const WINDOW_DAYS = 90

interface PendingEnrichmentRow {
  id: string
  signal_id: string
  org_id: string
  attempts: number
}

interface SignalEntityRow {
  entity_id: string
  entities: {
    id: string
    kind: string
    metadata: Record<string, unknown> | null
  } | null
}

interface ScoreRow {
  score: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  // Auth : x-cron-secret (service_role, toutes orgs) OU bearer JWT user. Le
  // bypass cron court-circuite getUser() même si Authorization est aussi
  // présent (le cron envoie les deux — cf. cluster-signals, même piège).
  const cronSecretHeader = req.headers.get('x-cron-secret')
  const expectedCronSecret = Deno.env.get('CRON_SECRET')
  const isCronCall =
    !!expectedCronSecret &&
    !!cronSecretHeader &&
    constantTimeEquals(cronSecretHeader, expectedCronSecret)

  let userId: string | null = null
  let supabase: SupabaseClient

  if (isCronCall) {
    supabase = createClient(supabaseUrl, supabaseServiceKey)
  } else {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'missing_authorization' }, 401)
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: auth } },
    })
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'invalid_token' }, 401)
    userId = user.id
  }

  // 1. Récupérer le batch de jobs pending
  const { data: jobs, error: jobsErr } = await supabase
    .from('pending_enrichments')
    .select('id, signal_id, org_id, attempts')
    .eq('pass_kind', 'reputation')
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (jobsErr) {
    const f = formatError(jobsErr)
    return json({ error: 'fetch_jobs_failed', detail: f.message }, 500)
  }

  const batch = (jobs ?? []) as PendingEnrichmentRow[]

  if (batch.length === 0) {
    return json({ ok: true, processed: 0, failed: 0 }, 200)
  }

  // 2. Marquer le batch in_progress
  const batchIds = batch.map((j) => j.id)
  await supabase
    .from('pending_enrichments')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .in('id', batchIds)

  let totalProcessed = 0
  let totalFailed = 0

  // 3. Traiter chaque job séquentiellement
  for (const job of batch) {
    const result = await processReputationJob(job, supabase)
    if (result.ok) {
      totalProcessed++
    } else {
      totalFailed++
      await supabase
        .from('pending_enrichments')
        .update({
          status: 'failed',
          attempts: job.attempts + 1,
          last_error: result.error ?? 'unknown_error',
        })
        .eq('id', job.id)
    }
  }

  // 4. Logger le résultat global (user_id null pour les crons système)
  await supabase.from('logs').insert({
    user_id: userId,
    action: 'compute:reputation',
    status: 'ok',
    payload: {
      processed: totalProcessed,
      failed: totalFailed,
      batch_size: batch.length,
    },
  })

  return json({ ok: true, processed: totalProcessed, failed: totalFailed }, 200)
})

/**
 * Traite un job de calcul de réputation pour un signal donné.
 */
async function processReputationJob(
  job: PendingEnrichmentRow,
  supabase: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  // a. Récupérer l'entité kind='person' liée à ce signal
  const { data: seData, error: seErr } = await supabase
    .from('signal_entities')
    .select('entity_id, entities!inner(id, kind, metadata)')
    .eq('signal_id', job.signal_id)
    .eq('org_id', job.org_id)
    .eq('entities.kind', 'person')
    .maybeSingle()

  if (seErr) {
    const f = formatError(seErr)
    return { ok: false, error: `signal_entities_fetch_failed: ${f.message}` }
  }

  const seRow = seData as SignalEntityRow | null

  // b. Si aucune entité person → skip, marquer completed
  if (!seRow || !seRow.entities) {
    await supabase
      .from('pending_enrichments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', job.id)
    return { ok: true }
  }

  const entityId = seRow.entity_id
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // c. Calculer n_total : signaux de cet auteur dans la fenêtre 90j
  const { count: nTotal, error: nTotalErr } = await supabase
    .from('signal_entities')
    .select('signal_id', { count: 'exact', head: true })
    .eq('entity_id', entityId)
    .eq('org_id', job.org_id)
    .gte('signals.scraped_at', windowStart)

  if (nTotalErr) {
    const f = formatError(nTotalErr)
    return { ok: false, error: `n_total_fetch_failed: ${f.message}` }
  }

  // c. Calculer n_high : signaux de cet auteur avec score >= 70 dans la fenêtre
  // On récupère les signal_ids de l'auteur, puis on compte ceux qui ont un score >= 70
  const { data: authorSignals, error: authorErr } = await supabase
    .from('signal_entities')
    .select('signal_id')
    .eq('entity_id', entityId)
    .eq('org_id', job.org_id)

  if (authorErr) {
    const f = formatError(authorErr)
    return { ok: false, error: `author_signals_fetch_failed: ${f.message}` }
  }

  const authorSignalIds = ((authorSignals ?? []) as { signal_id: string }[]).map((r) => r.signal_id)

  let nHigh = 0
  if (authorSignalIds.length > 0) {
    const { data: highScores, error: scoresErr } = await supabase
      .from('scores')
      .select('score')
      .in('signal_id', authorSignalIds)
      .gte('score', 70)
      .gte('scored_at', windowStart)

    if (scoresErr) {
      const f = formatError(scoresErr)
      return { ok: false, error: `scores_fetch_failed: ${f.message}` }
    }
    nHigh = ((highScores ?? []) as ScoreRow[]).length
  }

  // c. Calcul du score
  const reputationScore = computeReputationScore(nTotal ?? 0, nHigh)

  // d. Mettre à jour entities.metadata avec reputation_score
  const existingMetadata = (seRow.entities.metadata ?? {}) as Record<string, unknown>
  const updatedMetadata = { ...existingMetadata, reputation_score: reputationScore }

  const { error: updateErr } = await supabase
    .from('entities')
    .update({
      metadata: updatedMetadata,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', entityId)

  if (updateErr) {
    const f = formatError(updateErr)
    return { ok: false, error: `entity_update_failed: ${f.message}` }
  }

  // f. Marquer le job completed
  await supabase
    .from('pending_enrichments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id)

  return { ok: true }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
