import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  extractComposedRunKinds,
  renderTemplate,
  type Language,
  type TemplateContext,
  type TemplateSignal,
} from './template.ts'
import {
  resolveComposedRuns,
  type ComposedChainEntry,
  type ExecutePromptResult,
  type ParentPromptRow,
} from './compose.ts'

/**
 * run-admin-prompt — exécute un prompt admin (template éditable) avec
 * composition optionnelle de runs précédents.
 *
 * Si `compose_chain=true`, chaque `{{run:<kind>}}` est résolu via
 * resolveComposedRuns (cached / cascade / missing / cycle / depth_limit).
 * Sinon, comportement legacy : on lit best-effort le dernier run success
 * de chaque kind sans notion de fraîcheur.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_MAX_COUNT = 30
const HARD_MAX_COUNT = 200
const DEFAULT_MAX_TOKENS = 2500
const DEFAULT_MAX_AGE_HOURS = 6
const MIN_MAX_AGE_HOURS = 1
const MAX_MAX_AGE_HOURS = 72
const DEFAULT_MAX_DEPTH = 3
const HARD_MAX_DEPTH = 5

interface RequestBody {
  prompt_id?: string
  override_filter?: SourceFilter | null
  compose_chain?: boolean
  max_age_hours?: number
  max_depth?: number
}

interface SourceFilter {
  sources?: string[] | null
  window_hours?: number | null
  min_score?: number | null
  max_count?: number | null
}

interface AdminPromptRow {
  id: string
  task_kind: string
  system_prompt: string
  user_prompt_template: string
  source_filter: SourceFilter | null
}

interface SettingsRow {
  language: string | null
  active_rubric_id: string | null
}

interface SignalRow {
  id: string
  source: string
  title: string | null
  url: string | null
  signal_date: string | null
  scraped_at: string
  raw_payload: Record<string, unknown> | null
}

interface ScoreRow {
  signal_id: string
  score: number
  reasoning: string | null
}

interface DispatchResponse {
  ok: boolean
  error?: string
  detail?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
  provider_used?: string
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

interface ExecuteContext {
  supabase: SupabaseLike
  supabaseUrl: string
  authHeader: string
  userId: string
  composeChain: boolean
  maxAgeHours: number
  maxDepth: number
}

interface ExecutePromptOnceResult {
  ok: boolean
  run_id: string | null
  content: string | null
  output_markdown: string | null
  model_used: string | null
  provider_used: string | null
  cost: number
  signal_count: number
  executed_at: string | null
  composed_chain: ComposedChainEntry[]
  cascade_total_cost: number
  error?: string
  detail?: string
  http_status?: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ ok: false, error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    const text = await req.text()
    body = text ? (JSON.parse(text) as RequestBody) : {}
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body.prompt_id || typeof body.prompt_id !== 'string') {
    return json({ ok: false, error: 'prompt_id_required' }, 400)
  }
  const promptId = body.prompt_id

  // ---- Charge le prompt admin principal (RLS)
  const promptRes = await supabase
    .from('admin_prompts')
    .select('id, task_kind, system_prompt, user_prompt_template, source_filter')
    .eq('id', promptId)
    .eq('user_id', user.id)
    .single()

  if (promptRes.error || !promptRes.data) {
    return json({ ok: false, error: 'prompt_not_found' }, 404)
  }
  const prompt = promptRes.data as AdminPromptRow

  const composeChain = body.compose_chain === true
  const maxAgeHours = clampInt(
    body.max_age_hours,
    MIN_MAX_AGE_HOURS,
    MAX_MAX_AGE_HOURS,
    DEFAULT_MAX_AGE_HOURS,
  )
  const maxDepth = clampInt(body.max_depth, 1, HARD_MAX_DEPTH, DEFAULT_MAX_DEPTH)

  const ctx: ExecuteContext = {
    supabase,
    supabaseUrl,
    authHeader: auth,
    userId: user.id,
    composeChain,
    maxAgeHours,
    maxDepth,
  }

  // ---- Exécute le prompt principal (avec override_filter, profondeur 0)
  const visited = new Set<string>([prompt.task_kind])
  const result = await executePromptOnce(ctx, prompt, body.override_filter ?? null, 0, visited)

  if (!result.ok) {
    return json(
      {
        ok: false,
        error: result.error ?? 'execution_failed',
        detail: result.detail ?? null,
        run_id: result.run_id,
      },
      result.http_status ?? 502,
    )
  }

  const totalCost = result.cost + result.cascade_total_cost

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'run-admin-prompt:run',
    status: 'ok',
    payload: {
      run_id: result.run_id,
      prompt_id: prompt.id,
      task_kind: prompt.task_kind,
      signal_count: result.signal_count,
      composed_chain: composeChain ? result.composed_chain : undefined,
      total_cost: totalCost,
      model: result.model_used,
      cost: result.cost,
    },
  })

  const responsePayload: Record<string, unknown> = {
    ok: true,
    run_id: result.run_id,
    content: result.content,
    model_used: result.model_used,
    provider_used: result.provider_used,
    cost: result.cost,
    signal_count: result.signal_count,
    executed_at: result.executed_at,
    total_cost: totalCost,
  }
  if (composeChain) responsePayload.composed_chain = result.composed_chain

  return json(responsePayload, 200)
})

/**
 * Exécute un prompt admin de bout en bout (réutilisable récursivement).
 * `overrideFilter` n'est appliqué qu'au prompt principal — les cascadés
 * utilisent leur source_filter natif. `visited` doit déjà contenir le
 * kind du prompt courant (détection de cycle).
 */
async function executePromptOnce(
  ctx: ExecuteContext,
  prompt: AdminPromptRow,
  overrideFilter: SourceFilter | null,
  depth: number,
  visited: Set<string>,
): Promise<ExecutePromptOnceResult> {
  const { supabase, userId } = ctx

  const settingsRes = await supabase
    .from('settings')
    .select('language, active_rubric_id')
    .eq('user_id', userId)
    .single()

  if (settingsRes.error || !settingsRes.data) {
    return failure('settings_not_found', null, 404)
  }
  const settings = settingsRes.data as SettingsRow
  const language = normalizeLanguage(settings.language)

  const baseFilter: SourceFilter = prompt.source_filter ?? {}
  const effectiveOverride: SourceFilter = overrideFilter ?? {}
  const filter: SourceFilter = { ...baseFilter, ...effectiveOverride }
  const maxCount = clampInt(filter.max_count, 1, HARD_MAX_COUNT, DEFAULT_MAX_COUNT)

  const signalsResult = await fetchSignalsForFilter(supabase, userId, filter, maxCount)
  if (!signalsResult.ok) {
    return failure(signalsResult.error, signalsResult.detail, 500)
  }
  const signals = signalsResult.signals

  const topicsPromise = supabase
    .from('topics')
    .select('name')
    .eq('user_id', userId)
    .eq('trend', 'emerging')
    .order('last_seen_at', { ascending: false })
    .limit(10)

  const rubricPromise: Promise<{ data: { prompt: string } | null; error: unknown }> =
    settings.active_rubric_id
      ? supabase
          .from('scoring_rubrics')
          .select('prompt')
          .eq('id', settings.active_rubric_id)
          .eq('user_id', userId)
          .single()
      : Promise.resolve({ data: null, error: null })

  const [topicsRes, rubricRes] = await Promise.all([topicsPromise, rubricPromise])

  const topicsEmerging =
    topicsRes.error || !topicsRes.data
      ? []
      : (topicsRes.data as { name: string }[]).map((t) => t.name)

  const rubric =
    rubricRes && !rubricRes.error && rubricRes.data
      ? (rubricRes.data as { prompt: string }).prompt
      : null

  // Composed runs : cascade (compose_chain) ou legacy best-effort
  const composedKinds = Array.from(
    new Set([
      ...extractComposedRunKinds(prompt.system_prompt),
      ...extractComposedRunKinds(prompt.user_prompt_template),
    ]),
  )

  let composedRuns: Record<string, string> = {}
  let composedChain: ComposedChainEntry[] = []
  let cascadeTotalCost = 0

  if (composedKinds.length > 0) {
    if (ctx.composeChain) {
      const resolved = await resolveComposedRuns({
        supabase,
        userId,
        kinds: composedKinds,
        maxAgeHours: ctx.maxAgeHours,
        maxDepth: ctx.maxDepth,
        depth,
        visited,
        executePromptOnce: async (parent: ParentPromptRow, nextDepth, nextVisited) => {
          // Cascade : source_filter natif du parent, ctx (compose_chain ON) réutilisé.
          const parentRow: AdminPromptRow = {
            id: parent.id,
            task_kind: parent.task_kind,
            system_prompt: parent.system_prompt,
            user_prompt_template: parent.user_prompt_template,
            source_filter: (parent.source_filter as SourceFilter | null) ?? null,
          }
          const r = await executePromptOnce(ctx, parentRow, null, nextDepth, nextVisited)
          return toExecuteResult(r)
        },
      })
      composedRuns = resolved.composedRuns
      composedChain = resolved.chain
      cascadeTotalCost = resolved.totalCost
    } else {
      composedRuns = await fetchLegacyComposedRuns(supabase, userId, composedKinds)
    }
  }

  const tplCtx: TemplateContext = {
    signals,
    language,
    date: new Date().toISOString().slice(0, 10),
    topicsEmerging,
    rubric,
    composedRuns,
  }

  const renderedSystem = renderTemplate(prompt.system_prompt, tplCtx)
  const renderedUser = renderTemplate(prompt.user_prompt_template, tplCtx)

  let dispatchResult: DispatchResponse
  try {
    const dispatchRes = await fetch(`${ctx.supabaseUrl}/functions/v1/dispatch-llm`, {
      method: 'POST',
      headers: { Authorization: ctx.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'monitoring',
        messages: [
          { role: 'system', content: renderedSystem },
          { role: 'user', content: renderedUser },
        ],
        options: { max_tokens: DEFAULT_MAX_TOKENS },
      }),
    })
    dispatchResult = (await dispatchRes.json()) as DispatchResponse
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    const insertRes = await supabase
      .from('admin_prompt_runs')
      .insert({
        user_id: userId,
        prompt_id: prompt.id,
        status: 'failed',
        output_markdown: null,
        error: `dispatch_unreachable: ${reason}`,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost: 0,
      })
      .select('id')
      .single()
    return {
      ok: false,
      run_id: insertRes.data?.id ?? null,
      content: null,
      output_markdown: null,
      model_used: null,
      provider_used: null,
      cost: 0,
      signal_count: signals.length,
      executed_at: null,
      composed_chain: composedChain,
      cascade_total_cost: cascadeTotalCost,
      error: 'dispatch_unreachable',
      detail: reason,
      http_status: 502,
    }
  }

  if (!dispatchResult.ok || !dispatchResult.content) {
    const reason = dispatchResult.error ?? 'dispatch_failed'
    const detail = dispatchResult.detail ?? null
    const insertRes = await supabase
      .from('admin_prompt_runs')
      .insert({
        user_id: userId,
        prompt_id: prompt.id,
        status: 'failed',
        output_markdown: null,
        model_used: dispatchResult.model_used ?? null,
        provider_used: dispatchResult.provider_used ?? null,
        error: detail ? `${reason}: ${detail}` : reason,
        prompt_tokens: dispatchResult.usage?.prompt_tokens ?? 0,
        completion_tokens: dispatchResult.usage?.completion_tokens ?? 0,
        cost: dispatchResult.usage?.cost ?? 0,
      })
      .select('id')
      .single()
    return {
      ok: false,
      run_id: insertRes.data?.id ?? null,
      content: null,
      output_markdown: null,
      model_used: dispatchResult.model_used ?? null,
      provider_used: dispatchResult.provider_used ?? null,
      cost: dispatchResult.usage?.cost ?? 0,
      signal_count: signals.length,
      executed_at: null,
      composed_chain: composedChain,
      cascade_total_cost: cascadeTotalCost,
      error: 'llm_failed',
      detail: reason,
      http_status: 502,
    }
  }

  const content = dispatchResult.content
  const modelUsed = dispatchResult.model_used ?? 'unknown'
  const providerUsed = dispatchResult.provider_used ?? 'unknown'
  const promptTokens = dispatchResult.usage?.prompt_tokens ?? 0
  const completionTokens = dispatchResult.usage?.completion_tokens ?? 0
  const cost = dispatchResult.usage?.cost ?? 0

  const [runInsertRes, costInsertRes] = await Promise.all([
    supabase
      .from('admin_prompt_runs')
      .insert({
        user_id: userId,
        prompt_id: prompt.id,
        status: 'success',
        output_markdown: content,
        model_used: modelUsed,
        provider_used: providerUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost,
      })
      .select('id, executed_at')
      .single(),
    supabase.from('llm_costs').insert({
      user_id: userId,
      task: `admin_prompt:${prompt.task_kind}`,
      model: modelUsed,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    }),
  ])

  if (runInsertRes.error || !runInsertRes.data) {
    await supabase.from('logs').insert({
      user_id: userId,
      action: 'run-admin-prompt:error',
      status: 'error',
      payload: {
        stage: 'persist_run',
        prompt_id: prompt.id,
        run_err: runInsertRes.error?.message ?? null,
        cost_err: costInsertRes.error?.message ?? null,
      },
    })
    return failure('db_write_failed', null, 500)
  }

  return {
    ok: true,
    run_id: runInsertRes.data.id,
    content,
    output_markdown: content,
    model_used: modelUsed,
    provider_used: providerUsed,
    cost,
    signal_count: signals.length,
    executed_at: runInsertRes.data.executed_at,
    composed_chain: composedChain,
    cascade_total_cost: cascadeTotalCost,
  }
}

/**
 * Construit la requête signals (sources + window), puis left-join des scores
 * côté client (RLS-safe), puis tri par score desc.
 */
async function fetchSignalsForFilter(
  supabase: SupabaseLike,
  userId: string,
  filter: SourceFilter,
  maxCount: number,
): Promise<
  { ok: true; signals: TemplateSignal[] } | { ok: false; error: string; detail: string | null }
> {
  let signalsQuery = supabase
    .from('signals')
    .select('id, source, title, url, signal_date, scraped_at, raw_payload')
    .eq('user_id', userId)

  if (Array.isArray(filter.sources) && filter.sources.length > 0) {
    signalsQuery = signalsQuery.in('source', filter.sources)
  }

  if (typeof filter.window_hours === 'number' && filter.window_hours > 0) {
    const sinceIso = new Date(Date.now() - filter.window_hours * 60 * 60 * 1000).toISOString()
    signalsQuery = signalsQuery.gte('scraped_at', sinceIso)
  }

  signalsQuery = signalsQuery.limit(maxCount * 4)

  const signalsRes = await signalsQuery
  if (signalsRes.error) {
    return { ok: false, error: 'signals_fetch_failed', detail: signalsRes.error.message }
  }
  const rawSignals = (signalsRes.data ?? []) as SignalRow[]

  const signalIds = rawSignals.map((s) => s.id)
  let scoresById = new Map<string, ScoreRow>()
  if (signalIds.length > 0) {
    const scoresRes = await supabase
      .from('scores')
      .select('signal_id, score, reasoning')
      .eq('user_id', userId)
      .in('signal_id', signalIds)
    if (scoresRes.error) {
      return { ok: false, error: 'scores_fetch_failed', detail: scoresRes.error.message }
    }
    scoresById = new Map(((scoresRes.data ?? []) as ScoreRow[]).map((s) => [s.signal_id, s]))
  }

  const minScore = typeof filter.min_score === 'number' ? filter.min_score : null
  const sinceMs =
    typeof filter.window_hours === 'number' && filter.window_hours > 0
      ? Date.now() - filter.window_hours * 60 * 60 * 1000
      : null

  const enriched: TemplateSignal[] = []
  for (const sig of rawSignals) {
    const sc = scoresById.get(sig.id) ?? null

    if (minScore !== null) {
      if (sc === null || sc.score < minScore) continue
    }

    if (sinceMs !== null) {
      const dateRaw = sig.signal_date ?? sig.scraped_at
      const t = Date.parse(dateRaw)
      if (!Number.isFinite(t) || t < sinceMs) continue
    }

    enriched.push({
      id: sig.id,
      source: sig.source,
      title: sig.title,
      url: sig.url,
      signal_date: sig.signal_date,
      scraped_at: sig.scraped_at,
      raw_payload: sig.raw_payload,
      score: sc?.score ?? null,
      reasoning: sc?.reasoning ?? null,
    })
  }

  enriched.sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : -1
    const sb = typeof b.score === 'number' ? b.score : -1
    return sb - sa
  })

  return { ok: true, signals: enriched.slice(0, maxCount) }
}

/** Legacy (compose_chain off) : dernier run success par kind, sans fraîcheur. */
async function fetchLegacyComposedRuns(
  supabase: SupabaseLike,
  userId: string,
  kinds: string[],
): Promise<Record<string, string>> {
  if (kinds.length === 0) return {}

  const promptsRes = await supabase
    .from('admin_prompts')
    .select('id, task_kind')
    .eq('user_id', userId)
    .in('task_kind', kinds)

  if (promptsRes.error || !promptsRes.data) return {}
  const prompts = promptsRes.data as { id: string; task_kind: string }[]
  if (prompts.length === 0) return {}

  const promptIdToKind = new Map<string, string>(prompts.map((p) => [p.id, p.task_kind]))

  const runsRes = await supabase
    .from('admin_prompt_runs')
    .select('prompt_id, output_markdown, executed_at')
    .eq('user_id', userId)
    .eq('status', 'success')
    .in(
      'prompt_id',
      prompts.map((p) => p.id),
    )
    .order('executed_at', { ascending: false })
    .limit(prompts.length * 5)

  if (runsRes.error || !runsRes.data) return {}

  const result: Record<string, string> = {}
  for (const run of runsRes.data as {
    prompt_id: string
    output_markdown: string | null
    executed_at: string
  }[]) {
    const kind = promptIdToKind.get(run.prompt_id)
    if (!kind) continue
    if (result[kind] !== undefined) continue
    if (run.output_markdown) result[kind] = run.output_markdown
  }
  return result
}

function toExecuteResult(r: ExecutePromptOnceResult): ExecutePromptResult {
  return {
    ok: r.ok,
    run_id: r.run_id,
    output_markdown: r.output_markdown,
    cost: r.cost + r.cascade_total_cost,
  }
}

function failure(
  error: string,
  detail: string | null,
  httpStatus: number,
): ExecutePromptOnceResult {
  return {
    ok: false,
    run_id: null,
    content: null,
    output_markdown: null,
    model_used: null,
    provider_used: null,
    cost: 0,
    signal_count: 0,
    executed_at: null,
    composed_chain: [],
    cascade_total_cost: 0,
    error,
    detail,
    http_status: httpStatus,
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function normalizeLanguage(raw: string | null): Language {
  if (raw === 'en' || raw === 'es' || raw === 'fr') return raw
  return 'fr'
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
