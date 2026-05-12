import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { retryWithBackoff } from '../_shared/retry.ts'
import { getProviderConfig } from '../_shared/providers.ts'
import { resolveAuthOrProxy } from '../_shared/service-role-auth.ts'

/**
 * dispatch-llm — Single edge function that centralizes BYOK provider
 * resolution + chat completion. All LLM-consuming functions
 * (llm-score, llm-score-batch, topic-classifier, ...) call this fn
 * instead of duplicating provider logic.
 *
 * Resolution order for (provider, model):
 *   1. settings.model_config[task] (BYOK multi-provider, single source of truth)
 *   2. fallback to OpenRouter + 'openrouter/auto'
 *
 * OpenRouter remains a first-class citizen as the default provider when
 * nothing is configured (see DEFAULT_PROVIDER below).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_PROVIDER = 'openrouter'
const DEFAULT_MODEL = 'openrouter/auto'

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
}

interface ModelConfigEntry {
  provider: string
  model: string
}

interface SettingsRow {
  model_config?: Record<string, ModelConfigEntry | null> | null
}

const VALID_TASKS: ReadonlySet<Task> = new Set([
  'scoring',
  'scraping',
  'monitoring',
  'digest',
  'enrichment',
])

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (err) {
    // Catch-all : si n'importe quel throw uncatched arrive (boot, runtime),
    // retourne JSON détaillé au lieu d'un 500 HTML "Internal Server Error".
    return json(
      {
        ok: false,
        error: 'unhandled_exception',
        detail: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
      500,
    )
  }
})

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  let supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  // Dual-mode auth : user JWT classique OU service_role + x-proxy-user-id
  // (appel orchestré depuis research-from-seed).
  const authResolved = await resolveAuthOrProxy(supabase, req)
  if (!authResolved.ok) {
    const status = authResolved.error === 'internal_missing_proxy_header' ? 400 : 401
    return json({ ok: false, error: authResolved.error }, status)
  }
  const callerUserId = authResolved.userId

  // En mode internal, re-créer le client avec service_role pour bypass RLS
  // lors des reads sur settings/user_api_keys du proxy user.
  if (authResolved.mode === 'internal') {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey) {
      return json({ ok: false, error: 'service_role_env_missing_for_internal_mode' }, 500)
    }
    supabase = createClient(supabaseUrl, serviceKey)
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

  // Defensive: if no settings row exists (trigger missed firing), use empty config
  // → fallback chain in resolveProviderAndModel kicks in (DEFAULT_PROVIDER + DEFAULT_MODEL)
  const settingsRes = await supabase
    .from('settings')
    .select('model_config')
    .eq('user_id', callerUserId)
    .maybeSingle()

  const settings: SettingsRow = (settingsRes.data as SettingsRow | null) ?? { model_config: null }

  const { providerId, modelId } = resolveProviderAndModel(settings, body.task)

  const providerCfg = await getProviderConfig(supabase, providerId)
  if (!providerCfg) {
    return json({ ok: false, error: 'unknown_provider', provider: providerId }, 500)
  }

  // getUserApiKey's signature only declares 'openrouter' | 'apify' historically.
  // The BYOK migration extended user_api_keys.provider to arbitrary strings, but
  // we deliberately don't modify _shared/api-keys.ts as part of this refactor —
  // so we cast to the historic literal union to keep the call typed.
  const apiKey = await getUserApiKey(supabase, callerUserId, providerId as 'openrouter' | 'apify')
  if (!apiKey && providerCfg.modelsRequiresAuth) {
    return json({ ok: false, error: 'missing_api_key', provider: providerId }, 500)
  }

  const client = new OpenAI({
    baseURL: providerCfg.baseURL,
    apiKey: apiKey ?? 'not-required',
    defaultHeaders: {
      ...providerCfg.extraHeaders,
      'HTTP-Referer': 'https://zlatan-scrap.local',
      'X-Title': 'zlatan-scrap-dispatch',
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
    const reason = err instanceof Error ? err.message : String(err)
    await supabase.from('logs').insert({
      user_id: callerUserId,
      action: 'dispatch-llm:error',
      status: 'error',
      payload: {
        task: body.task,
        provider: providerId,
        model: modelId,
        error: reason,
      },
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
      supabase,
      callerUserId,
      providerId,
      modelId,
      promptTokens,
      completionTokens,
    )
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
    },
    200,
  )
}

function resolveProviderAndModel(
  settings: SettingsRow,
  task: Task,
): { providerId: string; modelId: string } {
  const taskCfg = settings.model_config?.[task] ?? null

  // OpenRouter is the default fallback provider — it remains first-class.
  const providerId: string = taskCfg?.provider ?? DEFAULT_PROVIDER
  const modelId: string = taskCfg?.model || DEFAULT_MODEL

  return { providerId, modelId }
}

/**
 * Compute cost in USD from `provider_models.pricing_*` (per 1M tokens).
 *
 * Returns 0 if no row exists for (user_id, provider, model_id) or if both
 * pricing fields are null. Single-purpose: dispatch-llm fallback when the
 * provider didn't return `usage.cost`.
 */
async function computeCostFromProviderModels(
  supabase: ReturnType<typeof createClient>,
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
