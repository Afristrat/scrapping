import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'
import { parseNerResponse } from './ner.ts'

/**
 * enrich-entities — Traite la file d'attente NER (Named Entity Recognition) async.
 *
 * POST /enrich-entities
 * Auth : bearer token standard (appelé par pg_cron ou manuellement)
 *
 * Logique :
 *   1. Récupère 50 pending_enrichments WHERE pass_kind='entities' AND status='pending'
 *      ORDER BY scheduled_at ASC
 *   2. Marque status='in_progress', started_at=now() pour le batch
 *   3. Pour chaque signal (séquentiel) :
 *      a. Lit signals.title + raw_payload.text/body (max 1000 chars)
 *      b. Appel dispatch-llm task='enrichment' (Haiku) pour NER
 *      c. Parse la réponse JSON (robuste aux fences markdown)
 *      d. Pour chaque entité :
 *         - Upsert entities ON CONFLICT (org_id, kind, canonical_name) → DO NOTHING
 *         - Insert signal_entities (signal_id, entity_id, org_id, mention_text, confidence=0.8)
 *      e. UPDATE pending_enrichments SET status='completed', completed_at=now()
 *      f. Si erreur → SET status='failed', attempts=attempts+1, last_error=msg
 *   4. Logger dans logs (action='enrich:entities')
 *   5. Track coûts dans llm_costs (task='enrich:entities')
 *   6. Retourner { ok: true, processed, failed, cost }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HAIKU_MODEL = 'anthropic/claude-haiku-4-5-20251001'
const BATCH_SIZE = 50

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
}

interface PendingEnrichmentRow {
  id: string
  signal_id: string
  org_id: string
  attempts: number
}

interface SignalRow {
  id: string
  org_id: string
  title: string | null
  raw_payload: Record<string, unknown> | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  // 1. Récupérer 50 jobs pending
  const { data: jobs, error: jobsErr } = await supabase
    .from('pending_enrichments')
    .select('id, signal_id, org_id, attempts')
    .eq('pass_kind', 'entities')
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (jobsErr) {
    const f = formatError(jobsErr)
    return json({ error: 'fetch_jobs_failed', detail: f.message }, 500)
  }

  const batch = (jobs ?? []) as PendingEnrichmentRow[]

  if (batch.length === 0) {
    return json({ ok: true, processed: 0, failed: 0, cost: 0 }, 200)
  }

  // 2. Marquer les jobs in_progress
  const batchIds = batch.map((j) => j.id)
  await supabase
    .from('pending_enrichments')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .in('id', batchIds)

  // Préparer l'URL de dispatch-llm
  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`

  let totalProcessed = 0
  let totalFailed = 0
  let totalCost = 0

  // 3. Traiter chaque job séquentiellement
  for (const job of batch) {
    const {
      ok,
      cost,
      error: jobError,
    } = await processEnrichmentJob(job, supabase, dispatchUrl, auth, user.id)

    if (ok) {
      totalProcessed++
      totalCost += cost ?? 0
    } else {
      totalFailed++
      // Marquer le job failed avec incrémentation des tentatives
      await supabase
        .from('pending_enrichments')
        .update({
          status: 'failed',
          attempts: job.attempts + 1,
          last_error: jobError ?? 'unknown_error',
        })
        .eq('id', job.id)
    }
  }

  // 4. Logger le résultat global
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'enrich:entities',
    status: 'ok',
    payload: {
      processed: totalProcessed,
      failed: totalFailed,
      cost: totalCost,
      batch_size: batch.length,
    },
  })

  return json({ ok: true, processed: totalProcessed, failed: totalFailed, cost: totalCost }, 200)
})

/**
 * Traite un job d'enrichissement NER pour un signal donné.
 */
async function processEnrichmentJob(
  job: PendingEnrichmentRow,
  supabase: SupabaseClient,
  dispatchUrl: string,
  auth: string,
  userId: string,
): Promise<{ ok: boolean; cost?: number; error?: string }> {
  // a. Lire le signal
  const { data: signalData, error: signalErr } = await supabase
    .from('signals')
    .select('id, org_id, title, raw_payload')
    .eq('id', job.signal_id)
    .eq('org_id', job.org_id)
    .maybeSingle()

  if (signalErr || !signalData) {
    const f = formatError(signalErr)
    return { ok: false, error: `signal_not_found: ${f.message}` }
  }

  const signal = signalData as SignalRow
  const signalText = extractSignalText(signal)
  const snippet = `${signal.title ?? ''}\n${signalText}`.trim().slice(0, 1000)

  if (!snippet) {
    // Pas de texte → marquer completed sans entités
    await supabase
      .from('pending_enrichments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', job.id)
    return { ok: true, cost: 0 }
  }

  // b. Appel dispatch-llm (NER)
  let dispatchResp: DispatchResponse
  try {
    const res = await fetch(dispatchUrl, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'enrichment',
        cost_task: 'enrich:entities',
        messages: [
          {
            role: 'system',
            content: 'Extrais les entités nommées. Réponds UNIQUEMENT en JSON array.',
          },
          {
            role: 'user',
            content:
              `Texte: ${snippet}\n` +
              `Retourne: [{ kind: 'person'|'organization'|'technology'|'paper'|'product', canonical_name: '...', mention_text: '...' }]\n` +
              `Max 8 entités. JSON pur.`,
          },
        ],
        options: {
          max_tokens: 500,
          temperature: 0,
        },
      }),
    })
    dispatchResp = (await res.json()) as DispatchResponse
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `dispatch_fetch_failed: ${msg}` }
  }

  if (!dispatchResp.ok) {
    return { ok: false, error: `dispatch_error: ${dispatchResp.error ?? 'unknown'}` }
  }

  const cost = dispatchResp.usage?.cost ?? 0

  // 5. Coût déjà enregistré par dispatch-llm (péage unique, ADR 0010).

  // c. Parser la réponse NER
  const raw = dispatchResp.content ?? ''
  const entities = parseNerResponse(raw)

  // d. Upsert entities + insert signal_entities
  for (const entity of entities) {
    // Upsert entity (ON CONFLICT DO NOTHING → récupère l'id existant)
    const { data: upsertData, error: upsertErr } = await supabase
      .from('entities')
      .upsert(
        {
          org_id: job.org_id,
          kind: entity.kind,
          canonical_name: entity.canonical_name,
        },
        { onConflict: 'org_id,kind,canonical_name', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()

    // Si upsert avec ignoreDuplicates ne retourne rien (doublon), on fetch l'existant
    let entityId: string | null = (upsertData as { id: string } | null)?.id ?? null

    if (!entityId && !upsertErr) {
      // Entité déjà existante — la récupérer
      const { data: existing } = await supabase
        .from('entities')
        .select('id')
        .eq('org_id', job.org_id)
        .eq('kind', entity.kind)
        .eq('canonical_name', entity.canonical_name)
        .maybeSingle()
      entityId = (existing as { id: string } | null)?.id ?? null
    }

    if (upsertErr) {
      // Erreur grave → log et continuer avec les autres entités
      await supabase.from('logs').insert({
        user_id: userId,
        action: 'enrich:entities',
        status: 'error',
        payload: {
          stage: 'upsert_entity',
          signal_id: job.signal_id,
          entity: entity.canonical_name,
          error: upsertErr.message,
        },
      })
      continue
    }

    if (!entityId) continue

    // Insert signal_entities (ON CONFLICT → rien faire)
    await supabase.from('signal_entities').upsert(
      {
        signal_id: job.signal_id,
        entity_id: entityId,
        org_id: job.org_id,
        mention_text: entity.mention_text,
        confidence: entity.confidence,
      },
      { onConflict: 'signal_id,entity_id', ignoreDuplicates: true },
    )
  }

  // e. Marquer le job completed
  await supabase
    .from('pending_enrichments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id)

  return { ok: true, cost }
}

/**
 * Extrait le texte brut d'un signal depuis raw_payload.
 */
function extractSignalText(signal: SignalRow): string {
  const payload = signal.raw_payload
  if (!payload) return ''
  const text =
    (payload.text as string | undefined) ??
    (payload.body as string | undefined) ??
    (payload.selftext as string | undefined) ??
    (payload.summary as string | undefined) ??
    (payload.abstract as string | undefined) ??
    ''
  return typeof text === 'string' ? text : ''
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
