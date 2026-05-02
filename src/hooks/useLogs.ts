import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

export interface LogRow {
  id: number
  user_id: string | null
  action: string
  payload: Record<string, unknown> | null
  status: string | null
  ts: string
}

export function useLogs() {
  const orgId = useCurrentOrgId()
  return useQuery<LogRow[]>({
    queryKey: ['logs', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('org_id', orgId ?? '')
        .order('ts', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as LogRow[]
    },
    refetchInterval: 30_000,
  })
}
