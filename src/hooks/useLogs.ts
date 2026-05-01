import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface LogRow {
  id: number
  user_id: string | null
  action: string
  payload: Record<string, unknown> | null
  status: string | null
  ts: string
}

export function useLogs() {
  return useQuery<LogRow[]>({
    queryKey: ['logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .order('ts', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as LogRow[]
    },
    refetchInterval: 30_000,
  })
}
