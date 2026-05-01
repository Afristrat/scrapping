import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { LLMProviderId } from '@/lib/providers'

export interface ProviderModel {
  user_id: string
  provider: LLMProviderId
  model_id: string
  display_name: string | null
  context_window: number | null
  pricing_input_per_1m: number | null
  pricing_output_per_1m: number | null
  capabilities: string[]
  fetched_at: string
}

export function useProviderModels() {
  return useQuery<ProviderModel[]>({
    queryKey: ['provider_models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('provider_models')
        .select('*')
        .order('provider')
        .order('model_id')
      if (error) throw error
      return (data ?? []) as unknown as ProviderModel[]
    },
  })
}

export function useRefreshModels() {
  const qc = useQueryClient()
  return useMutation<{ count: number }, Error, { provider: LLMProviderId; baseUrl?: string }>({
    mutationFn: async ({ provider, baseUrl }) => {
      const { data, error } = await supabase.functions.invoke('refresh-models', {
        body: { provider, base_url: baseUrl },
      })
      if (error) throw new Error(error.message)
      const payload = data as { ok?: boolean; count?: number; error?: string; detail?: string }
      if (!payload.ok && payload.error) {
        throw new Error(`${payload.error}${payload.detail ? `: ${payload.detail}` : ''}`)
      }
      return { count: payload.count ?? 0 }
    },
    onSuccess: (data, vars) => {
      toast.success(`${vars.provider} : ${data.count} modèles rafraîchis`)
      qc.invalidateQueries({ queryKey: ['provider_models'] })
      qc.invalidateQueries({ queryKey: ['api_keys'] })
    },
    onError: (err, vars) =>
      toast.error(`Refresh ${vars.provider} échoué`, {
        description: err.message.slice(0, 300),
      }),
  })
}
