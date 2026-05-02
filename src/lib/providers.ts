// Types only — actual data fetched via useLLMProviders hook from DB
export type AuthScheme = 'bearer' | 'x-api-key' | 'none'

export interface LLMProviderUI {
  id: string
  label: string
  defaultBaseURL: string
  baseURLOverridable: boolean
  hint: string | null
}

export type LLMProviderId = string
