import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  extractComposedRunKinds,
  renderTemplate,
  type Language,
  type TemplateContext,
  type TemplateSignal,
} from './template.ts'

/**
 * run-admin-prompt — Edge function qui exécute un prompt admin (template
 * éditable) avec composition de runs précédents et fetch dynamique des
 * signaux selon source_filter.
 *
 * Pipeline :
 *   1. Auth user via JWT
 *   2. Charge le prompt admin (RLS — uniquement le user)
 *   3. Charge settings (language, active_rubric_id)
 *   4. Calcule le filter effectif (prompt.source_filter ⊕ override_filter)
 *   5. Fetch signaux selon filter (sources, window_hours, min_score, max_count)
 *   6. Fetch topics 'emerging' (top 10 par last_seen_at)
 *   7. Fetch active rubric prompt (si configurée)
 *   8. Pour chaque {{run:<kind>}} référencé, fetch le dernier run success
 *   9. Render system_prompt + user_prompt_template
 *  10. Appel /functions/v1/dispatch-llm avec task: 'monitoring'
 *  11. Insert dans admin_prompt_runs (status success/failed + usage)
 *  12. Réponse JSON
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_MAX_COUNT = 30
const HARD_MAX_COUNT = 200
const DEFAULT_MAX_TOKENS = 2500

interface RequestBody {
  prompt_id?: string
  override_filter?: SourceFilter | null
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

  // ---- 1. Charge le prompt admin (RLS)
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

  // ---- 2. Charge settings (language, active_rubric_id)
  const settingsRes = await supabase
    .from('settings')
    .select('language, active_rubric_id')
    .eq('user_id', user.id)
    .single()

  if (settingsRes.error || !settingsRes.data) {
    return json({ ok: false, error: 'settings_not_found' }, 404)
  }
  const settings = settingsRes.data as SettingsRow
  const language = normalizeLanguage(settings.language)

  // ---- 3. Filter effectif (override > prompt.source_filter)
  const baseFilter: SourceFilter = prompt.source_filter ?? {}
  const overrideFilter: SourceFilter = body.override_filter ?? {}
  const filter: SourceFilter = { ...baseFilter, ...overrideFilter }
  const maxCount = clampInt(filter.max_count, 1, HARD_MAX_COUNT, DEFAULT_MAX_COUNT)

  // ---- 4. Fetch signaux + scores en parallèle
  // Stratégie : on construit la requête signals avec filtres source / window,
  // puis on left-join scores côté client (RLS-safe). On trie par score desc.
  let signalsQuery = supabase
    .from('signals')
    .select('id, source, title, url, signal_date, scraped_at, raw_payload')
    .eq('user_id', user.id)

  if (Array.isArray(filter.sources) && filter.sources.length > 0) {
    signalsQuery = signalsQuery.in('source', filter.sources)
  }

  if (typeof filter.window_hours === 'number' && filter.window_hours > 0) {
    const sinceIso = new Date(Date.now() - filter.window_hours * 60 * 60 * 1000).toISOString()
    // signal_date OR scraped_at — on filtre sur scraped_at en première passe
    // (signal_date peut être NULL) puis on raffine côté client.
    signalsQuery = signalsQuery.gte('scraped_at', sinceIso)
  }

  // Limite haute pour avoir de la marge avant le tri par score.
  signalsQuery = signalsQuery.limit(maxCount * 4)

  const signalsRes = await signalsQuery
  if (signalsRes.error) {
    return json(
      { ok: false, error: 'signals_fetch_failed', detail: signalsRes.error.message },
      500,
    )
  }
  const rawSignals = (signalsRes.data ?? []) as SignalRow[]

  // Fetch scores associés (RLS sur user_id).
  const signalIds = rawSignals.map((s) => s.id)
  let scoresById = new Map<string, ScoreRow>()
  if (signalIds.length > 0) {
    const scoresRes = await supabase
      .from('scores')
      .select('signal_id, score, reasoning')
      .eq('user_id', user.id)
      .in('signal_id', signalIds)
    if (scoresRes.error) {
      return json(
        { ok: false, error: 'scores_fetch_failed', detail: scoresRes.error.message },
        500,
      )
    }
    scoresById = new Map(((scoresRes.data ?? []) as ScoreRow[]).map((s) => [s.signal_id, s]))
  }

  // Filtre min_score + raffinement signal_date/window + tri.
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
  const signals = enriched.slice(0, maxCount)

  // ---- 5. Topics 'emerging' (top 10 récents) + rubric + composed runs
  const topicsPromise = supabase
    .from('topics')
    .select('name')
    .eq('user_id', user.id)
    .eq('trend', 'emerging')
    .order('last_seen_at', { ascending: false })
    .limit(10)

  const rubricPromise: Promise<{ data: { prompt: string } | null; error: unknown }> =
    settings.active_rubric_id
      ? supabase
          .from('scoring_rubrics')
          .select('prompt')
          .eq('id', settings.active_rubric_id)
          .eq('user_id', user.id)
          .single()
      : Promise.resolve({ data: null, error: null })

  // Détecte les task_kind référencés via {{run:...}} dans system + user template
  const composedKinds = Array.from(
    new Set([
      ...extractComposedRunKinds(prompt.system_prompt),
      ...extractComposedRunKinds(prompt.user_prompt_template),
    ]),
  )

  const composedRunsPromise = fetchComposedRuns(supabase, user.id, composedKinds)

  const [topicsRes, rubricRes, composedRuns] = await Promise.all([
    topicsPromise,
    rubricPromise,
    composedRunsPromise,
  ])

  const topicsEmerging =
    topicsRes.error || !topicsRes.data
      ? []
      : (topicsRes.data as { name: string }[]).map((t) => t.name)

  const rubric =
    rubricRes && !rubricRes.error && rubricRes.data
      ? (rubricRes.data as { prompt: string }).prompt
      : null

  // ---- 6. Render templates
  const ctx: TemplateContext = {
    signals,
    language,
    date: new Date().toISOString().slice(0, 10),
    topicsEmerging,
    rubric,
    composedRuns,
  }

  const renderedSystem = renderTemplate(prompt.system_prompt, ctx)
  const renderedUser = renderTemplate(prompt.user_prompt_template, ctx)

  // ---- 7. Appel dispatch-llm
  let dispatchResult: DispatchResponse
  try {
    const dispatchRes = await fetch(`${supabaseUrl}/functions/v1/dispatch-llm`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
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
        user_id: user.id,
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
    return json(
      {
        ok: false,
        error: 'dispatch_unreachable',
        detail: reason,
        run_id: insertRes.data?.id ?? null,
      },
      502,
    )
  }

  // ---- 8. Persist run
  if (!dispatchResult.ok || !dispatchResult.content) {
    const reason = dispatchResult.error ?? 'dispatch_failed'
    const detail = dispatchResult.detail ?? null
    const insertRes = await supabase
      .from('admin_prompt_runs')
      .insert({
        user_id: user.id,
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
    return json(
      {
        ok: false,
        error: 'llm_failed',
        detail: reason,
        run_id: insertRes.data?.id ?? null,
      },
      502,
    )
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
        user_id: user.id,
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
      user_id: user.id,
      task: `admin_prompt:${prompt.task_kind}`,
      model: modelUsed,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    }),
  ])

  if (runInsertRes.error || !runInsertRes.data) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'run-admin-prompt:error',
      status: 'error',
      payload: {
        stage: 'persist_run',
        prompt_id: prompt.id,
        run_err: runInsertRes.error?.message ?? null,
        cost_err: costInsertRes.error?.message ?? null,
      },
    })
    return json({ ok: false, error: 'db_write_failed' }, 500)
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'run-admin-prompt:run',
    status: 'ok',
    payload: {
      run_id: runInsertRes.data.id,
      prompt_id: prompt.id,
      task_kind: prompt.task_kind,
      signal_count: signals.length,
      composed_kinds: composedKinds,
      model: modelUsed,
      cost,
    },
  })

  return json(
    {
      ok: true,
      run_id: runInsertRes.data.id,
      content,
      model_used: modelUsed,
      provider_used: providerUsed,
      cost,
      signal_count: signals.length,
      executed_at: runInsertRes.data.executed_at,
    },
    200,
  )
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Pour chaque task_kind référencé, fetch le dernier run success de ce kind
 * (du user courant, RLS-safe) et retourne un mapping kind → output_markdown.
 */
async function fetchComposedRuns(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  kinds: string[],
): Promise<Record<string, string>> {
  if (kinds.length === 0) return {}

  // Étape 1 : récupère les ids des prompts du user dont task_kind ∈ kinds
  const promptsRes = await supabase
    .from('admin_prompts')
    .select('id, task_kind')
    .eq('user_id', userId)
    .in('task_kind', kinds)

  if (promptsRes.error || !promptsRes.data) return {}
  const prompts = promptsRes.data as { id: string; task_kind: string }[]
  if (prompts.length === 0) return {}

  const promptIdToKind = new Map<string, string>(prompts.map((p) => [p.id, p.task_kind]))

  // Étape 2 : pour chaque prompt id, récupère le dernier run success.
  // On fait une requête groupée puis on garde le plus récent par prompt_id.
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
    .limit(prompts.length * 5) // marge

  if (runsRes.error || !runsRes.data) return {}

  const result: Record<string, string> = {}
  for (const run of runsRes.data as {
    prompt_id: string
    output_markdown: string | null
    executed_at: string
  }[]) {
    const kind = promptIdToKind.get(run.prompt_id)
    if (!kind) continue
    if (result[kind] !== undefined) continue // déjà le plus récent
    if (run.output_markdown) result[kind] = run.output_markdown
  }
  return result
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
