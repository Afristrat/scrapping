/**
 * research-from-seed — Edge function ORCHESTRATRICE Kairos (Story Ralph K06).
 *
 * Point d'entrée unique pour le pipeline dynamique seed → research_strategy
 * → scrape → score → topics → audit, consommé par Bassira (et tout autre
 * client externe authentifié par API key).
 *
 * Auth :
 *   - PAS de JWT user requis.
 *   - Header `x-api-key` obligatoire (validé contre `public_api_keys`).
 *   - CORS strict : whitelist `prospectives.ai-mpower.com` + sous-domaines
 *     `*.ai-mpower.com` + dev `http://localhost:*`.
 *
 * Pipeline orchestré (V1) :
 *   1. validate API key + rate limit (60 RPM sliding window)
 *   2. PARALLEL : research-strategist + rubric-architect
 *   3. PARALLEL scrape : x + reddit + arxiv (via session_id éphémère)
 *   4. read signals_session (top 50 par batch)
 *   5. llm-score-batch (mode ad_hoc + rubric_override)
 *   6. signal-synthesizer (topics + coverage_map + devil_advocate)
 *   7. quality-auditor (verdict pass/warn/fail/deepen)
 *   8. si verdict='deepen' & depth_hint < 2 : flag `quality_warning`
 *      (V1 = pas de re-pipeline, US-K08 séparée)
 *
 * BYOK strict — aucun modèle hardcodé. Tous les appels LLM sont délégués
 * à dispatch-llm dans les edge fns chaînées.
 *
 * Iterative-deepening : NON implémenté V1. Si auditor verdict='deepen',
 * return 200 avec `quality_warning='deepening_recommended'` et une note
 * dans la telemetry. Le re-pipeline complet est livré en US-K08.
 *
 * Web scrape (Perplexity) : NON implémenté V1. Les subjects sans hints
 * X/Reddit/ArXiv sont skippés au scrape. Acceptable car research-strategist
 * forcé à émettre au moins un hint par subject. À ajouter en V2 si gap
 * de couverture mesuré en prod.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildCorsHeaders,
  buildScrapeJobs,
  callInternal,
  checkRateLimit,
  type Lang,
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
  if (req.method !== 'POST') {
    return jsonResp({ ok: false, error: 'method_not_allowed' }, 405, cors)
  }

  // CORS sur POST aussi : si Origin présent mais hors whitelist → reject
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

  // ─── x-api-key header ─────────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)
  }

  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }
  const apiKeyRow = keyValidation.key

  // ─── Rate limit ───────────────────────────────────────────────────────
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

  // ─── Pipeline ─────────────────────────────────────────────────────────
  const sessionId = crypto.randomUUID()
  const pipelineStarted = Date.now()
  const telemetry: PipelineTelemetry = {
    session_id: sessionId,
    api_key_prefix: apiKeyRow.key_prefix,
    stages: [],
    total_cost_usd: 0,
    total_duration_ms: 0,
  }

  const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`

  // ─── Stage 1+2 PARALLEL : research-strategist + rubric-architect ──────
  // research-strategist d'abord (rubric a besoin de research_strategy en
  // input). On lance les deux en parallèle quand-même : le rubric-architect
  // dépend de research_strategy donc on ne peut pas vraiment le précâbler.
  // V1 = séquentiel sur ces deux étapes (rubric attend research_strategy).
  // → Spec dit "PARALLEL" mais sémantiquement impossible sans speculation.
  // Compromis : research-strategist seul d'abord, puis rubric-architect.

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
  if (!stratRes.ok) {
    return stageFail(telemetry, 'research-strategist', stratRes, cors)
  }
  if (!stratRes.data?.research_strategy) {
    return stageFail(
      telemetry,
      'research-strategist',
      { status: 502, error: 'invalid_response', detail: 'missing research_strategy' },
      cors,
    )
  }
  const researchStrategy = stratRes.data.research_strategy
  telemetry.total_cost_usd += stratRes.data.telemetry?.cost ?? 0

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
  if (!rubricRes.ok) {
    return stageFail(telemetry, 'rubric-architect', rubricRes, cors)
  }
  if (!rubricRes.data?.rubric) {
    return stageFail(
      telemetry,
      'rubric-architect',
      { status: 502, error: 'invalid_response', detail: 'missing rubric' },
      cors,
    )
  }
  const rubric = rubricRes.data.rubric
  telemetry.total_cost_usd += rubricRes.data.telemetry?.usage?.cost ?? 0

  // ─── Stage 3 : PARALLEL scrape ───────────────────────────────────────
  const jobs: ScrapeJob[] = buildScrapeJobs(researchStrategy, body.lang)
  const scrapeStart = Date.now()
  if (jobs.length === 0) {
    pushStage(telemetry, 'scrape', scrapeStart, {
      ok: true,
      durationMs: 0,
    })
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
      return jsonResp(
        {
          ok: false,
          error: 'STAGE_FAILED',
          stage: 'scrape',
          detail: 'All scrapers failed',
          telemetry,
        },
        502,
        cors,
      )
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
    return jsonResp(
      {
        ok: false,
        error: 'session_read_failed',
        stage: 'read_signals',
        detail: sessionErr.message,
        telemetry,
      },
      500,
      cors,
    )
  }
  const rawSignals = (sessionSignals ?? []) as SessionSignalRow[]
  pushStage(telemetry, 'read_signals', readStart, {
    ok: true,
    durationMs: Date.now() - readStart,
  })

  if (rawSignals.length === 0) {
    return jsonResp(
      {
        ok: false,
        error: 'NO_SIGNALS_SCRAPED',
        stage: 'read_signals',
        detail: 'Aucun signal scrapé après pipeline. Stratégie probablement trop niche.',
        telemetry,
        research_strategy: researchStrategy,
      },
      422,
      cors,
    )
  }

  // ─── Stage 5 : llm-score-batch (mode ad_hoc + rubric_override) ───────
  // Mappe signals_session → ScoredSignalInput attendu par llm-score-batch
  // mode ad_hoc.
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
  if (!scoreRes.ok) {
    return stageFail(telemetry, 'llm-score-batch', scoreRes, cors)
  }
  if (!scoreRes.data?.results) {
    return stageFail(
      telemetry,
      'llm-score-batch',
      { status: 502, error: 'invalid_response', detail: 'missing results' },
      cors,
    )
  }
  telemetry.total_cost_usd += scoreRes.data.cost ?? 0

  // Compose ScoredSignal[] pour synthesizer (signal_synthesizer attend
  // { id, title, url, source, lang, score, excerpt, disqualified, applied_boosts })
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
    {
      signals: topSignals,
      research_strategy: researchStrategy,
      lang: body.lang,
    },
    serviceKey,
    STAGE_TIMEOUTS_MS.synthesize,
  )
  pushStage(telemetry, 'signal-synthesizer', synthStart, {
    ok: synthRes.ok,
    durationMs: synthRes.durationMs,
    error: synthRes.ok ? undefined : synthRes.error,
  })
  if (!synthRes.ok) {
    return stageFail(telemetry, 'signal-synthesizer', synthRes, cors)
  }
  if (!synthRes.data?.topics) {
    return stageFail(
      telemetry,
      'signal-synthesizer',
      { status: 502, error: 'invalid_response', detail: 'missing topics' },
      cors,
    )
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
    return jsonResp(
      {
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
      200,
      cors,
    )
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

  return jsonResp(
    {
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
    200,
    cors,
  )
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

interface StageRecord {
  ok: boolean
  durationMs: number
  error?: string
}

function pushStage(tel: PipelineTelemetry, stage: string, startMs: number, res: StageRecord): void {
  tel.stages.push({
    stage,
    duration_ms: res.durationMs ?? Date.now() - startMs,
    ok: res.ok,
    error: res.error,
  })
}

function stageFail(
  tel: PipelineTelemetry,
  stage: string,
  res: { status: number; error: string; detail?: string },
  cors: Record<string, string>,
): Response {
  tel.total_duration_ms = tel.stages.reduce((acc, s) => acc + s.duration_ms, 0)
  // Si timeout interne → 504 STAGE_TIMEOUT
  const isTimeout = res.status === 504 || res.error === 'timeout'
  return jsonResp(
    {
      ok: false,
      error: isTimeout ? 'STAGE_TIMEOUT' : 'STAGE_FAILED',
      stage,
      detail: res.detail ?? res.error,
      telemetry: tel,
    },
    isTimeout ? 504 : res.status >= 400 && res.status < 600 ? res.status : 502,
    cors,
  )
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
export type { Lang, RequestBody }
