import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { retryWithBackoff } from '../_shared/retry.ts'
import { getProviderConfig } from '../_shared/providers.ts'
import { internalServiceClient, resolveCaller, resolveOrgId } from '../_shared/internal-auth.ts'
import { budgetExceeded } from '../_shared/budget-check.ts'
import {
  resolveProviderAndModel,
  sanitizeCostTask,
  validateOverrides,
  type SettingsLike,
} from './resolve.ts'

/**
 * dispatch-llm — Péage unique LLM (ADR 0010). Toute fonction consommatrice
 * (llm-score, llm-score-batch, digest, enrich-*, run-admin-prompt, backtest,
 * chaîne K06, ...) passe par ici au lieu de dupliquer la logique provider.
 *
 * Responsabilités centralisées :
 *   1. Auth dual-mode (resolveCaller, ADR 0009) : JWT user OU appel interne
 *      (x-internal-secret + x-proxy-user-id).
 *   2. Résolution (provider, model) : overrides du body (consensus
 *      multi-modèles) > settings.model_config[task] > OpenRouter par défaut.
 *   3. Garde budget (budget-check.ts, fail-open) : 402 si la dépense LLM du
 *      jour atteint settings.daily_budget_usd — AVANT l'appel payant.
 *   4. Péage argent : chaque complétion aboutie écrit UNE ligne llm_costs
 *      (label fin via cost_task). Les callers n'écrivent plus llm_costs.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Task = 'scoring' | 'scraping' | 'monitoring' | 'digest' | 'enrichment'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface DispatchOptions {
  max_tokens?: number
  response_format?: { type: 'json_object' | 'text' }
  temperature?: number
}

interface RequestBody {
  task: Task
  messages: ChatMessage[]
  options?: DispatchOptions
  /** Override consensus : couple obligatoire, prioritaire sur model_config. */
  provider_override?: string
  model_override?: string
  /** Label fin écrit dans llm_costs.task (ex. 'enrich:topic'). Défaut : task. */
  cost_task?: string
}

interface SettingsRow extends SettingsLike {
  daily_budget_usd?: number | string | null
}

const VALID_TASKS: ReadonlySet<Task> = new Set([
  'scoring',
  'scraping',
  'monitoring',
  'digest',
  'enrichment',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  // Client user-scoped (RLS) — utilisé par resolveCaller en mode user.
  const auth = req.headers.get('Authorization')
  const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: auth ? { Authorization: auth } : {} },
  })

  const caller = await resolveCaller(userScoped, req)
  if (!caller.ok) return json({ ok: false, error: caller.error }, 401)
  const userId = caller.userId

  // Mode internal : pas de JWT user → service_role avec filtres user_id
  // explicites sur toutes les queries. Mode user : client RLS.
  let db: SupabaseClient
  if (caller.mode === 'internal') {
    try {
      db = internalServiceClient(createClient)
    } catch (err) {
      return json(
        { ok: false, error: 'internal_client_misconfigured', detail: errMessage(err) },
        500,
      )
    }
  } else {
    db = userScoped
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body.task || !VALID_TASKS.has(body.task)) {
    return json({ ok: false, error: 'invalid_task' }, 400)
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ ok: false, error: 'messages_required' }, 400)
  }
  for (const m of body.messages) {
    if (
      !m ||
      (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string'
    ) {
      return json({ ok: false, error: 'invalid_message' }, 400)
    }
  }

  const overrideValidation = validateOverrides(body.provider_override, body.model_override)
  if (!overrideValidation.ok) {
    return json({ ok: false, error: 'invalid_override', detail: overrideValidation.detail }, 400)
  }

  // Defensive: if no settings row exists (trigger missed firing), use empty config
  // → fallback chain in resolveProviderAndModel kicks in (OpenRouter defaults)
  // et budget guard désactivé (fail-open).
  const settingsRes = await db
    .from('settings')
    .select('model_config, daily_budget_usd')
    .eq('user_id', userId)
    .maybeSingle()

  const settings: SettingsRow = (settingsRes.data as SettingsRow | null) ?? {
    model_config: null,
    daily_budget_usd: null,
  }

  // org_id résolu explicitement : llm_costs.org_id et logs.org_id sont NOT NULL
  // et leur DEFAULT user_default_org_id() repose sur auth.uid() — NULL en mode
  // internal (service_role). Même sémantique que le DEFAULT : premier org rejoint.
  const orgId = await resolveOrgId(db, userId)

  // ── Garde budget (AVANT l'appel payant) ────────────────────────────────────
  const dailyBudget =
    settings.daily_budget_usd === null || settings.daily_budget_usd === undefined
      ? null
      : Number(settings.daily_budget_usd)
  if (await budgetExceeded(db, userId, dailyBudget)) {
    await insertLog(db, userId, orgId, 'dispatch-llm:budget_exceeded', 'warning', {
      task: body.task,
      daily_budget_usd: dailyBudget,
    })
    return json({ ok: false, error: 'budget_exceeded', daily_budget_usd: dailyBudget }, 402)
  }

  const { providerId, modelId, source } = resolveProviderAndModel(
    settings,
    body.task,
    overrideValidation.override,
  )

  const providerCfg = await getProviderConfig(db, providerId)
  if (!providerCfg) {
    return json({ ok: false, error: 'unknown_provider', provider: providerId }, 500)
  }

  const apiKey = await getUserApiKey(db, userId, providerId)
  if (!apiKey && providerCfg.modelsRequiresAuth) {
    return json({ ok: false, error: 'missing_api_key', provider: providerId }, 500)
  }

  const client = new OpenAI({
    baseURL: providerCfg.baseURL,
    apiKey: apiKey ?? 'not-required',
    defaultHeaders: {
      ...providerCfg.extraHeaders,
      'HTTP-Referer': 'https://kairos.local',
      'X-Title': 'kairos-dispatch',
    },
  })

  const opts = body.options ?? {}

  let completion
  try {
    completion = await retryWithBackoff(
      () =>
        client.chat.completions.create({
          model: modelId,
          messages: body.messages,
          ...(opts.max_tokens !== undefined ? { max_tokens: opts.max_tokens } : {}),
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(opts.response_format ? { response_format: opts.response_format } : {}),
        }),
      { maxAttempts: 5, baseDelayMs: 1500 },
    )
  } catch (err) {
    const reason = errMessage(err)
    await insertLog(db, userId, orgId, 'dispatch-llm:error', 'error', {
      task: body.task,
      provider: providerId,
      model: modelId,
      resolution_source: source,
      error: reason,
    })
    return json(
      {
        ok: false,
        error: 'llm_failed',
        provider: providerId,
        model: modelId,
        detail: reason,
      },
      502,
    )
  }

  const content = completion.choices[0]?.message?.content ?? ''

  const rawUsage = completion.usage as
    | { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    | undefined
  const promptTokens = rawUsage?.prompt_tokens ?? 0
  const completionTokens = rawUsage?.completion_tokens ?? 0
  // Fallback chain for cost calculation:
  //   1. usage.cost from the provider (OpenRouter is the only one returning this today)
  //   2. provider_models.pricing_* — populated by /refresh-models per user
  //   3. 0 — never crash; missing pricing simply means we cannot track precisely
  let cost: number = rawUsage?.cost ?? 0
  if (rawUsage?.cost === undefined) {
    cost = await computeCostFromProviderModels(
      db,
      userId,
      providerId,
      modelId,
      promptTokens,
      completionTokens,
    )
  }

  // ── Péage argent : UNE ligne llm_costs par complétion aboutie ─────────────
  const costTask = sanitizeCostTask(body.cost_task, body.task)
  let costRecorded = false
  if (orgId) {
    const { error: costErr } = await db.from('llm_costs').insert({
      user_id: userId,
      org_id: orgId,
      task: costTask,
      model: modelId,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    })
    costRecorded = !costErr
    if (costErr) {
      await insertLog(db, userId, orgId, 'dispatch-llm:cost_write_failed', 'error', {
        task: costTask,
        model: modelId,
        cost,
        error: costErr.message,
      })
    }
  } else {
    // Sans org, l'insert violerait NOT NULL — on logge fort plutôt que planter
    // la réponse (le contenu LLM prime), mais ce cas est anormal (backfill org).
    await insertLog(db, userId, null, 'dispatch-llm:cost_write_failed', 'error', {
      task: costTask,
      model: modelId,
      cost,
      error: 'org_id_unresolved',
    })
  }

  return json(
    {
      ok: true,
      content,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost,
      },
      model_used: modelId,
      provider_used: providerId,
      cost_recorded: costRecorded,
    },
    200,
  )
})

/**
 * Insert logs best-effort. logs.org_id est NOT NULL : sans org résolu on
 * s'appuie sur le DEFAULT (mode user) — en mode internal sans org le log est
 * perdu, mais un échec de log ne doit jamais casser la réponse.
 */
async function insertLog(
  db: SupabaseClient,
  userId: string,
  orgId: string | null,
  action: string,
  status: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.from('logs').insert({
      user_id: userId,
      ...(orgId ? { org_id: orgId } : {}),
      action,
      status,
      payload,
    })
  } catch {
    // best-effort
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Compute cost in USD from `provider_models.pricing_*` (per 1M tokens).
 *
 * Returns 0 if no row exists for (user_id, provider, model_id) or if both
 * pricing fields are null. Single-purpose: dispatch-llm fallback when the
 * provider didn't return `usage.cost`.
 */
async function computeCostFromProviderModels(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  if (promptTokens <= 0 && completionTokens <= 0) return 0
  const { data, error } = await supabase
    .from('provider_models')
    .select('pricing_input_per_1m, pricing_output_per_1m')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('model_id', model)
    .maybeSingle()

  if (error || !data) return 0

  const row = data as {
    pricing_input_per_1m: number | null
    pricing_output_per_1m: number | null
  }
  const inRate = row.pricing_input_per_1m ?? 0
  const outRate = row.pricing_output_per_1m ?? 0
  if (inRate === 0 && outRate === 0) return 0

  return (promptTokens * inRate + completionTokens * outRate) / 1_000_000
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
