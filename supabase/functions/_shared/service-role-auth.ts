// _shared/service-role-auth.ts
//
// Auth dual-mode pour les edge fns Kairos qui peuvent être appelées :
//   1. Par un user normal (JWT user via Bearer + auth.getUser()) — mode legacy
//   2. Par l'orchestrateur interne research-from-seed avec :
//      - Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//      - x-proxy-user-id: <uuid du proxy user désigné côté public_api_keys>
//
// Le service_role key NE TRANSITE JAMAIS par un client externe — il est
// résolu depuis env côté K06 (research-from-seed) qui est l'unique caller
// public exposé. Le proxy_user_id authoritatif vient de
// public_api_keys.proxy_user_id (mapping géré par admin Kairos, pas par
// le client Bassira). Donc même si un attaquant connaissait le nom du
// header, il ne peut pas le falsifier sans connaître le service_role.
//
// Sécurité : comparaison constant-time du service_role.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type AuthMode =
  | { ok: true; mode: 'user'; userId: string }
  | { ok: true; mode: 'internal'; userId: string }
  | {
      ok: false
      error: 'missing_authorization' | 'invalid_token' | 'internal_missing_proxy_header'
    }

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Résout le user_id du caller en dual-mode :
 *   - Si Bearer == SUPABASE_SERVICE_ROLE_KEY → mode 'internal' avec
 *     userId = x-proxy-user-id (requis, UUID valide).
 *   - Sinon → mode 'user' avec userId = supabase.auth.getUser().id
 *
 * Le caller doit utiliser le user_id retourné pour TOUTES ses queries
 * user-scoped (logs, settings lookups, etc.) — peu importe le mode.
 */
export async function resolveAuthOrProxy(
  supabase: SupabaseClient,
  req: Request,
): Promise<AuthMode> {
  const auth = req.headers.get('Authorization')
  if (!auth) return { ok: false, error: 'missing_authorization' }

  // Strict Bearer parse — "Bearer" seul (sans token) ou "Bearer  " sont
  // traités comme missing_authorization, pas comme invalid_token.
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (!match) return { ok: false, error: 'missing_authorization' }
  const token = match[1].trim()
  if (!token) return { ok: false, error: 'missing_authorization' }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && constantTimeEquals(token, serviceRoleKey)) {
    // Internal orchestrator call. Le header x-proxy-user-id est OBLIGATOIRE
    // pour éviter qu'un caller interne ne fasse de queries sans identité.
    const proxyId = req.headers.get('x-proxy-user-id')?.trim() ?? ''
    if (!proxyId || !isUuid(proxyId)) {
      return { ok: false, error: 'internal_missing_proxy_header' }
    }
    return { ok: true, mode: 'internal', userId: proxyId }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'invalid_token' }
  return { ok: true, mode: 'user', userId: user.id }
}
