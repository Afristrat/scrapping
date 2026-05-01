// Provider configs for BYOK multi-LLM support.
// Most providers expose an OpenAI-compatible API at the listed baseURL,
// allowing reuse of the OpenAI SDK client.

export type ProviderId =
  | 'openrouter'
  | 'moonshot'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'ollama'

export interface ProviderConfig {
  id: ProviderId
  label: string
  baseURL: string
  authScheme: 'bearer' | 'x-api-key' | 'none'
  modelsEndpoint: string
  /** Provider-specific extra headers needed alongside auth. */
  extraHeaders?: Record<string, string>
  /** True when the provider's /models endpoint requires user-specific auth. */
  modelsRequiresAuth: boolean
  /** True when the user must supply a base URL (e.g. self-hosted Ollama). */
  baseURLOverridable: boolean
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    baseURL: 'https://api.moonshot.ai/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1',
    authScheme: 'x-api-key',
    modelsEndpoint: '/models',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    baseURL: 'https://api.mistral.ai/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  together: {
    id: 'together',
    label: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    authScheme: 'bearer',
    modelsEndpoint: '/models',
    modelsRequiresAuth: true,
    baseURLOverridable: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (self-hosted)',
    baseURL: 'http://localhost:11434/v1',
    authScheme: 'none',
    modelsEndpoint: '/models',
    modelsRequiresAuth: false,
    baseURLOverridable: true,
  },
}

export function getProviderConfig(provider: string): ProviderConfig | null {
  return (PROVIDERS as Record<string, ProviderConfig>)[provider] ?? null
}

export function buildAuthHeaders(
  provider: ProviderConfig,
  apiKey: string | null,
): Record<string, string> {
  const headers: Record<string, string> = { ...(provider.extraHeaders ?? {}) }
  if (provider.authScheme === 'bearer' && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  } else if (provider.authScheme === 'x-api-key' && apiKey) {
    headers['x-api-key'] = apiKey
  }
  return headers
}

/**
 * Normalize the /models response to a uniform shape across providers.
 * Most OpenAI-compat endpoints return { data: [{ id, ... }, ...] }.
 * Anthropic returns { data: [{ id, display_name, type, ... }] }.
 * Google returns { data: [{ id, ... }] } via the OpenAI-compat endpoint.
 */
export interface NormalizedModel {
  id: string
  displayName: string | null
  contextWindow: number | null
  pricingInputPer1M: number | null
  pricingOutputPer1M: number | null
  capabilities: string[]
}

export function normalizeModelsResponse(
  provider: ProviderId,
  raw: unknown,
): NormalizedModel[] {
  const data = (raw as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return []

  return data
    .map((m) => {
      const obj = m as Record<string, unknown>
      const id = (obj.id ?? obj.name) as string | undefined
      if (!id) return null

      // OpenRouter exposes pricing on each model in $/token (string).
      // We convert to $/1M tokens.
      let pricingIn: number | null = null
      let pricingOut: number | null = null
      if (provider === 'openrouter' && obj.pricing) {
        const p = obj.pricing as { prompt?: string; completion?: string }
        pricingIn = p.prompt ? Number(p.prompt) * 1_000_000 : null
        pricingOut = p.completion ? Number(p.completion) * 1_000_000 : null
      }

      const ctx =
        (obj.context_length as number | undefined) ??
        (obj.context_window as number | undefined) ??
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
