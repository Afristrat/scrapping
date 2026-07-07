/**
 * research-strategist — Edge function (Kairos K01).
 *
 * Transforme une « graine de réalité » (prompt user libre) en stratégie
 * de recherche complète : domain + geo_scope + language_mix + subjects[]
 * (3-12 adaptatifs) + tensions[] + blind_spots[] + recursion_budget.
 *
 * BYOK strict — no model imposed. Resolution via dispatch-llm + user
 * settings (settings.model_config['enrichment']). Aucun DEFAULT_MODEL
 * hardcodé ici. Le user décide le provider/modèle pour la task
 * 'enrichment' via son settings BYOK.
 *
 * Pipeline aval (référence doc Bassira) :
 *   research-strategist → rubric-architect → scrape multi-langue →
 *   llm-score-batch → signal-synthesizer → quality-auditor → (deepening?)
 *
 * Ce fichier ne fait que la 1re étape : POST seed → research_strategy JSON.
 *
 * Helpers purs (validation body, sanitization, schema check, prompts) sont
 * dans `./lib.ts` pour être testables sans booter `Deno.serve`.
 */

import { formatError } from '../_shared/errors.ts'
import {
  buildSystemPrompt,
  buildUserMessage,
  extractJsonObject,
  type RequestBody,
  sanitizeLlmJsonContent,
  validateRequestBody,
  validateResearchStrategy,
} from './lib.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIMEOUT_MS = 30_000

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
  provider_used?: string
}

interface CallResult {
  ok: boolean
  status: number
  strategy?: Record<string, unknown>
  telemetry?: {
    latency_ms: number
    model_used: string | null
    provider_used: string | null
    cost: number
    attempts: number
  }
  error?: string
  detail?: string
}

async function callDispatchOnce(
  dispatchUrl: string,
  auth: string,
  systemPrompt: string,
  userMessage: string,
  correctionHint: string | null,
): Promise<DispatchResponse> {
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userMessage },
  ]
  if (correctionHint) {
    messages.push({ role: 'user' as const, content: correctionHint })
  }

  const res = await fetch(dispatchUrl, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'enrichment',
      cost_task: 'research:strategist',
      messages,
      options: {
        response_format: { type: 'json_object' },
        temperature: 0.4,
      },
    }),
  })

  return (await res.json()) as DispatchResponse
}

async function runResearchStrategist(
  dispatchUrl: string,
  auth: string,
  body: RequestBody,
): Promise<CallResult> {
  const systemPrompt = buildSystemPrompt(body.lang)
  const userMessage = buildUserMessage(body)
  const startedAt = Date.now()

  let attempts = 0
  let lastDispatch: DispatchResponse | null = null
  let correctionHint: string | null = null

  // 2 tentatives max : 1 nominale + 1 retry sur parse/schema fail.
  for (let i = 0; i < 2; i++) {
    attempts++
    try {
      lastDispatch = await callDispatchOnce(
        dispatchUrl,
        auth,
        systemPrompt,
        userMessage,
        correctionHint,
      )
    } catch (err) {
      // erreur réseau / fetch failed → retry une fois si premier coup
      if (i === 0) {
        correctionHint = null
        continue
      }
      return {
        ok: false,
        status: 502,
        error: 'dispatch_unreachable',
        detail: formatError(err).message,
      }
    }

    if (!lastDispatch.ok) {
      // dispatch a renvoyé une erreur applicative → on retry une fois
      if (i === 0) {
        correctionHint = null
        continue
      }
      return {
        ok: false,
        status: 502,
        error: 'dispatch_failed',
        detail: lastDispatch.error ?? 'unknown',
      }
    }

    const raw = lastDispatch.content ?? ''
    const cleaned = sanitizeLlmJsonContent(raw)
    const candidate = extractJsonObject(cleaned) ?? cleaned

    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      correctionHint =
        'Output strict JSON, no preamble, no markdown fences, no XML tags. Re-emit ONLY the research_strategy JSON object.'
      continue
    }

    const schema = validateResearchStrategy(parsed)
    if (!schema.ok) {
      correctionHint =
        `Schema invalid: ${schema.error}${schema.detail ? ' (' + schema.detail + ')' : ''}. ` +
        'Re-emit STRICT research_strategy JSON respecting all constraints (subjects 3-12, recursion_budget 0-2, valid angle).'
      continue
    }

    return {
      ok: true,
      status: 200,
      strategy: schema.strategy,
      telemetry: {
        latency_ms: Date.now() - startedAt,
        model_used: lastDispatch.model_used ?? null,
        provider_used: lastDispatch.provider_used ?? null,
        cost: lastDispatch.usage?.cost ?? 0,
        attempts,
      },
    }
  }

  return {
    ok: false,
    status: 502,
    error: 'llm_output_invalid_after_retry',
    detail: 'Schema validation or JSON parse failed twice.',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return json({ ok: false, error: 'supabase_env_missing' }, 500)

  // Le check JWT signature complet est délégué à dispatch-llm via getUser().
  // Ici on vérifie seulement la forme du header pour éviter un round-trip
  // gaspillé sur des tokens absents/malformés.
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json({ ok: false, error: 'invalid_authorization_format' }, 401)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const validation = validateRequestBody(raw)
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400)
  }

  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`

  // Timeout global 30s : on race la promesse interne contre une timeout promise.
  let timeoutId: number | undefined
  const timeoutPromise = new Promise<CallResult>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout_30s')), TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([
      runResearchStrategist(dispatchUrl, auth, validation.body),
      timeoutPromise,
    ])
    if (timeoutId !== undefined) clearTimeout(timeoutId)

    if (!result.ok) {
      return json({ ok: false, error: result.error, detail: result.detail }, result.status)
    }

    return json(
      {
        ok: true,
        research_strategy: result.strategy,
        telemetry: result.telemetry,
      },
      200,
    )
  } catch (err) {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    const f = formatError(err)
    if (f.message === 'timeout_30s') {
      return json({ ok: false, error: 'timeout' }, 504)
    }
    return json({ ok: false, error: 'internal_error', detail: f.message }, 500)
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
