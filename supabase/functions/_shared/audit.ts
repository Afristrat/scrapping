// =============================================================================
// Wave 6 — S6-AuditLog
// Helper d'écriture dans la table audit_log depuis les edge functions.
// Best-effort : ne lève JAMAIS d'erreur (l'audit log ne doit pas bloquer
// une action métier). En cas d'échec d'insert, fallback sur la table `logs`.
// =============================================================================

import { formatError } from './errors.ts'

/**
 * Liste exhaustive des actions sensibles loggables.
 * Doit rester en sync avec l'ENUM `audit_action` (migration 20260502000005).
 */
export type AuditAction =
  // Settings & configuration
  | 'settings.update'
  // Rubriques de scoring
  | 'rubric.create'
  | 'rubric.update'
  | 'rubric.delete'
  // Admin prompts (cascade IA)
  | 'admin_prompt.create'
  | 'admin_prompt.update'
  | 'admin_prompt.delete'
  | 'admin_prompt.run'
  // Clés API (BYOK)
  | 'api_key.create'
  | 'api_key.update'
  | 'api_key.delete'
  // Gestion des membres
  | 'member.invite'
  | 'member.accept'
  | 'member.remove'
  | 'member.role_change'
  // Organization & billing
  | 'org.update'
  | 'org.billing_change'
  // Données / signaux
  | 'signal.delete'
  | 'signal.bulk_delete'
  // Exports
  | 'digest.export'
  | 'audit.export'
  // Pipeline
  | 'pipeline.run'
  | 'pipeline.purge'

export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditEntry {
  org_id: string
  user_id?: string | null
  action: AuditAction
  severity?: AuditSeverity
  entity_type?: string
  entity_id?: string
  description?: string
  diff?: { before?: unknown; after?: unknown }
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}

/**
 * Insère une entrée d'audit log. Best-effort : ne lève PAS d'erreur si
 * l'insert échoue (l'audit log ne doit jamais bloquer une action métier).
 * Logge l'erreur dans la table `logs` à la place.
 *
 * À utiliser depuis chaque edge fn qui déclenche une action sensible.
 *
 * @example
 * ```ts
 *   const { data: { user } } = await supabase.auth.getUser()
 *   await audit(supabase, {
 *     org_id: orgId,
 *     user_id: user?.id ?? null,
 *     action: 'rubric.delete',
 *     severity: 'warning',
 *     entity_type: 'rubric',
 *     entity_id: rubricId,
 *     description: `Suppression de la rubrique « ${rubricName} »`,
 *     diff: { before: rubricBefore, after: null },
 *     ...extractAuditContext(req),
 *   })
 * ```
 */
export async function audit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  entry: AuditEntry,
): Promise<void> {
  try {
    const payload = {
      org_id: entry.org_id,
      user_id: entry.user_id ?? null,
      action: entry.action,
      severity: entry.severity ?? 'info',
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      description: entry.description ?? null,
      diff: entry.diff ?? null,
      metadata: entry.metadata ?? null,
      ip_address: entry.ip_address ?? null,
      user_agent: entry.user_agent ?? null,
    }
    const { error } = await supabase.from('audit_log').insert(payload)
    if (error) {
      console.error('audit_log_insert_failed', formatError(error))
      // Best-effort fallback : laisser une trace dans logs pour investigation
      try {
        await supabase.from('logs').insert({
          action: 'audit:insert_failed',
          status: 'warning',
          payload: {
            reason: error.message ?? 'unknown',
            entry: { action: entry.action, org_id: entry.org_id },
          },
        })
      } catch (innerErr) {
        console.error('audit_log_fallback_logs_failed', formatError(innerErr))
      }
    }
  } catch (err) {
    // Garde-fou ultime : on ne propage jamais une erreur d'audit
    console.error('audit_log_thrown', formatError(err))
  }
}

/**
 * Extrait IP + user-agent d'une Request entrante pour les passer à `audit()`.
 *
 * IP : prend le premier hop de `x-forwarded-for` (chain de proxy CDN/Edge).
 * User-Agent : header standard.
 */
export function extractAuditContext(req: Request): {
  ip_address?: string
  user_agent?: string
} {
  const xff = req.headers.get('x-forwarded-for')
  const ip = xff?.split(',')[0]?.trim()
  const ua = req.headers.get('user-agent')
  return {
    ip_address: ip && ip.length > 0 ? ip : undefined,
    user_agent: ua ?? undefined,
  }
}
