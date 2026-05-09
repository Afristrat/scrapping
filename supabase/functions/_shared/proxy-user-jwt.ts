// _shared/proxy-user-jwt.ts
//
// Récupère un JWT user valide pour le proxy_user_id désigné côté
// public_api_keys, via signInWithPassword avec un password connu stocké
// en secret Edge Function (KAIROS_PROXY_USER_PASSWORD).
//
// Pourquoi cette voie (Option A bis) :
// Le projet Kairos est en mode JWT Signing Keys (ECC P-256, Supabase 2026)
// — `SUPABASE_JWKS` + `SUPABASE_PUBLISHABLE_KEYS` + `SUPABASE_SECRET_KEYS`
// présents, mais pas de `SUPABASE_JWT_SECRET` HS256 exposable. Donc on ne
// peut pas signer manuellement un JWT user. La voie supportée pour
// qu'un service_role obtienne un JWT user valide = signInWithPassword au
// nom du proxy user.
//
// Architecture testable : le cache + la résolution sont des helpers purs.
// La fn signIn (param injectable) est mockée en tests, prod utilise
// supabase-js signInWithPassword.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CACHE_TTL_MS = 50 * 60 * 1000 // 50 min (JWT défaut 1h, marge 10 min)

// Cache instance-level (module-scope dans Deno Edge runtime).
// Une instance Edge cold-boot relance le cache à 0 — pas un problème,
// signInWithPassword sera juste rappelé une fois.
interface CachedJwt {
  jwt: string
  expiresAt: number
}
const cache = new Map<string, CachedJwt>()

export interface SignInResult {
  jwt: string
}
export type SignInFn = (email: string, password: string) => Promise<SignInResult>

export interface GetProxyJwtResult {
  jwt: string
  cached: boolean
}

/**
 * Pure cache helper — testable en isolation.
 * Si présent et non expiré → retourne le cache.
 * Sinon appelle signInFn, met en cache, retourne.
 */
export async function getProxyUserJwt(
  email: string,
  password: string,
  signInFn: SignInFn,
  now: () => number = Date.now,
): Promise<GetProxyJwtResult> {
  const cached = cache.get(email)
  if (cached && cached.expiresAt > now()) {
    return { jwt: cached.jwt, cached: true }
  }

  const result = await signInFn(email, password)
  if (!result.jwt) {
    throw new Error('signin_returned_empty_jwt')
  }
  cache.set(email, {
    jwt: result.jwt,
    expiresAt: now() + CACHE_TTL_MS,
  })
  return { jwt: result.jwt, cached: false }
}

/**
 * Production signInFn : utilise un client Supabase séparé (anon key) pour
 * ne pas écraser le service_role client appelant.
 */
export function makeSupabaseSignInFn(supabaseUrl: string, anonKey: string): SignInFn {
  return async (email, password) => {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      throw new Error(`signInWithPassword_failed: ${error.message}`)
    }
    if (!data?.session?.access_token) {
      throw new Error('signInWithPassword_no_session_returned')
    }
    return { jwt: data.session.access_token }
  }
}

// =============================================================================
// Test helpers — exportés pour tests, ne pas utiliser en prod.
// =============================================================================

export function _clearProxyJwtCache(): void {
  cache.clear()
}

export function _setCachedJwt(email: string, jwt: string, expiresAt: number): void {
  cache.set(email, { jwt, expiresAt })
}

export function _getCacheSize(): number {
  return cache.size
}
