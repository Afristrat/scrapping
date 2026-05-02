import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LLMProviderUI } from '@/lib/providers'

export function useLLMProviders() {
  return useQuery<LLMProviderUI[]>({
    queryKey: ['llm_providers'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('llm_providers')
        .select('id, label, default_base_url, base_url_overridable, hint, display_order')
        .eq('enabled', true)
        .order('display_order')
      if (error) throw error
      return (data ?? []).map((r: { id: string; label: string; default_base_url: string; base_url_overridable: boolean; hint: string | null }) => ({
        id: r.id,
        label: r.label,
        defaultBaseURL: r.default_base_url,
        baseURLOverridable: r.base_url_overridable,
        hint: r.hint,
      }))
    },
  })
}
