import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Fetches a user's API key for a given provider from user_api_keys table.
 * Falls back to the corresponding Deno env var if no user key is stored.
 * Returns null only if neither source provides a key.
 */
export async function getUserApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: 'openrouter' | 'apify',
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (!error && data?.encrypted_key) {
    return data.encrypted_key
  }

  // Fallback to env
  const envMap: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    apify: 'APIFY_TOKEN',
  }
  return Deno.env.get(envMap[provider]) ?? null
}
