import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'

// =============================================================================
// Wave 10C — Story S-10C.6 — Hook monitoring queue d'enrichissement
//
// Expose :
//   useQueueStats()     — stats par pass_kind (pending/in_progress/completed/failed)
//   useFailedJobs()     — 50 derniers jobs failed
//   useRetryJob()       — mutation : remet un job en pending
//   useRetryAllFailed() — mutation bulk : remet tous les failed en pending
// =============================================================================

export type PendingEnrichment = Database['public']['Tables']['pending_enrichments']['Row']

export type PassKind = 'entities' | 'reputation' | 'clustering' | 'neo4j_push'

export interface PassStats {
  pending: number
  in_progress: number
  completed: number
  failed: number
}

export type QueueStats = Record<PassKind, PassStats>

const ALL_PASS_KINDS: PassKind[] = ['entities', 'reputation', 'clustering', 'neo4j_push']

const QUEUE_KEYS = {
  stats: ['queue', 'stats'] as const,
  failed: ['queue', 'failed'] as const,
}

// ---------------------------------------------------------------------------
// useQueueStats
// ---------------------------------------------------------------------------

export function useQueueStats() {
  const orgId = useCurrentOrgId()
  return useQuery<QueueStats, Error>({
    queryKey: [...QUEUE_KEYS.stats, orgId],
    enabled: !!orgId,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_enrichments')
        .select('pass_kind, status')
        .eq('org_id', orgId ?? '')
        .neq('status', 'completed')
        .limit(2000)

      if (error) throw new Error(error.message)

      const stats: QueueStats = {} as QueueStats
      for (const kind of ALL_PASS_KINDS) {
        stats[kind] = { pending: 0, in_progress: 0, completed: 0, failed: 0 }
      }

      for (const row of data ?? []) {
        const kind = row.pass_kind as PassKind
        if (!stats[kind]) {
          stats[kind] = { pending: 0, in_progress: 0, completed: 0, failed: 0 }
        }
        const status = row.status as keyof PassStats
        if (status in stats[kind]) {
          stats[kind][status] += 1
        }
      }

      return stats
    },
  })
}

// ---------------------------------------------------------------------------
// useFailedJobs
// ---------------------------------------------------------------------------

export function useFailedJobs() {
  const orgId = useCurrentOrgId()
  return useQuery<PendingEnrichment[], Error>({
    queryKey: [...QUEUE_KEYS.failed, orgId],
    enabled: !!orgId,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_enrichments')
        .select('*')
        .eq('org_id', orgId ?? '')
        .eq('status', 'failed')
        .order('scheduled_at', { ascending: false })
        .limit(50)

      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

// ---------------------------------------------------------------------------
// useRetryJob — remet un job spécifique en pending
// ---------------------------------------------------------------------------

export function useRetryJob() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pending_enrichments')
        .update({ status: 'pending', attempts: 0, last_error: null })
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.stats })
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.failed })
    },
  })
}

// ---------------------------------------------------------------------------
// useRetryAllFailed — remet tous les jobs failed en pending (bulk)
// ---------------------------------------------------------------------------

export function useRetryAllFailed() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { error } = await supabase
        .from('pending_enrichments')
        .update({ status: 'pending', attempts: 0, last_error: null })
        .eq('status', 'failed')

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.stats })
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.failed })
    },
  })
}
