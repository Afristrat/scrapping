// _shared/sign-user-jwt.ts
//
// Signe un JWT user HS256 valide pour le projet Supabase courant.
// Utilisé par research-from-seed pour orchestrer les appels internes
// (research-strategist, rubric-architect, etc.) au nom d'un proxy_user_id
// désigné côté public_api_keys.
//
// Pourquoi : les fns Phase 1 + dispatch-llm appellent supabase.auth.getUser()
// qui rejette le service_role key. Pour un appel orchestré "public" Bassira→Kairos,
// on doit forger un JWT user valide pour le tenant proxy.
//
// Sécurité :
// - JWT TTL 120s max (durée pipeline complet ~75s + marge)
// - Secret SUPABASE_JWT_SECRET à poser via `npx supabase secrets set`
// - Si projet ECC P-256 (Supabase 2026 nouveaux projets), cette helper ne marche pas —
//   il faudra adapter avec la clé privée ECC.

const HS256_HEADER = JSON.stringify({ alg: 'HS256', typ: 'JWT' })

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface SignUserJwtOptions {
  userId: string
  email: string
  jwtSecret: string
  ttlSeconds?: number
  // iss claim — Supabase auth issuer URL. Default omitted (most consumers don't enforce).
  issuer?: string
  // role claim — usually 'authenticated' for regular users.
  role?: 'authenticated' | 'anon' | 'service_role'
}

export async function signUserJwt(opts: SignUserJwtOptions): Promise<string> {
  const ttl = Math.min(Math.max(opts.ttlSeconds ?? 120, 30), 600) // clamp 30s-10min
  const now = Math.floor(Date.now() / 1000)

  const payload: Record<string, unknown> = {
    sub: opts.userId,
    email: opts.email,
    role: opts.role ?? 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + ttl,
  }
  if (opts.issuer) payload.iss = opts.issuer

  const headerB64 = base64UrlEncode(HS256_HEADER)
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(opts.jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const signatureB64 = base64UrlEncode(new Uint8Array(signature))

  return `${signingInput}.${signatureB64}`
}

// Helper exporté pour tests : décoder le payload sans vérifier la signature.
// PROD doit toujours vérifier via supabase.auth.getUser() qui valide la sig.
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')
  if (parts.length !== 3) throw new Error('invalid_jwt_structure')
  const padded = parts[1].padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=')
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(b64))
}
