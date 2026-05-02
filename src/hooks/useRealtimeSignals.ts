import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

/**
 * Subscribes to Supabase Realtime changes on `signals` + `scores` tables.
 * On any INSERT/UPDATE/DELETE, invalidates the `signals` query cache so the
 * dashboard refreshes live without manual reload.
 *
 * Requires : tables added to `supabase_realtime` publication (migration 11).
 *
 * Note : the channel is keyed by orgId so each org-switch tears down the
 * previous channel and creates a fresh one (avoids cross-tenant leaks if
 * the user is a member of several orgs).
 */
export function useRealtimeSignals() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()

  useEffect(() => {
    if (!orgId) return
    const channel = supabase
      .channel(`dashboard-live:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => {
        qc.invalidateQueries({ queryKey: ['signals'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        qc.invalidateQueries({ queryKey: ['signals'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc, orgId])
}
