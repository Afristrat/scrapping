import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from './useCurrentOrgId'

// =============================================================================
// Wave 6 — S6-AuditLog
// Hook frontend pour logger une action sensible dans audit_log.
//
// Best-effort : si l'orgId n'est pas encore connu OU si l'insert échoue,
// on n'interrompt pas le flux métier (l'audit log ne doit JAMAIS bloquer
// une action utilisateur). On loggue dans la console pour investigation.
//
// Usage typique : après une mutation réussie côté frontend (delete signal,
// export digest, etc.), on appelle ce hook pour tracer l'action.
// =============================================================================

export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditActionInput {
  action: string
  severity?: AuditSeverity
  entity_type?: string
  entity_id?: string
  description?: string
  diff?: { before?: unknown; after?: unknown }
  metadata?: Record<string, unknown>
}

export function useAuditAction() {
  const orgId = useCurrentOrgId()
  return useMutation<void, Error, AuditActionInput>({
    mutationFn: async (input) => {
      if (!orgId) {
        // Pas d'org sélectionnée → on skip silencieusement (best-effort).
        // Cas légitime : startup de l'app, user pas encore affilié.
        return
      }
      const payload = {
        org_id: orgId,
        action: input.action,
        severity: input.severity ?? 'info',
        entity_type: input.entity_type ?? null,
        entity_id: input.entity_id ?? null,
        description: input.description ?? null,
        diff: input.diff ?? null,
        metadata: input.metadata ?? null,
      }
      // Cast nécessaire : audit_log absent de Database tant que les types
      // ne sont pas régénérés post-migration. Best-effort : on swallow l'erreur
      // pour ne pas bloquer l'action métier qui vient d'être effectuée.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as { from: (t: string) => any }
      const { error } = await client.from('audit_log').insert(payload)
      if (error) {
        // Loggué côté console pour debugging — pas de toast (silent fail).
        console.warn('audit_log_insert_failed', error)
      }
    },
  })
}
