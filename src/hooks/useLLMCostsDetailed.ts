import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CostRow } from '@/hooks/useLLMCosts'

export function useLLMCostsDetailed(limit = 200) {
  return useQuery<CostRow[]>({
    queryKey: ['llm_costs', 'detailed', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('llm_costs')
        .select('task, model, prompt_tokens, completion_tokens, cost, ts')
        .order('ts', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as CostRow[]
    },
    refetchInterval: 30_000,
  })
}
