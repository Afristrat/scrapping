import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Supabase Realtime changes on `signals` + `scores` tables.
 * On any INSERT/UPDATE/DELETE, invalidates the `signals` query cache so the
 * dashboard refreshes live without manual reload.
 *
 * Requires : tables added to `supabase_realtime` publication (migration 11).
 */
export function useRealtimeSignals() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-live')
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
  }, [qc])
}
