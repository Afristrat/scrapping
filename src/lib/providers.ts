// Frontend mirror of supabase/functions/_shared/providers.ts.
// Contains only the metadata needed for UI (label, baseURL display, override flag).
// Secrets and runtime calls stay server-side.

export type LLMProviderId =
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

export interface LLMProviderUI {
  id: LLMProviderId
  label: string
  defaultBaseURL: string
  baseURLOverridable: boolean
  /** Marketing tagline / hint shown in Settings UI. */
  hint?: string
}

export const LLM_PROVIDERS: LLMProviderUI[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    baseURLOverridable: false,
    hint: 'Proxy multi-LLM (Claude, GPT, Gemini, Llama, etc.) — markup ~5%',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    defaultBaseURL: 'https://api.moonshot.ai/v1',
    baseURLOverridable: false,
    hint: 'Modèles Kimi (k2-0711, K1.5, etc.) — fenêtre contexte 128k+',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    baseURLOverridable: false,
    hint: 'Claude Opus / Sonnet / Haiku — accès direct sans proxy',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
    baseURLOverridable: false,
    hint: 'GPT-5, GPT-4o, o1, etc. — accès direct',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseURLOverridable: false,
    hint: 'Gemini 2.x — endpoint OpenAI-compatible',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    defaultBaseURL: 'https://api.mistral.ai/v1',
    baseURLOverridable: false,
    hint: 'Mistral Large / Small / Codestral',
  },
  {
    id: 'groq',
    label: 'Groq',
    defaultBaseURL: 'https://api.groq.com/openai/v1',
    baseURLOverridable: false,
    hint: 'Inférence ultra-rapide (LPU) — Llama, Mixtral, Kimi, etc.',
  },
  {
    id: 'together',
    label: 'Together AI',
    defaultBaseURL: 'https://api.together.xyz/v1',
    baseURLOverridable: false,
    hint: 'Inférence open-source à l\'échelle',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    baseURLOverridable: false,
    hint: 'DeepSeek-R1, V3 — reasoning low-cost',
  },
  {
    id: 'ollama',
    label: 'Ollama (self-hosted)',
    defaultBaseURL: 'http://localhost:11434/v1',
    baseURLOverridable: true,
    hint: 'Modèles locaux — base URL configurable',
  },
]

export function getProviderUI(id: LLMProviderId): LLMProviderUI | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id)
}
