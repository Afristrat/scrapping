/**
 * research-from-seed — Edge function ORCHESTRATRICE Kairos (Story Ralph K06,
 * pattern async porté S-PORT-ASYNC).
 *
 * Point d'entrée pour le pipeline dynamique seed → research_strategy →
 * scrape → score → topics → audit, consommé par Bassira (et tout autre
 * client externe authentifié par API key). Contrat détaillé :
 * `docs/bridges/contrat-integration-bassira.md`.
 *
 * Auth :
 *   - PAS de JWT user requis.
 *   - Header `x-api-key` obligatoire (validé contre `public_api_keys`).
 *   - CORS strict : whitelist `prospectives.ai-mpower.com` + sous-domaines
 *     `*.ai-mpower.com` + dev `http://localhost:*`.
 *
 * PATTERN ASYNC (obligatoire — le pipeline enchaîne jusqu'à 7 appels réseau,
 * plusieurs LLM avec retry ; mesuré en prod à ~168s cumulés sur ce repo,
 * commit aedc93f — largement au-delà du budget d'une requête HTTP
 * synchrone, et du workerTimeoutMs=60s du runtime self-hosted .11) :
 *
 *   POST body { seed, lang, sector_hint?, depth_hint?, output_profile?,
 *               idempotency_key? }
 *     → 202 { ok:true, schema_version:1, session_id, status:'running' }
 *       (ou 200 { ..., idempotent:true } si idempotency_key déjà vu pour
 *       cette clé)
 *     → le pipeline tourne en arrière-plan (EdgeRuntime.waitUntil) et
 *       persiste son résultat dans `research_sessions` (migration
 *       20260515000001).
 *
 *   GET ?session_id=<uuid>
 *     → 200 { ok:true, schema_version:1, session_id, status, result,
 *             error_detail, telemetry, created_at, completed_at }
 *     → 404 { ok:false, error:'session_not_found' } si absent ou appartenant
 *       à une autre clé API.
 *
 * Pipeline orchestré (V1, inchangé vs avant le portage async) :
 *   1. validate API key + rate limit (60 RPM sliding window)
 *   2. research-strategist puis rubric-architect (séquentiel, rubric a
 *      besoin de research_strategy en input)
 *   3. PARALLEL scrape : x + reddit + arxiv + rss (via session_id éphémère)
 *   4. read signals_session (top 200)
 *   5. llm-score-batch (mode ad_hoc + rubric_override)
 *   6. signal-synthesizer (topics + coverage_map + devil_advocate)
 *   7. quality-auditor (verdict pass/warn/fail/deepen)
 *   8. si verdict='deepen' & depth_hint < 2 : flag `quality_warning`
 *      (V1 = pas de re-pipeline, US-K08 séparée)
 *
 * BYOK strict — aucun modèle hardcodé. Tous les appels LLM sont délégués
 * à dispatch-llm dans les edge fns chaînées.
 *
 * Auth interne des appels chaînés : Bearer service_role brut (inchangé par
 * ce portage — le câblage ADR 0009 resolveCaller/buildInternalHeaders +
 * résolution org_id sur cette fonction est le périmètre de S-PROV-03, pas
 * de celle-ci).
 *
 * Web scrape (Perplexity) : NON implémenté V1. Les subjects sans hints
 * X/Reddit/ArXiv/RSS sont skippés au scrape.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  type ApiKeyRow,
  buildCorsHeaders,
  buildScrapeJobs,
  callInternal,
  checkRateLimit,
  type RequestBody,
  resolveCorsOrigin,
  type ScrapeJob,
  selectTopSignals,
  STAGE_TIMEOUTS_MS,
  validateApiKey,
  validateRequestBody,
} from './lib.ts'

// ---------------------------------------------------------------------------
// Telemetry helpers
// ---------------------------------------------------------------------------

interface StageTelemetry {
  stage: string
  duration_ms: number
  ok: boolean
  cost?: number
  error?: string
}

interface PipelineTelemetry {
  session_id: string
  api_key_prefix: string
  stages: StageTelemetry[]
  total_cost_usd: number
  total_duration_ms: number
}

function pushStage(tel: PipelineTelemetry, stage: string, startMs: number, res: StageRecord): void {
  tel.stages.push({
    stage,
    duration_ms: res.durationMs ?? Date.now() - startMs,
    ok: res.ok,
    error: res.error,
  })
}

interface StageRecord {
  ok: boolean
  durationMs: number
  error?: string
}

// ---------------------------------------------------------------------------
// Types upstream (extraits compacts — schemas complets validés par les
// edge fns appelées, on les passe-through sans re-vérifier ici)
// ---------------------------------------------------------------------------

interface ResearchStrategistResp {
  ok: boolean
  research_strategy?: Record<string, unknown>
  telemetry?: { latency_ms?: number; cost?: number }
  error?: string
}

interface RubricArchitectResp {
  ok: boolean
  rubric?: Record<string, unknown>
  telemetry?: { duration_ms?: number; usage?: { cost?: number } }
  error?: string
}

interface ScrapeResp {
  ok?: boolean
  inserted?: number
  fetched?: number
  error?: string
}

interface SessionSignalRow {
  id: string
  source: string
  url: string | null
  title: string | null
  raw_payload: Record<string, unknown> | null
}

interface LlmScoreBatchResult {
  signal_id: string
  score: number
  disqualified: boolean
  applied_boosts: string[]
  reasoning?: string
  cost?: number
}

interface LlmScoreBatchResp {
  batch_size?: number
  scored?: number
  failed?: number
  cost?: number
  results?: LlmScoreBatchResult[]
  error?: string
}

interface SignalSynthesizerResp {
  ok: boolean
  topics?: unknown[]
  coverage_map?: Record<string, unknown>
  cultural_warnings?: string[]
  devil_advocate_topic_id?: string
  telemetry?: { cost_usd?: number; latency_ms?: number }
  error?: string
}

interface QualityAuditorResp {
  verdict?: 'pass' | 'warn' | 'fail' | 'deepen'
  issues?: unknown[]
  auto_corrections_applied?: Record<string, string>
  deepening_targets?: unknown[]
  telemetry?: { llm_cost?: number; total_latency_ms?: number }
  error?: string
}

interface PipelineOutcome {
  ok: boolean
  body: Record<string, unknown>
  telemetry: PipelineTelemetry
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  const cors = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    // CORS preflight — refus si origine pas dans la whitelist
    if (!resolveCorsOrigin(origin)) {
      return new Response(null, { status: 403, headers: cors })
    }
    return new Response(null, { status: 204, headers: cors })
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResp({ ok: false, error: 'method_not_allowed' }, 405, cors)
  }

  // CORS : si Origin présent mais hors whitelist → reject (appels
  // server-to-server sans Origin passent, comme avant)
  if (origin && !resolveCorsOrigin(origin)) {
    return jsonResp({ ok: false, error: 'cors_origin_not_allowed' }, 403, cors)
  }

  // ─── Env / clients ────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ ok: false, error: 'service_role_env_missing' }, 500, cors)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  // ─── x-api-key header (commun GET + POST) ─────────────────────────────
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)
  }
  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }
  const apiKeyRow = keyValidation.key

  if (req.method === 'GET') {
    return await handleGetStatus(req, supabase, apiKeyRow, cors)
  }
  return await handlePostAsync(req, supabase, supabaseUrl, serviceKey, apiKeyRow, cors)
}

// ---------------------------------------------------------------------------
// GET ?session_id=X — poll status + result. Scopé par api_key_id : une clé
// ne peut jamais lire la session d'une autre (anti-énumération).
// ---------------------------------------------------------------------------

async function handleGetStatus(
  req: Request,
  supabase: SupabaseClient,
  apiKeyRow: ApiKeyRow,
  cors: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')
  if (!sessionId) {
    return jsonResp({ ok: false, error: 'session_id_required' }, 400, cors)
  }

  const { data, error } = await supabase
    .from('research_sessions')
    .select('id, status, result, error_detail, telemetry, created_at, completed_at')
    .eq('id', sessionId)
    .eq('api_key_id', apiKeyRow.id)
    .maybeSingle()

  if (error || !data) {
    return jsonResp({ ok: false, error: 'session_not_found' }, 404, cors)
  }

  return jsonResp(
    {
      ok: true,
      schema_version: 1,
      session_id: data.id,
      status: data.status,
      result: data.result,
      error_detail: data.error_detail,
      telemetry: data.telemetry,
      created_at: data.created_at,
      completed_at: data.completed_at,
    },
    200,
    cors,
  )
}

// ---------------------------------------------------------------------------
// POST — valide, dédup idempotency_key, crée la session, lance le pipeline
// en background, retourne 202 immédiatement.
// ---------------------------------------------------------------------------

async function handlePostAsync(
  req: Request,
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  apiKeyRow: ApiKeyRow,
  cors: Record<string, string>,
): Promise<Response> {
  // ─── Rate limit (POST uniquement — le polling GET est un simple read) ─
  const allowed = await checkRateLimit(supabase, apiKeyRow.id, apiKeyRow.rate_limit_per_min)
  if (!allowed) {
    return jsonResp({ ok: false, error: 'rate_limited' }, 429, cors)
  }

  // ─── Body ─────────────────────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResp({ ok: false, error: 'invalid_json' }, 400, cors)
  }
  const validation = validateRequestBody(raw)
  if (!validation.ok) {
    return jsonResp({ ok: false, error: validation.error }, 400, cors)
  }
  const body: RequestBody = validation.body

  // ─── Idempotency dedup ────────────────────────────────────────────────
  if (body.idempotency_key) {
    const existing = await supabase
      .from('research_sessions')
      .select('id, status, created_at')
      .eq('api_key_id', apiKeyRow.id)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle()
    if (existing.data) {
      return jsonResp(
        {
          ok: true,
          schema_version: 1,
          session_id: existing.data.id,
          status: existing.data.status,
          message: `Idempotent hit — session already exists, created_at=${existing.data.created_at}.`,
          idempotent: true,
        },
        200,
        cors,
      )
    }
  }

  const sessionId = crypto.randomUUID()
  const insertRes = await supabase.from('research_sessions').insert({
    id: sessionId,
    api_key_id: apiKeyRow.id,
    status: 'running',
    seed: body.seed,
    lang: body.lang,
    sector_hint: body.sector_hint ?? null,
    depth_hint: body.depth_hint ?? null,
    output_profile: body.output_profile ?? null,
    idempotency_key: body.idempotency_key ?? null,
  })

  if (insertRes.error) {
    // Race : 2 POST concurrents avec le même idempotency_key → un gagne,
    // l'autre se prend un 23505 (unique violation) — on renvoie 200
    // idempotent pour le perdant en re-lookup-ant.
    if (body.idempotency_key && insertRes.error.code === '23505') {
      const winner = await supabase
        .from('research_sessions')
        .select('id, status, created_at')
        .eq('api_key_id', apiKeyRow.id)
        .eq('idempotency_key', body.idempotency_key)
        .maybeSingle()
      if (winner.data) {
        return jsonResp(
          {
            ok: true,
            schema_version: 1,
            session_id: winner.data.id,
            status: winner.data.status,
            message: 'Idempotent race resolved — winner session returned.',
            idempotent: true,
          },
          200,
          cors,
        )
      }
    }
    return jsonResp(
      { ok: false, error: 'session_create_failed', detail: insertRes.error.message },
      500,
      cors,
    )
  }

  const pipelinePromise = (async () => {
    try {
      const outcome = await runPipeline({
        supabase,
        supabaseUrl,
        serviceKey,
        apiKeyRow,
        sessionId,
        body,
      })
      await supabase
        .from('research_sessions')
        .update({
          status: outcome.ok ? 'completed' : 'failed',
          result: outcome.ok ? outcome.body : null,
          error_detail: outcome.ok ? null : outcome.body,
          telemetry: outcome.telemetry,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await supabase
        .from('research_sessions')
        .update({
          status: 'failed',
          error_detail: { message, stage: 'background_unhandled' },
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  })()

  const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (er && typeof er.waitUntil === 'function') {
    er.waitUntil(pipelinePromise)
  } else {
    pipelinePromise.catch(() => {})
  }

  return jsonResp(
    {
      ok: true,
      schema_version: 1,
      session_id: sessionId,
      status: 'running',
      message: `Pipeline started. Poll GET ?session_id=${sessionId} for status.`,
    },
    202,
    cors,
  )
}

// ---------------------------------------------------------------------------
// Pipeline complet (background) — retourne l'outcome à persister, jamais
// une Response HTTP directe (tourne hors du cycle requête/réponse initial).
// Logique de stage identique à avant le portage async (S-PORT-ASYNC ne
// change QUE l'enveloppe sync→async, pas le comportement des étages).
// ---------------------------------------------------------------------------

async function runPipeline(ctx: {
  supabase: SupabaseClient
  supabaseUrl: string
  serviceKey: string
  apiKeyRow: ApiKeyRow
  sessionId: string
  body: RequestBody
}): Promise<PipelineOutcome> {
  const { supabase, supabaseUrl, serviceKey, apiKeyRow, sessionId, body } = ctx
  const pipelineStarted = Date.now()
  const telemetry: PipelineTelemetry = {
    session_id: sessionId,
    api_key_prefix: apiKeyRow.key_prefix,
    stages: [],
    total_cost_usd: 0,
    total_duration_ms: 0,
  }
  const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`

  const fail = (
    stage: string,
    res: { status: number; error: string; detail?: string },
  ): PipelineOutcome => {
    telemetry.total_duration_ms = Date.now() - pipelineStarted
    const isTimeout = res.status === 504 || res.error === 'timeout'
    return {
      ok: false,
      telemetry,
      body: {
        ok: false,
        error: isTimeout ? 'STAGE_TIMEOUT' : 'STAGE_FAILED',
        stage,
        detail: res.detail ?? res.error,
        telemetry,
      },
    }
  }

  // ─── Stage 1 : research-strategist ────────────────────────────────────
  const stratStart = Date.now()
  const stratRes = await callInternal<ResearchStrategistResp>(
    fnUrl('research-strategist'),
    { seed: body.seed, lang: body.lang, sector_hint: body.sector_hint },
    serviceKey,
    STAGE_TIMEOUTS_MS.research_strategist,
  )
  pushStage(telemetry, 'research-strategist', stratStart, {
    ok: stratRes.ok,
    durationMs: stratRes.durationMs,
    error: stratRes.ok ? undefined : stratRes.error,
  })
  if (!stratRes.ok) return fail('research-strategist', stratRes)
  if (!stratRes.data?.research_strategy) {
    return fail('research-strategist', {
      status: 502,
      error: 'invalid_response',
      detail: 'missing research_strategy',
    })
  }
  const researchStrategy = stratRes.data.research_strategy
  telemetry.total_cost_usd += stratRes.data.telemetry?.cost ?? 0

  // ─── Stage 2 : rubric-architect ───────────────────────────────────────
  const rubricStart = Date.now()
  const rubricRes = await callInternal<RubricArchitectResp>(
    fnUrl('rubric-architect'),
    { seed: body.seed, lang: body.lang, research_strategy: researchStrategy },
    serviceKey,
    STAGE_TIMEOUTS_MS.rubric_architect,
  )
  pushStage(telemetry, 'rubric-architect', rubricStart, {
    ok: rubricRes.ok,
    durationMs: rubricRes.durationMs,
    error: rubricRes.ok ? undefined : rubricRes.error,
  })
  if (!rubricRes.ok) return fail('rubric-architect', rubricRes)
  if (!rubricRes.data?.rubric) {
    return fail('rubric-architect', {
      status: 502,
      error: 'invalid_response',
      detail: 'missing rubric',
    })
  }
  const rubric = rubricRes.data.rubric
  telemetry.total_cost_usd += rubricRes.data.telemetry?.usage?.cost ?? 0

  // ─── Stage 3 : PARALLEL scrape ───────────────────────────────────────
  const jobs: ScrapeJob[] = buildScrapeJobs(researchStrategy, body.lang)
  const scrapeStart = Date.now()
  if (jobs.length === 0) {
    pushStage(telemetry, 'scrape', scrapeStart, { ok: true, durationMs: 0 })
  } else {
    const scrapeSettled = await Promise.allSettled(
      jobs.map((job) =>
        callInternal<ScrapeResp>(
          fnUrl(`scraper-${job.scraper}`),
          {
            ...job.body,
            target_table: 'signals_session',
            session_id: sessionId,
            ttl_hours: 1,
            created_by_api_key: apiKeyRow.key_prefix,
          },
          serviceKey,
          STAGE_TIMEOUTS_MS.scrape,
        ),
      ),
    )

    const successCount = scrapeSettled.filter((r) => r.status === 'fulfilled' && r.value.ok).length

    pushStage(telemetry, 'scrape', scrapeStart, {
      ok: successCount > 0,
      durationMs: Date.now() - scrapeStart,
    })

    if (successCount === 0) {
      return fail('scrape', { status: 502, error: 'STAGE_FAILED', detail: 'All scrapers failed' })
    }
  }

  // ─── Stage 4 : Read signals_session ──────────────────────────────────
  const readStart = Date.now()
  const { data: sessionSignals, error: sessionErr } = await supabase
    .from('signals_session')
    .select('id, source, url, title, raw_payload')
    .eq('session_id', sessionId)
    .limit(200)
  if (sessionErr) {
    return fail('read_signals', {
      status: 500,
      error: 'session_read_failed',
      detail: sessionErr.message,
    })
  }
  const rawSignals = (sessionSignals ?? []) as SessionSignalRow[]
  pushStage(telemetry, 'read_signals', readStart, { ok: true, durationMs: Date.now() - readStart })

  if (rawSignals.length === 0) {
    telemetry.total_duration_ms = Date.now() - pipelineStarted
    return {
      ok: false,
      telemetry,
      body: {
        ok: false,
        error: 'NO_SIGNALS_SCRAPED',
        stage: 'read_signals',
        detail: 'Aucun signal scrapé après pipeline. Stratégie probablement trop niche.',
        telemetry,
        research_strategy: researchStrategy,
      },
    }
  }

  // ─── Stage 5 : llm-score-batch (mode ad_hoc + rubric_override) ───────
  const scoringInput = rawSignals.slice(0, 30).map((s) => ({
    id: s.id,
    source: s.source,
    url: s.url ?? undefined,
    title: s.title ?? undefined,
    raw_payload: s.raw_payload ?? undefined,
    lang: body.lang,
  }))

  const scoreStart = Date.now()
  const scoreRes = await callInternal<LlmScoreBatchResp>(
    fnUrl('llm-score-batch'),
    { signals_input: scoringInput, rubric_override: rubric },
    serviceKey,
    STAGE_TIMEOUTS_MS.score,
  )
  pushStage(telemetry, 'llm-score-batch', scoreStart, {
    ok: scoreRes.ok,
    durationMs: scoreRes.durationMs,
    error: scoreRes.ok ? undefined : scoreRes.error,
  })
  if (!scoreRes.ok) return fail('llm-score-batch', scoreRes)
  if (!scoreRes.data?.results) {
    return fail('llm-score-batch', {
      status: 502,
      error: 'invalid_response',
      detail: 'missing results',
    })
  }
  telemetry.total_cost_usd += scoreRes.data.cost ?? 0

  const signalsById = new Map(rawSignals.map((s) => [s.id, s]))
  const scoredSignals = (scoreRes.data.results ?? [])
    .map((r) => {
      const sig = signalsById.get(r.signal_id)
      if (!sig) return null
      const payload = (sig.raw_payload ?? {}) as Record<string, unknown>
      const excerpt =
        (payload.summary as string | undefined) ??
        (payload.selftext as string | undefined) ??
        (payload.text as string | undefined) ??
        ''
      return {
        id: sig.id,
        title: sig.title ?? '',
        url: sig.url ?? '',
        source: sig.source,
        lang: body.lang,
        score: r.score,
        excerpt: String(excerpt).slice(0, 200),
        disqualified: r.disqualified,
        applied_boosts: r.applied_boosts ?? [],
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  const topSignals = selectTopSignals(scoredSignals, 50)

  // ─── Stage 6 : signal-synthesizer ────────────────────────────────────
  const synthStart = Date.now()
  const synthRes = await callInternal<SignalSynthesizerResp>(
    fnUrl('signal-synthesizer'),
    { signals: topSignals, research_strategy: researchStrategy, lang: body.lang },
    serviceKey,
    STAGE_TIMEOUTS_MS.synthesize,
  )
  pushStage(telemetry, 'signal-synthesizer', synthStart, {
    ok: synthRes.ok,
    durationMs: synthRes.durationMs,
    error: synthRes.ok ? undefined : synthRes.error,
  })
  if (!synthRes.ok) return fail('signal-synthesizer', synthRes)
  if (!synthRes.data?.topics) {
    return fail('signal-synthesizer', {
      status: 502,
      error: 'invalid_response',
      detail: 'missing topics',
    })
  }
  telemetry.total_cost_usd += synthRes.data.telemetry?.cost_usd ?? 0
  const topics = synthRes.data.topics ?? []
  const coverageMap = synthRes.data.coverage_map ?? {}
  const devilAdvocateId = synthRes.data.devil_advocate_topic_id ?? null

  // ─── Stage 7 : quality-auditor ───────────────────────────────────────
  const auditStart = Date.now()
  const auditRes = await callInternal<QualityAuditorResp>(
    fnUrl('quality-auditor'),
    {
      research_strategy: researchStrategy,
      rubric,
      topics_output: {
        topics,
        coverage_map: coverageMap,
        cultural_warnings: synthRes.data.cultural_warnings ?? [],
        devil_advocate_topic_id: devilAdvocateId,
      },
      lang: body.lang,
      signals_input: topSignals.map((s) => ({ id: s.id, source: s.source, lang: s.lang })),
    },
    serviceKey,
    STAGE_TIMEOUTS_MS.audit,
  )
  pushStage(telemetry, 'quality-auditor', auditStart, {
    ok: auditRes.ok,
    durationMs: auditRes.durationMs,
    error: auditRes.ok ? undefined : auditRes.error,
  })
  if (!auditRes.ok || !auditRes.data) {
    // Audit fail = non bloquant : on retourne quand même les topics avec
    // un flag warning.
    telemetry.total_duration_ms = Date.now() - pipelineStarted
    return {
      ok: true,
      telemetry,
      body: {
        ok: true,
        session_id: sessionId,
        research_strategy: researchStrategy,
        rubric,
        topics,
        coverage_map: coverageMap,
        cultural_warnings: synthRes.data.cultural_warnings ?? [],
        devil_advocate_topic_id: devilAdvocateId,
        audit: null,
        quality_warning: 'audit_unavailable',
        telemetry,
      },
    }
  }
  telemetry.total_cost_usd += auditRes.data.telemetry?.llm_cost ?? 0

  const verdict = auditRes.data.verdict ?? 'warn'
  const depthHint = body.depth_hint ?? 0

  // V1 : pas d'iterative deepening — flag warning seul.
  let qualityWarning: string | null = null
  if (verdict === 'deepen' && depthHint < 2) {
    qualityWarning = 'deepening_recommended'
    console.warn(
      `[research-from-seed] session=${sessionId} verdict=deepen — V1 ne re-pipeline pas (US-K08).`,
    )
  } else if (verdict === 'fail') {
    qualityWarning = 'quality_fail'
  } else if (verdict === 'warn') {
    qualityWarning = 'quality_warn'
  }

  telemetry.total_duration_ms = Date.now() - pipelineStarted

  return {
    ok: true,
    telemetry,
    body: {
      ok: true,
      session_id: sessionId,
      research_strategy: researchStrategy,
      rubric,
      topics,
      coverage_map: coverageMap,
      cultural_warnings: synthRes.data.cultural_warnings ?? [],
      devil_advocate_topic_id: devilAdvocateId,
      audit: {
        verdict,
        issues: auditRes.data.issues ?? [],
        auto_corrections_applied: auditRes.data.auto_corrections_applied ?? {},
        deepening_targets: auditRes.data.deepening_targets ?? [],
      },
      quality_warning: qualityWarning,
      telemetry,
    },
  }
}

function jsonResp(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Guard so test runner can `import` this module without booting the listener.
if (import.meta.main) {
  Deno.serve(handler)
}

// Re-export commonly used types
export type { Lang, RequestBody } from './lib.ts'
