import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// =============================================================================
// Wave 6 — S6-AuditLog
// Hook de lecture du journal d'audit pour la page /settings/audit.
//
// La table `audit_log` est créée par la migration 20260502000005 mais n'est
// pas encore typée dans `src/types/database.ts` (régénération nécessaire
// après `bunx supabase db push`). On utilise donc un cast minimal `any`
// (justifié par l'absence du type généré) au point d'entrée du builder
// `from()`. Le résultat est ensuite re-typé fortement vers `AuditLogEntry[]`.
// =============================================================================

export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditLogEntry {
  id: string
  org_id: string
  user_id: string | null
  action: string
  severity: AuditSeverity
  entity_type: string | null
  entity_id: string | null
  description: string | null
  diff: { before?: unknown; after?: unknown } | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface UseAuditLogParams {
  orgId: string | null
  action?: string
  severity?: AuditSeverity
  userId?: string
  fromDate?: string
  toDate?: string
  limit?: number
}

export function useAuditLog(params: UseAuditLogParams) {
  return useQuery<AuditLogEntry[]>({
    queryKey: ['audit_log', params],
    enabled: !!params.orgId,
    queryFn: async () => {
      if (!params.orgId) return []
      // Cast nécessaire : audit_log absent de Database tant que les types
      // ne sont pas régénérés post-migration (cf. CLAUDE.md piège connu).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = (supabase as unknown as { from: (t: string) => unknown }).from('audit_log')
      query = query
        .select('*')
        .eq('org_id', params.orgId)
        .order('created_at', { ascending: false })
        .limit(params.limit ?? 200)
      if (params.action) query = query.eq('action', params.action)
      if (params.severity) query = query.eq('severity', params.severity)
      if (params.userId) query = query.eq('user_id', params.userId)
      if (params.fromDate) query = query.gte('created_at', params.fromDate)
      if (params.toDate) query = query.lte('created_at', params.toDate)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as AuditLogEntry[]
    },
  })
}
