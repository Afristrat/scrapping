import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

export interface TokensSummaryRow {
  day: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_cost: number
  calls: number
}

export function useTokensSummary(days = 7) {
  const orgId = useCurrentOrgId()
  return useQuery<TokensSummaryRow[]>({
    queryKey: ['tokens_summary', orgId, days],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tokens_summary', { days })
      if (error) throw error
      return (data ?? []) as TokensSummaryRow[]
    },
  })
}
