import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { CostRow } from '@/hooks/useLLMCosts'

export function useLLMCostsDetailed(limit = 200) {
  const orgId = useCurrentOrgId()
  return useQuery<CostRow[]>({
    queryKey: ['llm_costs', 'detailed', orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('llm_costs')
        .select('task, model, prompt_tokens, completion_tokens, cost, ts')
        .eq('org_id', orgId ?? '')
        .order('ts', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as CostRow[]
    },
    refetchInterval: 30_000,
  })
}
