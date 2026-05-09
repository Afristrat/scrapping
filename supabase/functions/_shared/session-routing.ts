/**
 * session-routing.ts — Helpers partagés pour le mode `target_table` des
 * scrapers (Kairos K03).
 *
 * Permet aux 4 scrapers (x, reddit, arxiv, rss) d'accepter un body avec :
 *   {
 *     target_table?: 'signals' | 'signals_session',
 *     session_id?: string,         // requis si target_table = 'signals_session'
 *     created_by_api_key?: string, // optionnel, traçabilité multi-tenant
 *     ttl_hours?: number,          // optionnel, default 1
 *     ...rest                      // params spécifiques au scraper
 *   }
 *
 * Comportement :
 *   - target_table absent ou 'signals' → mode legacy (rétrocompat user-scoped).
 *   - target_table === 'signals_session' → mode session, validation stricte
 *     du session_id (UUID), insert sans user_id, skip scoring trigger.
 *
 * Toutes les fonctions exportées ici sont pures (aucun appel Supabase) pour
 * être testables sans booter Deno.serve.
 */

export type TargetTable = 'signals' | 'signals_session'

export interface SessionRoutingConfig {
  targetTable: TargetTable
  sessionId: string | null
  createdByApiKey: string | null
  ttlHours: number
}

export type SessionRoutingResult =
  | { ok: true; config: SessionRoutingConfig }
  | { ok: false; error: string; detail?: string; status: number }

/**
 * Regex UUID v4 large (accepte aussi v1/v3/v5 — on vérifie la forme, pas la
 * version, car les UUIDs côté Bassira peuvent ne pas être strictement v4).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MAX_TTL_HOURS = 24
const MIN_TTL_HOURS = 1
const DEFAULT_TTL_HOURS = 1

/**
 * Parse et valide les champs de routage du body request.
 *
 * - Si target_table absent ou 'signals' : retourne mode legacy (sessionId null).
 * - Si target_table === 'signals_session' :
 *   * session_id REQUIS (UUID valide, pas de fallback silencieux).
 *   * ttl_hours optionnel, clamp [1, 24], default 1.
 *   * created_by_api_key optionnel, string non-vide.
 *
 * @param body Object JSON parsé du request body (peut être vide).
 */
export function parseSessionRouting(body: unknown): SessionRoutingResult {
  if (body === null || typeof body !== 'object') {
    // body vide ou non-object → mode legacy par défaut
    return {
      ok: true,
      config: {
        targetTable: 'signals',
        sessionId: null,
        createdByApiKey: null,
        ttlHours: DEFAULT_TTL_HOURS,
      },
    }
  }

  const b = body as Record<string, unknown>
  const rawTarget = b.target_table

  // Mode legacy : target_table absent ou explicit 'signals'
  if (rawTarget === undefined || rawTarget === null || rawTarget === 'signals') {
    return {
      ok: true,
      config: {
        targetTable: 'signals',
        sessionId: null,
        createdByApiKey: null,
        ttlHours: DEFAULT_TTL_HOURS,
      },
    }
  }

  if (rawTarget !== 'signals_session') {
    return {
      ok: false,
      error: 'invalid_target_table',
      detail: `target_table must be 'signals' or 'signals_session', got: ${String(rawTarget)}`,
      status: 400,
    }
  }

  // Mode session : validation stricte
  const rawSessionId = b.session_id
  if (typeof rawSessionId !== 'string' || rawSessionId.trim() === '') {
    return {
      ok: false,
      error: 'session_id_required',
      detail: 'target_table=signals_session requires a non-empty session_id (UUID)',
      status: 400,
    }
  }

  const sessionId = rawSessionId.trim()
  if (!UUID_RE.test(sessionId)) {
    return {
      ok: false,
      error: 'session_id_invalid',
      detail: `session_id must be a valid UUID, got: ${sessionId.slice(0, 80)}`,
      status: 400,
    }
  }

  // ttl_hours optionnel, clamp défensif
  let ttlHours = DEFAULT_TTL_HOURS
  if (b.ttl_hours !== undefined) {
    const raw = b.ttl_hours
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
      return {
        ok: false,
        error: 'ttl_hours_invalid',
        detail: 'ttl_hours must be a positive finite number',
        status: 400,
      }
    }
    ttlHours = Math.min(MAX_TTL_HOURS, Math.max(MIN_TTL_HOURS, Math.floor(raw)))
  }

  // created_by_api_key optionnel
  let createdByApiKey: string | null = null
  if (b.created_by_api_key !== undefined && b.created_by_api_key !== null) {
    if (typeof b.created_by_api_key !== 'string' || b.created_by_api_key.trim() === '') {
      return {
        ok: false,
        error: 'created_by_api_key_invalid',
        detail: 'created_by_api_key must be a non-empty string when provided',
        status: 400,
      }
    }
    createdByApiKey = b.created_by_api_key.trim()
  }

  return {
    ok: true,
    config: {
      targetTable: 'signals_session',
      sessionId,
      createdByApiKey,
      ttlHours,
    },
  }
}

/** Indique si la config impose le mode session. */
export function isSessionMode(config: SessionRoutingConfig): boolean {
  return config.targetTable === 'signals_session' && config.sessionId !== null
}

/**
 * Source acceptée par signals_session.source (CHECK contrainte SQL).
 * Doit matcher la migration 20260508000001_signals_session.sql.
 */
export type SignalSessionSource = 'x' | 'reddit' | 'arxiv' | 'rss' | 'web'

/** Champs minimaux extraits d'un signal scrapé pour buildSessionRow. */
export interface ScrapedItemForSession {
  source: SignalSessionSource
  external_id?: string | null
  url?: string | null
  title?: string | null
  raw_payload?: unknown
}

/** Row prête à être insérée dans signals_session. */
export interface SignalsSessionRow {
  session_id: string
  source: SignalSessionSource
  external_id: string | null
  url: string | null
  title: string | null
  raw_payload: unknown
  expires_at: string
  created_by_api_key: string | null
}

/**
 * Construit une row signals_session à partir d'un item scrapé.
 *
 * Calcule expires_at = nowMs + ttlHours * 3600 * 1000 et émet ISO string.
 *
 * @param item       Données du signal scrapé.
 * @param config     Config de routage (issue de parseSessionRouting).
 * @param nowMs      Timestamp ms de référence (injectable pour tests).
 */
export function buildSessionRow(
  item: ScrapedItemForSession,
  config: SessionRoutingConfig,
  nowMs: number = Date.now(),
): SignalsSessionRow {
  if (config.sessionId === null) {
    throw new Error('buildSessionRow appelé sans sessionId — utilisez isSessionMode() avant')
  }
  const expiresAtMs = nowMs + config.ttlHours * 3600 * 1000
  return {
    session_id: config.sessionId,
    source: item.source,
    external_id: item.external_id ?? null,
    url: item.url ?? null,
    title: item.title ?? null,
    raw_payload: item.raw_payload ?? null,
    expires_at: new Date(expiresAtMs).toISOString(),
    created_by_api_key: config.createdByApiKey,
  }
}
