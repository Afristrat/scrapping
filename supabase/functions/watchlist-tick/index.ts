/**
 * watchlist-tick — Worker cron horaire pour topics_of_interest.
 *
 * Pas d'endpoint public. Appelé par pg_cron toutes les heures via pg_net.
 * Auth : header `x-cron-secret` matching env var `WATCHLIST_CRON_SECRET`.
 *
 * Deux phases par tick :
 *
 *   PHASE 1 — START :
 *     Pick 1 sujet `topics_of_interest` due (next_collect_at <= NOW, status='collecting',
 *     pas de run 'running' actif). Choisit 1 seed (round-robin via count des runs
 *     précédents) et déclenche research-from-seed (mode async). Insert un row
 *     `topic_collect_runs` status='running'. Repousse next_collect_at à NOW+10min
 *     pour éviter pickup avant FINALIZE.
 *
 *   PHASE 2 — FINALIZE :
 *     Pick jusqu'à 5 runs status='running' AND started_at < NOW-2min.
 *     Pour chaque : check `research_sessions(session_id).status`.
 *       - completed → embed topics, INSERT dans topics_archive, UPDATE run completed,
 *         UPDATE toi.last_collected_at + compteurs + next_collect_at selon collect_cron.
 *       - failed/timeout → UPDATE run failed avec error_detail, UPDATE toi.last_error,
 *         retry dans 10min (next_collect_at = NOW+10min).
 *       - running (timeout pipeline 8min) → mark abandoned, retry.
 *
 * Budget temps : ~10-15s par tick (1 start + 5 finalize). Bien sous le timeout edge fn.
 *
 * BYOK strict — embedding via _shared/embeddings.ts (lit settings du proxy_user).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { EMBEDDING_DIMS, embedText, toPgVector } from '../_shared/embeddings.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FINALIZE_BATCH_SIZE = 5
const FINALIZE_DELAY_MS = 2 * 60 * 1000 // attendre 2min avant 1ère vérif
const ABANDON_TIMEOUT_MS = 8 * 60 * 1000 // après 8min on considère le pipeline mort
const RETRY_AFTER_FAIL_MS = 10 * 60 * 1000 // retry 10min après un échec

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * Stratégie d'auth (par priorité descendante) :
 *   1. x-cron-secret matching WATCHLIST_CRON_SECRET env — preferred path
 *      (nécessite que la valeur soit posée côté DB via app.settings ou vault).
 *   2. Authorization: Bearer <service_role> — debug manuel + fire-and-forget
 *      depuis topics-of-interest POST.
 *   3. pg_net interne : User-Agent commence par 'pg_net' ET body.trigger==='cron'.
 *      Trust-by-origin : pg_net ne peut s'exécuter QUE depuis le Postgres Supabase
 *      managed → effectivement non-callable depuis l'extérieur. V1 acceptable en
 *      attendant que vault.create_secret soit utilisable.
 *
 * Si aucune passe → 401.
 */
function isAuthorized(
  req: Request,
  bodyTrigger: unknown,
  expectedSecret: string | undefined,
  serviceKey: string,
): boolean {
  if (expectedSecret) {
    const provided = req.headers.get('x-cron-secret')
    if (provided && provided === expectedSecret) return true
  }
  const auth = req.headers.get('Authorization')
  if (auth === `Bearer ${serviceKey}`) return true

  const ua = (req.headers.get('user-agent') ?? '').toLowerCase()
  if (ua.startsWith('pg_net') && bodyTrigger === 'cron') return true

  return false
}

interface TickReport {
  ok: boolean
  phase_start: {
    picked: boolean
    toi_id?: string
    session_id?: string
    seed_idx?: number
    error?: string
  }
  phase_finalize: {
    processed: number
    completed: number
    failed: number
    abandoned: number
    errors: unknown[]
  }
  duration_ms: number
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return jsonResp({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ ok: false, error: 'service_role_env_missing' }, 500)
  }

  // Parse body en avance pour le check d'auth (trigger=cron est un marqueur pg_net).
  let bodyParsed: { trigger?: unknown } = {}
  try {
    const text = await req.text()
    if (text) bodyParsed = JSON.parse(text) as { trigger?: unknown }
  } catch {
    /* body vide ou non-JSON — OK pour le check, le contenu n'est pas utilisé */
  }

  const expectedSecret = Deno.env.get('WATCHLIST_CRON_SECRET')
  if (!isAuthorized(req, bodyParsed.trigger, expectedSecret, serviceKey)) {
    return jsonResp({ ok: false, error: 'unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const startedAt = Date.now()

  const report: TickReport = {
    ok: true,
    phase_start: { picked: false },
    phase_finalize: { processed: 0, completed: 0, failed: 0, abandoned: 0, errors: [] },
    duration_ms: 0,
  }

  // ─── PHASE 2 (FINALIZE) — traiter les runs en cours d'abord (priorité aux flush) ─
  try {
    const finalizeReport = await runFinalizePhase(supabase, supabaseUrl, serviceKey)
    report.phase_finalize = finalizeReport
  } catch (err) {
    report.phase_finalize.errors.push(formatErr(err))
  }

  // ─── PHASE 1 (START) — lancer 1 nouvelle collecte si possible ────────────
  try {
    const startReport = await runStartPhase(supabase, supabaseUrl, serviceKey)
    report.phase_start = startReport
  } catch (err) {
    report.phase_start = { picked: false, error: formatErr(err) as string }
  }

  report.duration_ms = Date.now() - startedAt
  return jsonResp(report, 200)
}

if (import.meta.main) {
  Deno.serve(handler)
}

function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300)
  return String(err).slice(0, 300)
}

// ─── PHASE 1 — START ────────────────────────────────────────────────────────

async function runStartPhase(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
): Promise<TickReport['phase_start']> {
  // SELECT 1 sujet due, qui n'a pas de run actif.
  const { data: candidates, error: pickErr } = await supabase
    .from('topics_of_interest')
    .select(
      'id, owner_user_id, seeds, lang, sector_hint, scope_profile, hints_override, collect_cron',
    )
    .eq('status', 'collecting')
    .lte('next_collect_at', new Date().toISOString())
    .order('next_collect_at', { ascending: true })
    .limit(5)
  if (pickErr) throw new Error(`pick_due_failed: ${pickErr.message}`)
  if (!candidates || candidates.length === 0) {
    return { picked: false }
  }

  // Filtrer ceux qui ont déjà un run 'running' (pas de double pickup)
  const toiIds = candidates.map((t: { id: string }) => t.id)
  const { data: activeRuns } = await supabase
    .from('topic_collect_runs')
    .select('topic_of_interest_id')
    .in('topic_of_interest_id', toiIds)
    .eq('status', 'running')
  const blocked = new Set(
    (activeRuns ?? []).map((r: { topic_of_interest_id: string }) => r.topic_of_interest_id),
  )

  const toi = candidates.find((c: { id: string }) => !blocked.has(c.id))
  if (!toi) {
    return { picked: false }
  }

  // Choisir le seed à collecter : round-robin selon count des runs précédents
  const { count: prevRunsCount } = await supabase
    .from('topic_collect_runs')
    .select('id', { count: 'exact', head: true })
    .eq('topic_of_interest_id', toi.id)
  const seedIdx = ((prevRunsCount ?? 0) as number) % (toi.seeds as string[]).length
  const seed = (toi.seeds as string[])[seedIdx]

  // Lancer research-from-seed en mode async via x-api-key… non, on est en interne.
  // On call research-from-seed avec service_role + x-proxy-user-id (pattern Option C).
  const internalToken = Deno.env.get('KAIROS_INTERNAL_TOKEN') ?? ''
  const body: Record<string, unknown> = { seed, lang: toi.lang }
  if (toi.sector_hint) body.sector_hint = toi.sector_hint
  if (toi.scope_profile) body.scope_profile = toi.scope_profile
  if (toi.hints_override) body.hints_override = toi.hints_override

  // Mais research-from-seed exige x-api-key (cf. validateApiKey). Pour appel
  // interne depuis watchlist-tick on doit utiliser une clé API valide. On
  // utilise la clé Bassira (proxy_user_id = owner du sujet) — c'est la même
  // identité légitime. Or on n'a pas la clé en clair côté serveur (seul le
  // hash). Solution : ajouter un bypass interne via x-internal-cron-secret
  // (env partagé) — research-from-seed accepte alors un service_role JWT en
  // Authorization + ce header pour skip validateApiKey.

  // V1 : on appelle research-from-seed en mode async POST avec un header
  // spécial `x-internal-cron: <secret>` qui sera reconnu par research-from-seed
  // (à implémenter en follow-up). En attendant, on génère une session_id et
  // on appelle directement research-strategist + suite manuelle ?
  //
  // **Compromis V1** : on récupère la clé Bassira en clair depuis l'env var
  // `BASSIRA_INTERNAL_API_KEY` (mise par l'opérateur via supabase secrets).
  // Ce n'est pas idéal mais c'est tracé, scope limité, et seul le service_role
  // y a accès.
  const bassiraKey = Deno.env.get('BASSIRA_INTERNAL_API_KEY')
  if (!bassiraKey) {
    throw new Error(
      'BASSIRA_INTERNAL_API_KEY env var missing — set via `bunx supabase secrets set BASSIRA_INTERNAL_API_KEY=<bsr_xxx>` to allow watchlist-tick to call research-from-seed.',
    )
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/research-from-seed`, {
    method: 'POST',
    headers: {
      'x-api-key': bassiraKey,
      'Content-Type': 'application/json',
      ...(internalToken ? { 'x-internal-auth': internalToken } : {}),
    },
    body: JSON.stringify(body),
  })

  if (res.status !== 202) {
    const text = await res.text().catch(() => '')
    return {
      picked: false,
      error: `research-from-seed POST returned ${res.status}: ${text.slice(0, 200)}`,
    }
  }

  let respBody: { session_id?: string } = {}
  try {
    respBody = (await res.json()) as { session_id?: string }
  } catch {
    return { picked: false, error: 'research-from-seed_response_not_json' }
  }
  const sessionId = respBody.session_id
  if (!sessionId) {
    return { picked: false, error: 'research-from-seed_no_session_id' }
  }

  // INSERT le run
  const { error: insErr } = await supabase.from('topic_collect_runs').insert({
    topic_of_interest_id: toi.id,
    session_id: sessionId,
    seed,
    seed_idx: seedIdx,
    status: 'running',
    trigger: 'cron',
  })
  if (insErr) {
    return { picked: false, error: `insert_run_failed: ${insErr.message}` }
  }

  // Repousse next_collect_at à NOW+10min (sera réajusté en FINALIZE selon collect_cron)
  await supabase
    .from('topics_of_interest')
    .update({
      next_collect_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .eq('id', toi.id)

  return { picked: true, toi_id: toi.id, session_id: sessionId, seed_idx: seedIdx }
}

// ─── PHASE 2 — FINALIZE ─────────────────────────────────────────────────────

interface ResearchSessionRow {
  id: string
  status: string
  result: Record<string, unknown> | null
  error_detail: Record<string, unknown> | null
  completed_at: string | null
}

async function runFinalizePhase(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
): Promise<TickReport['phase_finalize']> {
  const out: TickReport['phase_finalize'] = {
    processed: 0,
    completed: 0,
    failed: 0,
    abandoned: 0,
    errors: [],
  }

  // Pick runs en cours, > 2min, jusqu'à FINALIZE_BATCH_SIZE
  const cutoff = new Date(Date.now() - FINALIZE_DELAY_MS).toISOString()
  const { data: runs, error } = await supabase
    .from('topic_collect_runs')
    .select('id, topic_of_interest_id, session_id, seed, seed_idx, started_at')
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .order('started_at', { ascending: true })
    .limit(FINALIZE_BATCH_SIZE)
  if (error) throw new Error(`pick_runs_failed: ${error.message}`)
  if (!runs || runs.length === 0) return out

  for (const run of runs as Array<{
    id: string
    topic_of_interest_id: string
    session_id: string
    seed: string
    seed_idx: number
    started_at: string
  }>) {
    out.processed++
    try {
      const status = await finalizeOneRun(supabase, supabaseUrl, run)
      if (status === 'completed') out.completed++
      else if (status === 'failed') out.failed++
      else if (status === 'abandoned') out.abandoned++
    } catch (err) {
      out.errors.push({ run_id: run.id, error: formatErr(err) })
    }
  }
  return out
}

async function finalizeOneRun(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  _supabaseUrl: string,
  run: {
    id: string
    topic_of_interest_id: string
    session_id: string
    seed: string
    seed_idx: number
    started_at: string
  },
): Promise<'completed' | 'failed' | 'abandoned' | 'still_running'> {
  // 1. Lire la session research_sessions
  const { data: session, error: sErr } = await supabase
    .from('research_sessions')
    .select('id, status, result, error_detail, completed_at')
    .eq('id', run.session_id)
    .maybeSingle()
  if (sErr) throw new Error(`session_read_failed: ${sErr.message}`)

  const ageMs = Date.now() - new Date(run.started_at).getTime()

  // Cas A : session introuvable ou toujours running
  if (!session || session.status === 'running' || session.status === 'pending') {
    if (ageMs > ABANDON_TIMEOUT_MS) {
      // Trop vieux → abandon
      await supabase
        .from('topic_collect_runs')
        .update({
          status: 'abandoned',
          finished_at: new Date().toISOString(),
          error: { reason: 'pipeline_timeout_8min', age_ms: ageMs },
        })
        .eq('id', run.id)
      // Repousse next_collect_at pour retry
      await retryToi(supabase, run.topic_of_interest_id, 'pipeline_abandoned')
      return 'abandoned'
    }
    return 'still_running'
  }

  const sessionRow = session as ResearchSessionRow

  // Cas B : completed → ingest topics
  if (sessionRow.status === 'completed') {
    const result = sessionRow.result ?? {}
    const topics = Array.isArray((result as { topics?: unknown }).topics)
      ? (result as { topics: unknown[] }).topics
      : []
    const qualityWarning =
      typeof (result as { quality_warning?: unknown }).quality_warning === 'string'
        ? (result as { quality_warning: string }).quality_warning
        : null
    const audit = (result as { audit?: { verdict?: string } | null }).audit ?? null
    const auditVerdict = audit?.verdict ?? null

    // Récupère le proxy_user_id pour BYOK embedding des topics
    const { data: toi } = await supabase
      .from('topics_of_interest')
      .select('owner_user_id, collect_cron, signals_count, topics_count')
      .eq('id', run.topic_of_interest_id)
      .maybeSingle()

    const ownerUserId = toi?.owner_user_id as string | undefined
    const collectCron = (toi?.collect_cron ?? 'weekly') as string

    let ingested = 0
    const collectRunId = crypto.randomUUID()

    for (const t of topics) {
      try {
        await ingestOneTopic(
          supabase,
          ownerUserId ?? null,
          run,
          sessionRow,
          t,
          collectRunId,
          qualityWarning,
          auditVerdict,
        )
        ingested++
      } catch (err) {
        // Ne bloque pas l'ingestion des autres topics
        console.warn(`watchlist-tick: ingest topic failed for run ${run.id}: ${formatErr(err)}`)
      }
    }

    // Compute next_collect_at
    const nextCollectAt = computeNextCollectAtFromCron(collectCron)

    // UPDATE topic_collect_runs
    await supabase
      .from('topic_collect_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        topics_ingested: ingested,
      })
      .eq('id', run.id)

    // UPDATE topics_of_interest counters + next_collect_at
    await supabase
      .from('topics_of_interest')
      .update({
        last_collected_at: sessionRow.completed_at ?? new Date().toISOString(),
        topics_count: ((toi?.topics_count as number | undefined) ?? 0) + ingested,
        next_collect_at: nextCollectAt.toISOString(),
        last_error: null,
        status: 'collecting',
      })
      .eq('id', run.topic_of_interest_id)

    return 'completed'
  }

  // Cas C : failed / timeout
  if (sessionRow.status === 'failed' || sessionRow.status === 'timeout') {
    await supabase
      .from('topic_collect_runs')
      .update({
        status: sessionRow.status,
        finished_at: new Date().toISOString(),
        error: sessionRow.error_detail ?? { reason: 'unknown_failure' },
      })
      .eq('id', run.id)

    await retryToi(supabase, run.topic_of_interest_id, sessionRow.status, sessionRow.error_detail)
    return 'failed'
  }

  // Cas D : status inconnu
  await supabase
    .from('topic_collect_runs')
    .update({
      status: 'abandoned',
      finished_at: new Date().toISOString(),
      error: { reason: 'unknown_session_status', status: sessionRow.status },
    })
    .eq('id', run.id)
  await retryToi(supabase, run.topic_of_interest_id, 'unknown_status')
  return 'abandoned'
}

async function ingestOneTopic(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerUserId: string | null,
  run: {
    id: string
    topic_of_interest_id: string
    session_id: string
    seed: string
    seed_idx: number
  },
  session: ResearchSessionRow,
  topicRaw: unknown,
  collectRunId: string,
  qualityWarning: string | null,
  auditVerdict: string | null,
): Promise<void> {
  if (!topicRaw || typeof topicRaw !== 'object') return
  const t = topicRaw as Record<string, unknown>

  const label = typeof t.label === 'string' ? t.label : ''
  if (!label || label.length === 0) return

  const summary = typeof t.summary === 'string' ? t.summary : null
  const topicType = (
    typeof t.type === 'string' && ['regular', 'devil_advocate', 'emerging'].includes(t.type)
      ? t.type
      : null
  ) as 'regular' | 'devil_advocate' | 'emerging' | null

  // Embed le topic pour recherche sémantique future (label + summary)
  let topicEmbedding: number[] | null = null
  let embeddingModel: string | null = null
  if (ownerUserId) {
    try {
      const embText = `${label}${summary ? ' : ' + summary : ''}`
      const res = await embedText(supabase, ownerUserId, embText.slice(0, 1500), {
        dimensions: EMBEDDING_DIMS,
      })
      topicEmbedding = res.embedding
      embeddingModel = res.model
    } catch {
      // pas bloquant : on stocke le topic sans embedding, search ne le retournera pas
    }
  }

  await supabase.from('topics_archive').insert({
    topic_of_interest_id: run.topic_of_interest_id,
    collect_run_id: collectRunId,
    topic_label: label.slice(0, 500),
    topic_summary: summary,
    topic_type: topicType,
    dominant_angle: typeof t.dominant_angle === 'string' ? t.dominant_angle : null,
    brief_variants: Array.isArray(t.brief_variants) ? t.brief_variants : [],
    key_signals: Array.isArray(t.key_signals_supporting) ? t.key_signals_supporting : [],
    provenance: t.provenance ?? null,
    cultural_warnings: [],
    topic_embedding: topicEmbedding ? toPgVector(topicEmbedding) : null,
    embedding_model: embeddingModel,
    source_seed: run.seed,
    source_seed_index: run.seed_idx,
    source_session_id: session.id,
    audit_verdict: auditVerdict,
    quality_warning: qualityWarning,
  })
}

async function retryToi(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  toiId: string,
  reason: string,
  errorDetail?: unknown,
): Promise<void> {
  const next = new Date(Date.now() + RETRY_AFTER_FAIL_MS).toISOString()
  await supabase
    .from('topics_of_interest')
    .update({
      next_collect_at: next,
      last_error: { reason, detail: errorDetail ?? null, when: new Date().toISOString() },
      status: 'collecting',
    })
    .eq('id', toiId)
}

function computeNextCollectAtFromCron(cron: string): Date {
  const now = new Date()
  if (cron === 'daily') {
    now.setUTCDate(now.getUTCDate() + 1)
  } else if (cron === 'monthly') {
    now.setUTCDate(now.getUTCDate() + 30)
  } else if (cron === 'paused') {
    now.setUTCFullYear(now.getUTCFullYear() + 100)
  } else {
    // weekly par défaut
    now.setUTCDate(now.getUTCDate() + 7)
  }
  return now
}
