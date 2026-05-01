import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type AuthScheme = 'bearer' | 'x-api-key' | 'none'

export interface ProviderConfig {
  id: string
  label: string
  baseURL: string
  authScheme: AuthScheme
  modelsEndpoint: string
  extraHeaders: Record<string, string>
  baseURLOverridable: boolean
  modelsRequiresAuth: boolean
}

// Cache : DB read 1x toutes les 5 min par instance Edge
let cache: { at: number; data: Map<string, ProviderConfig> } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

async function loadProviders(supabase: SupabaseClient): Promise<Map<string, ProviderConfig>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data

  const { data, error } = await supabase.from('llm_providers').select('*').eq('enabled', true)
  if (error) throw new Error(`load_llm_providers_failed: ${error.message}`)

  const map = new Map<string, ProviderConfig>()
  for (const row of (data ?? []) as Array<{
    id: string; label: string; default_base_url: string; auth_scheme: AuthScheme;
    models_endpoint: string; extra_headers: Record<string, string>;
    base_url_overridable: boolean; models_requires_auth: boolean;
  }>) {
    map.set(row.id, {
      id: row.id,
      label: row.label,
      baseURL: row.default_base_url,
      authScheme: row.auth_scheme,
      modelsEndpoint: row.models_endpoint,
      extraHeaders: row.extra_headers ?? {},
      baseURLOverridable: row.base_url_overridable,
      modelsRequiresAuth: row.models_requires_auth,
    })
  }
  cache = { at: Date.now(), data: map }
  return map
}

export async function getProviderConfig(supabase: SupabaseClient, id: string): Promise<ProviderConfig | null> {
  const map = await loadProviders(supabase)
  return map.get(id) ?? null
}

export async function getAllProviders(supabase: SupabaseClient): Promise<ProviderConfig[]> {
  const map = await loadProviders(supabase)
  return Array.from(map.values())
}

export function buildAuthHeaders(provider: ProviderConfig, apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = { ...provider.extraHeaders }
  if (provider.authScheme === 'bearer' && apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  else if (provider.authScheme === 'x-api-key' && apiKey) headers['x-api-key'] = apiKey
  return headers
}

export interface NormalizedModel {
  id: string
  displayName: string | null
  contextWindow: number | null
  pricingInputPer1M: number | null
  pricingOutputPer1M: number | null
  capabilities: string[]
}

// Approximate USD/CNY rate used to convert Moonshot prices (which are billed in
// CNY per 1M tokens on the official Kimi pricing page). Kept conservative to avoid
// under-reporting cost. Updated periodically — not authoritative for accounting.
const CNY_PER_USD = 7.2

export function normalizeModelsResponse(provider: string, raw: unknown): NormalizedModel[] {
  const data = (raw as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return []
  return data
    .map((m) => {
      const obj = m as Record<string, unknown>
      const id = (obj.id ?? obj.name) as string | undefined
      if (!id) return null

      const { pricingIn, pricingOut } = extractPricing(provider, obj)

      const ctx =
        (obj.context_length as number | undefined) ??
        (obj.context_window as number | undefined) ??
        (obj.max_context_length as number | undefined) ??
        null
      const displayName =
        (obj.name as string | undefined) ??
        (obj.display_name as string | undefined) ??
        null
      return {
        id,
        displayName,
        contextWindow: ctx,
        pricingInputPer1M: pricingIn,
        pricingOutputPer1M: pricingOut,
        capabilities: [],
      } satisfies NormalizedModel
    })
    .filter((m): m is NormalizedModel => m !== null)
}

/**
 * Extract per-1M-tokens pricing (USD) from a /models entry, provider-specific.
 *
 * Returns null when the provider's /models endpoint does not surface pricing —
 * in that case dispatch-llm will use `usage.cost` from the completion if the
 * provider returns it, otherwise fall back to 0 (no cost tracked).
 *
 * Supported:
 *   - openrouter : `pricing.prompt` / `pricing.completion` (USD per token, /1)
 *   - moonshot   : `input_price` / `output_price` (CNY per 1M, converted to USD)
 *   - mistral    : `pricing.input` / `pricing.output` (USD per 1M) when present
 *   - anthropic, openai, groq, together, deepseek : pricing absent from /models
 *     → returns null, dispatch-llm uses usage.cost or 0.
 */
function extractPricing(
  provider: string,
  obj: Record<string, unknown>,
): { pricingIn: number | null; pricingOut: number | null } {
  let pricingIn: number | null = null
  let pricingOut: number | null = null

  if (provider === 'openrouter' && obj.pricing) {
    const p = obj.pricing as { prompt?: string; completion?: string }
    pricingIn = p.prompt ? Number(p.prompt) * 1_000_000 : null
    pricingOut = p.completion ? Number(p.completion) * 1_000_000 : null
  } else if (provider === 'moonshot') {
    // Moonshot/Kimi exposes per-1M prices in CNY directly on the model object.
    // Field names observed: input_price/output_price (numeric or string CNY/1M).
    const inCny = toNumberOrNull(obj.input_price) ?? toNumberOrNull(obj.prompt_price)
    const outCny = toNumberOrNull(obj.output_price) ?? toNumberOrNull(obj.completion_price)
    if (inCny !== null) pricingIn = inCny / CNY_PER_USD
    if (outCny !== null) pricingOut = outCny / CNY_PER_USD
  } else if (provider === 'mistral' && obj.pricing) {
    // Mistral occasionally returns pricing in /v1/models — when present, USD/1M.
    const p = obj.pricing as { input?: number | string; output?: number | string }
    pricingIn = toNumberOrNull(p.input)
    pricingOut = toNumberOrNull(p.output)
  }

  // Sanity guard: pricing must be a finite, non-negative number.
  if (pricingIn !== null && (!Number.isFinite(pricingIn) || pricingIn < 0)) pricingIn = null
  if (pricingOut !== null && (!Number.isFinite(pricingOut) || pricingOut < 0)) pricingOut = null

  return { pricingIn, pricingOut }
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
