import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Provider IDs supportés par le BYOK (10 LLM + Apify).
 * Doit rester en sync avec `apiKeyProviders` côté frontend
 * (`src/lib/schemas/api-key-schema.ts`).
 */
export type SupportedProvider =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'moonshot'
  | 'ollama'
  | 'apify'

/**
 * Mapping provider → variable d'environnement de fallback.
 * Lu uniquement quand l'utilisateur n'a pas configuré sa propre clé.
 *
 * Note : seuls `openrouter` et `apify` ont un fallback Maison historique.
 * Les autres providers nécessitent strictement une clé utilisateur.
 */
const ENV_FALLBACK: Record<string, string | undefined> = {
  openrouter: 'OPENROUTER_API_KEY',
  apify: 'APIFY_TOKEN',
}

/**
 * Résout la clé API d'un utilisateur pour un provider donné.
 *
 * Ordre de résolution :
 *   1. Lecture dans `user_api_keys` (clé en clair dans `encrypted_key`).
 *   2. Si `validation_status = 'invalid'` → on saute la clé et fallback env
 *      (avec log warning « api_key:fallback_to_env »).
 *   3. Sinon fallback `Deno.env.get(ENV_FALLBACK[provider])` si défini.
 *
 * Retourne `null` si aucune source ne fournit de clé.
 */
export async function getUserApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: SupportedProvider | string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('encrypted_key, validation_status')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (!error && data?.encrypted_key) {
    const status = (data as { encrypted_key: string; validation_status: string | null })
      .validation_status
    if (status === 'invalid') {
      // Clé enregistrée mais invalidée par un test récent → on logge et on
      // tente le fallback Maison sur les providers où c'est possible.
      try {
        await supabase.from('logs').insert({
          user_id: userId,
          action: 'api_key:fallback_to_env',
          status: 'warning',
          payload: { provider, reason: 'last_validation_status=invalid' },
        })
      } catch {
        // best-effort : un échec de log ne doit jamais bloquer une requête
      }
    } else {
      return (data as { encrypted_key: string }).encrypted_key
    }
  }

  // Fallback to env (Maison)
  const envVar = ENV_FALLBACK[provider]
  if (!envVar) return null
  return Deno.env.get(envVar) ?? null
}
