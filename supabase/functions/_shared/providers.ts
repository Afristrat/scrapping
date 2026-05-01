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

export function normalizeModelsResponse(provider: string, raw: unknown): NormalizedModel[] {
  const data = (raw as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return []
  return data.map((m) => {
    const obj = m as Record<string, unknown>
    const id = (obj.id ?? obj.name) as string | undefined
    if (!id) return null
    let pricingIn: number | null = null
    let pricingOut: number | null = null
    if (provider === 'openrouter' && obj.pricing) {
      const p = obj.pricing as { prompt?: string; completion?: string }
      pricingIn = p.prompt ? Number(p.prompt) * 1_000_000 : null
      pricingOut = p.completion ? Number(p.completion) * 1_000_000 : null
    }
    const ctx = (obj.context_length as number | undefined) ?? (obj.context_window as number | undefined) ?? null
    const displayName = (obj.name as string | undefined) ?? (obj.display_name as string | undefined) ?? null
    return { id, displayName, contextWindow: ctx, pricingInputPer1M: pricingIn, pricingOutputPer1M: pricingOut, capabilities: [] } satisfies NormalizedModel
  }).filter((m): m is NormalizedModel => m !== null)
}
