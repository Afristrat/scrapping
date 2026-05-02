import { z } from 'zod'

export const apiKeyProviders = [
  'openrouter',
  'moonshot',
  'anthropic',
  'openai',
  'google',
  'mistral',
  'groq',
  'together',
  'deepseek',
  'ollama',
  'apify',
] as const
export type ApiKeyProvider = (typeof apiKeyProviders)[number]

export const apiKeySchema = z.object({
  provider: z.enum(apiKeyProviders),
  encrypted_key: z.string().min(1, 'Cle requise'),
})

export type ApiKeyFormValues = z.infer<typeof apiKeySchema>

export interface UserApiKey {
  id: string
  user_id: string
  provider: ApiKeyProvider
  masked_key: string
  base_url: string | null
  validation_status: 'valid' | 'invalid' | 'unknown' | null
  last_validated_at: string | null
  created_at: string
  updated_at: string
}

export function maskKey(raw: string): string {
  if (raw.length < 10) return '***'
  return raw.slice(0, 6) + '...' + raw.slice(-4)
}
