// _shared/internal-auth.ts
//
// Contrat d'auth service-to-service unique pour les edge fns Kairos (ADR 0009).
//
// Deux modes d'appel :
//   1. user     — JWT user via Bearer + supabase.auth.getUser() (appel client normal)
//   2. internal — orchestrateur K06 (research-from-seed) et hops internes, via :
//        - x-internal-secret: <INTERNAL_FN_SECRET>   (secret applicatif DÉDIÉ, jamais le service_role)
//        - x-proxy-user-id:  <uuid>                   (identité = public_api_keys.proxy_user_id)
//
// Invariant clé : `buildInternalHeaders` est le SEUL constructeur d'appel interne.
// Tout call-site interne DOIT l'utiliser — c'est ce qui rend le bug de propagation
// multi-hop (qui a cassé la branche C au 2e saut) structurellement impossible.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const INTERNAL_SECRET_HEADER = 'x-internal-secret'
export const PROXY_USER_HEADER = 'x-proxy-user-id'

export type CallerError =
  | 'missing_authorization'
  | 'invalid_token'
  | 'internal_missing_proxy_header'
  | 'internal_secret_misconfigured'

export type CallerResult =
  | { ok: true; mode: 'user'; userId: string }
  | { ok: true; mode: 'internal'; userId: string }
  | { ok: false; error: CallerError }

/** Comparaison à temps constant (anti timing-attack sur le secret interne). */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Résout l'identité du caller en dual-mode.
 *
 * Mode internal (présence de x-internal-secret) : le secret est comparé en
 * constant-time à INTERNAL_FN_SECRET ; x-proxy-user-id (UUID) devient le userId.
 * Le mode internal est prioritaire et n'appelle jamais getUser() (le Bearer est
 * un service_role, pas un JWT user).
 *
 * Mode user (absence de x-internal-secret) : getUser() classique.
 *
 * Le caller DOIT utiliser le `userId` retourné pour TOUTES ses queries
 * user-scoped, quel que soit le mode.
 */
export async function resolveCaller(supabase: SupabaseClient, req: Request): Promise<CallerResult> {
  const internalSecret = req.headers.get(INTERNAL_SECRET_HEADER)?.trim() ?? ''

  if (internalSecret) {
    const expected = Deno.env.get('INTERNAL_FN_SECRET')?.trim() ?? ''
    if (!expected) return { ok: false, error: 'internal_secret_misconfigured' }
    if (!constantTimeEquals(internalSecret, expected)) {
      return { ok: false, error: 'invalid_token' }
    }
    const proxyId = req.headers.get(PROXY_USER_HEADER)?.trim() ?? ''
    if (!proxyId || !isUuid(proxyId)) {
      return { ok: false, error: 'internal_missing_proxy_header' }
    }
    return { ok: true, mode: 'internal', userId: proxyId }
  }

  const auth = req.headers.get('Authorization')
  if (!auth) return { ok: false, error: 'missing_authorization' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'invalid_token' }
  return { ok: true, mode: 'user', userId: user.id }
}

/**
 * Construit les en-têtes d'un appel interne (le SEUL constructeur autorisé).
 *
 * - Authorization: Bearer <service_role> — uniquement pour passer le gateway
 *   (belt-and-suspenders ; les fns aval sont aussi déclarées verify_jwt=false).
 * - x-internal-secret — la vraie barrière applicative.
 * - x-proxy-user-id — l'identité propagée.
 *
 * Lève si `userId` n'est pas un UUID ou si les secrets d'env sont absents :
 * un appel interne mal configuré doit échouer bruyamment, jamais silencieusement.
 */
export function buildInternalHeaders(userId: string): Record<string, string> {
  if (!isUuid(userId)) {
    throw new Error('buildInternalHeaders: userId doit être un UUID')
  }
  const secret = Deno.env.get('INTERNAL_FN_SECRET')?.trim() ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? ''
  if (!secret) throw new Error('buildInternalHeaders: INTERNAL_FN_SECRET manquant')
  if (!serviceRole) {
    throw new Error('buildInternalHeaders: SUPABASE_SERVICE_ROLE_KEY manquant')
  }
  return {
    Authorization: `Bearer ${serviceRole}`,
    [INTERNAL_SECRET_HEADER]: secret,
    [PROXY_USER_HEADER]: userId,
    'Content-Type': 'application/json',
  }
}

/**
 * Premier org rejoint par l'utilisateur (même sémantique que le DEFAULT SQL
 * user_default_org_id()). INDISPENSABLE en mode internal : le DEFAULT repose
 * sur auth.uid(), nul en service_role → toute écriture org-scoped doit poser
 * org_id explicitement.
 */
export async function resolveOrgId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data as { org_id: string }).org_id
}

/**
 * Client Supabase service_role pour les queries en mode internal (bypass RLS —
 * on lit les settings/user_api_keys du proxy user). Recréé depuis env, jamais
 * dérivé du header entrant (indépendance vis-à-vis du gateway).
 */
export function internalServiceClient(
  createClient: (url: string, key: string) => SupabaseClient,
): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !key) {
    throw new Error('internalServiceClient: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants')
  }
  return createClient(url, key)
}
