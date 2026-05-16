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
  fetchProxyUserSettings,
  fetchScopeProfile,
  hintsOverrideToJobs,
  type Lang,
  mergeScrapeJobs,
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

// F6 2026-05-15 : classification structurée des modes de panne pour
// permettre un dashboard agrégé (failure_type sur n sessions) sans avoir
// à parser chaque error_detail. Énumérée, stable inter-stages.
export type FailureType =
  | 'timeout'
  | 'parse_failed'
  | 'validation_failed'
  | 'insufficient_signals'
  | 'all_scrapers_failed'
  | 'dispatch_failed'
  | 'service_setup_incomplete'
  | 'invalid_response'
  | 'rate_limited'
  | 'auth_failed'
  | 'unknown'

interface StageTelemetry {
  stage: string
  duration_ms: number
  ok: boolean
  cost?: number
  error?: string
  failure_type?: FailureType
  /** Présent si la fn a engagé un fallback dégradé non-bloquant (cf. F3). */
  fallback_engaged?: boolean
}

interface PipelineTelemetry {
  session_id: string
  api_key_prefix: string
  stages: StageTelemetry[]
  total_cost_usd: number
  total_duration_ms: number
}

/**
 * F6 2026-05-15 — Classifie une réponse upstream en FailureType stable.
 * Inspecte status HTTP et string error pour déterminer la catégorie.
 * Fallback : 'unknown'. Pas de PII dans la valeur retournée.
 */
export function classifyFailure(input: {
  status?: number
  error?: string
  detail?: string
}): FailureType {
  const err = (input.error ?? '').toLowerCase()
  const detail = (input.detail ?? '').toLowerCase()
  if (input.status === 504 || err === 'timeout' || err.includes('timed_out')) return 'timeout'
  if (input.status === 429 || err === 'rate_limited') return 'rate_limited'
  if (input.status === 401 || input.status === 403 || err === 'missing_authorization')
    return 'auth_failed'
  if (err === 'service_setup_incomplete') return 'service_setup_incomplete'
  if (err === 'insufficient_signals' || detail.includes('non-disqualified signals'))
    return 'insufficient_signals'
  if (err.includes('parse') || detail.includes('parse_failed')) return 'parse_failed'
  if (
    err === 'validation_failed' ||
    err === 'validation_failed_after_retry' ||
    err === 'schema_validation_failed' ||
    err === 'bad_body'
  )
    return 'validation_failed'
  if (err === 'all_scrapers_failed' || detail.toLowerCase().includes('all scrapers failed'))
    return 'all_scrapers_failed'
  if (
    err === 'dispatch_failed' ||
    err === 'dispatch_fetch_failed' ||
    err === 'dispatch_retry_failed'
  )
    return 'dispatch_failed'
  if (
    err === 'invalid_response' ||
    detail.includes('missing topics') ||
    detail.includes('missing rubric')
  )
    return 'invalid_response'
  return 'unknown'
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

// Top-level handler — dispatche GET (poll status) | POST (lance pipeline async) | OPTIONS.
export const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  const cors = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    if (!resolveCorsOrigin(origin)) {
      return new Response(null, { status: 403, headers: cors })
    }
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method === 'GET') {
    return await handleGetStatus(req, cors)
  }

  if (req.method === 'POST') {
    return await handlePostAsync(req, cors)
  }

  return jsonResp({ ok: false, error: 'method_not_allowed' }, 405, cors)
}

// Le handler POST originel reste comme fn interne (pipeline synchrone complet).
// Il est appelé en background via EdgeRuntime.waitUntil par handlePostAsync.
const handlerPipelineSync = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  const cors = buildCorsHeaders(origin)

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

  // ─── Proxy user identification (Option C — dual-mode header) ──────────
  // Pour les appels aux fns Phase 1 (research-strategist, rubric-architect,
  // signal-synthesizer, quality-auditor, llm-score-batch) et dispatch-llm,
  // on envoie le service_role en Authorization + header x-proxy-user-id
  // pointant le proxy_user_id désigné côté public_api_keys. Les fns voient
  // un caller "internal" et utilisent ce user_id comme identité pour le
  // BYOK lookup (settings.model_config + user_api_keys).
  // Coûts trackés sur llm_costs.user_id = proxy_user_id.
  //
  // Sécurité : le service_role NE TRANSITE JAMAIS par Bassira. K06 le
  // résout depuis env. Le proxy_user_id authoritatif vient de
  // public_api_keys.proxy_user_id, pas du body Bassira.
  //
  // Pour les scrapers en mode signals_session, on garde aussi le serviceKey
  // direct (table service_role-only).
  // F4 2026-05-15 : fail-fast si proxy_user_id NULL plutôt que propager
  // "null" string via le header et fail opaque dans dispatch-llm.
  if (!apiKeyRow.proxy_user_id) {
    return jsonResp(
      {
        ok: false,
        error: 'service_setup_incomplete',
        detail:
          'public_api_keys.proxy_user_id is NULL for this API key. Run scripts/setup-bassira-proxy.sql to designate a proxy user.',
      },
      500,
      cors,
    )
  }
  const proxyUserId = apiKeyRow.proxy_user_id

  // ─── Stage 1+2 PARALLEL : research-strategist + rubric-architect ──────
  // research-strategist d'abord (rubric a besoin de research_strategy en
  // input). On lance les deux en parallèle quand-même : le rubric-architect
  // dépend de research_strategy donc on ne peut pas vraiment le précâbler.
  // V1 = séquentiel sur ces deux étapes (rubric attend research_strategy).
  // → Spec dit "PARALLEL" mais sémantiquement impossible sans speculation.
  // Compromis : research-strategist seul d'abord, puis rubric-architect.

  const stratStart = Date.now()
  const internalToken = Deno.env.get('KAIROS_INTERNAL_TOKEN') ?? ''
  const proxyHeader: Record<string, string> = {
    'x-proxy-user-id': proxyUserId,
    ...(internalToken ? { 'x-internal-auth': internalToken } : {}),
  }
  const stratRes = await callInternal<ResearchStrategistResp>(
    fnUrl('research-strategist'),
    { seed: body.seed, lang: body.lang, sector_hint: body.sector_hint },
    serviceKey,
    STAGE_TIMEOUTS_MS.research_strategist,
    fetch,
    proxyHeader,
  )
  pushStage(telemetry, 'research-strategist', stratStart, {
    ok: stratRes.ok,
    durationMs: stratRes.durationMs,
    error: stratRes.ok ? undefined : stratRes.error,
    status: stratRes.ok ? undefined : stratRes.status,
    detail: stratRes.ok ? undefined : stratRes.detail,
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
    fetch,
    proxyHeader,
  )
  pushStage(telemetry, 'rubric-architect', rubricStart, {
    ok: rubricRes.ok,
    durationMs: rubricRes.durationMs,
    error: rubricRes.ok ? undefined : rubricRes.error,
    status: rubricRes.ok ? undefined : rubricRes.status,
    detail: rubricRes.ok ? undefined : rubricRes.detail,
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
  // Coverage assembly :
  //   1. jobs = hints émis par research-strategist (research_strategy.subjects)
  //   2. + body.hints_override (Bassira pousse des sources directes)
  //   3. + body.scope_profile (référence à un set pré-curé en DB)
  //   4. fallback settings du proxy_user si jobs encore vides
  // Tracé dans scrape_augmentations[] : transparence sur ce qui a complété.
  let jobs: ScrapeJob[] = buildScrapeJobs(researchStrategy)
  const scrapeAugmentations: string[] = []

  if (body.hints_override) {
    const overrideJobs = hintsOverrideToJobs(body.hints_override)
    if (overrideJobs.length > 0) {
      jobs = mergeScrapeJobs(jobs, overrideJobs)
      scrapeAugmentations.push('hints_override')
    }
  }

  if (body.scope_profile) {
    const profileHints = await fetchScopeProfile(supabase, body.scope_profile)
    if (profileHints) {
      jobs = mergeScrapeJobs(jobs, hintsOverrideToJobs(profileHints))
      scrapeAugmentations.push(`scope_profile:${body.scope_profile}`)
    } else {
      console.warn(
        `[research-from-seed] session=${sessionId} scope_profile=${body.scope_profile} not found, ignored.`,
      )
    }
  }

  // F7b — fallback settings si TOUT a échoué (strategy hints vides +
  // pas d'override + pas de scope_profile valide).
  if (jobs.length === 0) {
    const settingsFallback = await fetchProxyUserSettings(supabase, proxyUserId)
    if (settingsFallback) {
      jobs = hintsOverrideToJobs(settingsFallback)
      if (jobs.length > 0) scrapeAugmentations.push('settings_fallback')
    }
  }

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
      fallback_engaged: scrapeAugmentations.includes('settings_fallback') ? true : undefined,
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
    fetch,
    proxyHeader,
  )
  pushStage(telemetry, 'llm-score-batch', scoreStart, {
    ok: scoreRes.ok,
    durationMs: scoreRes.durationMs,
    error: scoreRes.ok ? undefined : scoreRes.error,
    status: scoreRes.ok ? undefined : scoreRes.status,
    detail: scoreRes.ok ? undefined : scoreRes.detail,
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
  // Tous les appels passés par research-from-seed transitent par
  // x-api-key (mode public API, ex. Bassira). Le profile `light`
  // (5 topics × 2 variants × 300 chars) garde le pipeline sous les
  // limites max_tokens/latence du modèle BYOK même sur graines
  // complexes — vs `full` (8/3/400) qui saturait DeepSeek-v4-flash
  // (cf. sessions cad4364d/bae8775b 2026-05-13).
  // Les callers internes en JWT direct (UI Kairos) appellent
  // signal-synthesizer sans cet override → profile=full par défaut.
  const synthStart = Date.now()
  const synthRes = await callInternal<SignalSynthesizerResp>(
    fnUrl('signal-synthesizer'),
    {
      signals: topSignals,
      research_strategy: researchStrategy,
      lang: body.lang,
      output_profile: 'light',
    },
    serviceKey,
    STAGE_TIMEOUTS_MS.synthesize,
    fetch,
    proxyHeader,
  )

  // F3 2026-05-15 : best-effort fallback. Si le synthesizer plante après
  // retry interne (validation_failed_after_retry, insufficient_signals,
  // dispatch_failed, timeout, hallucination irrécupérable...), on NE bloque
  // PLUS le pipeline : on retourne 200 OK à Bassira avec topics=[],
  // les scoredSignals top 30 bruts, et quality_warning='synthesizer_unavailable'.
  // Bassira affiche alors les signaux scorés sans clustering — c'est dégradé
  // mais ce n'est plus une page blanche. Couvre la cascade K05 (10 hotfixes
  // qui tentent d'éviter ce fail au lieu de prévoir un mode dégradé).
  let topics: unknown[] = []
  let coverageMap: Record<string, unknown> = {}
  let devilAdvocateId: string | null = null
  let culturalWarnings: string[] = []
  let synthesizerOk = false
  let synthesizerFailureType: FailureType | null = null

  if (synthRes.ok && synthRes.data?.topics) {
    synthesizerOk = true
    topics = synthRes.data.topics ?? []
    coverageMap = (synthRes.data.coverage_map ?? {}) as Record<string, unknown>
    devilAdvocateId = synthRes.data.devil_advocate_topic_id ?? null
    culturalWarnings = synthRes.data.cultural_warnings ?? []
    telemetry.total_cost_usd += synthRes.data.telemetry?.cost_usd ?? 0
    pushStage(telemetry, 'signal-synthesizer', synthStart, {
      ok: true,
      durationMs: synthRes.durationMs,
    })
  } else {
    const failStatus = synthRes.ok ? 502 : synthRes.status
    const failError = synthRes.ok ? 'invalid_response' : synthRes.error
    const failDetail = synthRes.ok ? 'missing_topics_in_response' : (synthRes.detail ?? '')
    synthesizerFailureType = classifyFailure({
      status: failStatus,
      error: failError,
      detail: failDetail,
    })
    pushStage(telemetry, 'signal-synthesizer', synthStart, {
      ok: false,
      durationMs: synthRes.durationMs,
      error: failError,
      status: failStatus,
      detail: failDetail,
      fallback_engaged: true,
    })
    console.warn(
      `[research-from-seed] session=${sessionId} synthesizer fallback engaged: failure_type=${synthesizerFailureType}`,
    )
  }

  // ─── Stage 7 : quality-auditor ───────────────────────────────────────
  // F3 2026-05-15 : ne run l'auditor QUE si le synthesizer a réussi (sinon
  // il n'y a rien à auditer — l'auditor reçoit topics=[] et fail forcément).
  let auditVerdict: 'pass' | 'warn' | 'fail' | 'deepen' | null = null
  let auditIssues: unknown[] = []
  let auditAutoCorrections: Record<string, string> = {}
  let auditDeepeningTargets: unknown[] = []
  let auditorOk = false
  let auditorFailureType: FailureType | null = null

  if (synthesizerOk) {
    const auditStart = Date.now()
    const auditRes = await callInternal<QualityAuditorResp>(
      fnUrl('quality-auditor'),
      {
        research_strategy: researchStrategy,
        rubric,
        topics_output: {
          topics,
          coverage_map: coverageMap,
          cultural_warnings: culturalWarnings,
          devil_advocate_topic_id: devilAdvocateId,
        },
        lang: body.lang,
        signals_input: topSignals.map((s) => ({ id: s.id, source: s.source, lang: s.lang })),
      },
      serviceKey,
      STAGE_TIMEOUTS_MS.audit,
      fetch,
      proxyHeader,
    )
    if (auditRes.ok && auditRes.data) {
      auditorOk = true
      auditVerdict = auditRes.data.verdict ?? 'warn'
      auditIssues = auditRes.data.issues ?? []
      auditAutoCorrections = auditRes.data.auto_corrections_applied ?? {}
      auditDeepeningTargets = auditRes.data.deepening_targets ?? []
      telemetry.total_cost_usd += auditRes.data.telemetry?.llm_cost ?? 0
      pushStage(telemetry, 'quality-auditor', auditStart, {
        ok: true,
        durationMs: auditRes.durationMs,
      })
    } else {
      const failStatus = auditRes.ok ? 502 : auditRes.status
      const failError = auditRes.ok ? 'invalid_response' : auditRes.error
      const failDetail = auditRes.ok ? 'missing_audit_response' : (auditRes.detail ?? '')
      auditorFailureType = classifyFailure({
        status: failStatus,
        error: failError,
        detail: failDetail,
      })
      pushStage(telemetry, 'quality-auditor', auditStart, {
        ok: false,
        durationMs: auditRes.durationMs,
        error: failError,
        status: failStatus,
        detail: failDetail,
        fallback_engaged: true,
      })
    }
  } else {
    // Skip auditor entirely — pushed as marker stage with duration_ms=0
    pushStage(telemetry, 'quality-auditor', Date.now(), {
      ok: true,
      durationMs: 0,
      fallback_engaged: true,
    })
  }

  // Compose quality_warning consolidé (priorité au mode le plus dégradé).
  const depthHint = body.depth_hint ?? 0
  let qualityWarning: string | null = null
  if (!synthesizerOk) {
    qualityWarning = 'synthesizer_unavailable'
  } else if (!auditorOk) {
    qualityWarning = 'audit_unavailable'
  } else if (auditVerdict === 'deepen' && depthHint < 2) {
    qualityWarning = 'deepening_recommended'
    console.warn(
      `[research-from-seed] session=${sessionId} verdict=deepen — V1 ne re-pipeline pas (US-K08).`,
    )
  } else if (auditVerdict === 'fail') {
    qualityWarning = 'quality_fail'
  } else if (auditVerdict === 'warn') {
    qualityWarning = 'quality_warn'
  }

  telemetry.total_duration_ms = Date.now() - pipelineStarted

  // Slim scored_signals payload returned in fallback mode for Bassira UI :
  // top 30 max, gardons juste les champs utiles à l'affichage dégradé.
  // En mode nominal on n'inclut PAS scored_signals_top (économie payload).
  const scoredSignalsTop = synthesizerOk
    ? undefined
    : topSignals.slice(0, 30).map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        source: s.source,
        lang: s.lang,
        score: s.score,
        excerpt: s.excerpt,
        applied_boosts: s.applied_boosts,
      }))

  return jsonResp(
    {
      ok: true,
      session_id: sessionId,
      research_strategy: researchStrategy,
      rubric,
      topics,
      coverage_map: coverageMap,
      cultural_warnings: culturalWarnings,
      devil_advocate_topic_id: devilAdvocateId,
      audit: auditorOk
        ? {
            verdict: auditVerdict,
            issues: auditIssues,
            auto_corrections_applied: auditAutoCorrections,
            deepening_targets: auditDeepeningTargets,
          }
        : null,
      quality_warning: qualityWarning,
      ...(synthesizerFailureType ? { synthesizer_failure_type: synthesizerFailureType } : {}),
      ...(auditorFailureType ? { auditor_failure_type: auditorFailureType } : {}),
      ...(scoredSignalsTop ? { scored_signals_top: scoredSignalsTop } : {}),
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
  status?: number
  detail?: string
  fallback_engaged?: boolean
}

function pushStage(tel: PipelineTelemetry, stage: string, startMs: number, res: StageRecord): void {
  const entry: StageTelemetry = {
    stage,
    duration_ms: res.durationMs ?? Date.now() - startMs,
    ok: res.ok,
    error: res.error,
  }
  if (!res.ok) {
    entry.failure_type = classifyFailure({
      status: res.status,
      error: res.error,
      detail: res.detail,
    })
  }
  if (res.fallback_engaged) entry.fallback_engaged = true
  tel.stages.push(entry)
}

function stageFail(
  tel: PipelineTelemetry,
  stage: string,
  res: { status: number; error: string; detail?: string; errors?: unknown[] },
  cors: Record<string, string>,
): Response {
  tel.total_duration_ms = tel.stages.reduce((acc, s) => acc + s.duration_ms, 0)
  // Si timeout interne → 504 STAGE_TIMEOUT
  const isTimeout = res.status === 504 || res.error === 'timeout'
  const failureType = classifyFailure({
    status: res.status,
    error: res.error,
    detail: res.detail,
  })
  return jsonResp(
    {
      ok: false,
      error: isTimeout ? 'STAGE_TIMEOUT' : 'STAGE_FAILED',
      stage,
      failure_type: failureType,
      detail: res.detail ?? res.error,
      // Propagate the upstream validation errors when available so the
      // Bassira frontend (and operators reading research_sessions.error_detail)
      // can show the exact failure cause instead of an opaque
      // "schema_validation_failed".
      ...(res.errors && res.errors.length > 0 ? { upstream_errors: res.errors } : {}),
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

// ---------------------------------------------------------------------------
// GET status endpoint — poll session_id
// ---------------------------------------------------------------------------
async function handleGetStatus(req: Request, cors: Record<string, string>): Promise<Response> {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')
  if (!sessionId) {
    return jsonResp({ ok: false, error: 'session_id_required' }, 400, cors)
  }

  // x-api-key requis pour empêcher l'énumération de sessions arbitraires
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ ok: false, error: 'service_role_env_missing' }, 500, cors)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }

  const { data, error } = await supabase
    .from('research_sessions')
    .select('id, status, result, error_detail, telemetry, created_at, completed_at')
    .eq('id', sessionId)
    .eq('api_key_id', keyValidation.key.id)
    .maybeSingle()

  if (error || !data) {
    return jsonResp({ ok: false, error: 'session_not_found' }, 404, cors)
  }

  return jsonResp(
    {
      ok: true,
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
// POST async — pre-valide, crée row, lance pipeline waitUntil, return 202
// ---------------------------------------------------------------------------
async function handlePostAsync(req: Request, cors: Record<string, string>): Promise<Response> {
  // CORS check (same as pipeline)
  const origin = req.headers.get('Origin')
  if (origin && !resolveCorsOrigin(origin)) {
    return jsonResp({ ok: false, error: 'cors_origin_not_allowed' }, 403, cors)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ ok: false, error: 'service_role_env_missing' }, 500, cors)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return jsonResp({ ok: false, error: 'missing_api_key' }, 401, cors)

  const keyValidation = await validateApiKey(supabase, apiKey)
  if (!keyValidation.ok) {
    return jsonResp({ ok: false, error: keyValidation.error }, keyValidation.status, cors)
  }
  const apiKeyRow = keyValidation.key

  const allowed = await checkRateLimit(supabase, apiKeyRow.id, apiKeyRow.rate_limit_per_min)
  if (!allowed) return jsonResp({ ok: false, error: 'rate_limited' }, 429, cors)

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

  // Create session row
  const sessionId = crypto.randomUUID()
  const insertRes = await supabase.from('research_sessions').insert({
    id: sessionId,
    api_key_id: apiKeyRow.id,
    proxy_user_id: apiKeyRow.proxy_user_id,
    status: 'running',
    seed: validation.body.seed,
    lang: validation.body.lang,
    sector_hint: validation.body.sector_hint ?? null,
    depth_hint: validation.body.depth_hint ?? null,
    output_profile: validation.body.output_profile ?? null,
  })
  if (insertRes.error) {
    return jsonResp(
      { ok: false, error: 'session_create_failed', detail: insertRes.error.message },
      500,
      cors,
    )
  }

  // Reconstruire la request pour le pipeline sync (req.json() ne peut être lu qu'une fois)
  const reqClone = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(validation.body),
  })

  // Background pipeline + persistance résultat
  const pipelinePromise = (async () => {
    try {
      const pipelineResp = await handlerPipelineSync(reqClone)
      const pipelineBody = await pipelineResp.json()
      const isOk = pipelineBody?.ok === true
      await supabase
        .from('research_sessions')
        .update({
          status: isOk ? 'completed' : 'failed',
          result: isOk ? pipelineBody : null,
          error_detail: isOk ? null : pipelineBody,
          telemetry: pipelineBody?.telemetry ?? null,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    } catch (err) {
      await supabase
        .from('research_sessions')
        .update({
          status: 'failed',
          error_detail: {
            message: err instanceof Error ? err.message : String(err),
            stage: 'background_unhandled',
          },
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  })()

  // EdgeRuntime.waitUntil pour fire-and-forget (Supabase Edge specific global)
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime
  if (er && typeof er.waitUntil === 'function') {
    er.waitUntil(pipelinePromise)
  } else {
    // Fallback runtimes sans EdgeRuntime — best-effort, on ne block pas
    pipelinePromise.catch(() => {})
  }

  return jsonResp(
    {
      ok: true,
      session_id: sessionId,
      status: 'running',
      message: `Pipeline started. Poll GET ?session_id=${sessionId} for status.`,
    },
    202,
    cors,
  )
}

// Guard so test runner can `import` this module without booting the listener.
if (import.meta.main) {
  Deno.serve(handler)
}

// Re-export commonly used types
export type { Lang, RequestBody }
