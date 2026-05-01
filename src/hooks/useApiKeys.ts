import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { maskKey, type ApiKeyProvider, type UserApiKey } from '@/lib/schemas/api-key-schema'

export function useApiKeys() {
  return useQuery<UserApiKey[]>({
    queryKey: ['api_keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('id, user_id, provider, masked_key, created_at, updated_at')
        .order('provider')
      if (error) throw error
      return (data ?? []) as unknown as UserApiKey[]
    },
  })
}

export function useUpsertApiKey() {
  const qc = useQueryClient()
  return useMutation<void, Error, { provider: ApiKeyProvider; rawKey: string }>({
    mutationFn: async ({ provider, rawKey }) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const masked = maskKey(rawKey)
      const { error } = await supabase.from('user_api_keys').upsert(
        {
          user_id: userId,
          provider,
          encrypted_key: rawKey,
          masked_key: masked,
        },
        { onConflict: 'user_id,provider' },
      )
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      toast.success(`Cle ${vars.provider} sauvegardee`)
      qc.invalidateQueries({ queryKey: ['api_keys'] })
    },
    onError: (err) =>
      toast.error('Erreur sauvegarde cle', { description: err.message.slice(0, 200) }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('user_api_keys').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Cle supprimee')
      qc.invalidateQueries({ queryKey: ['api_keys'] })
    },
    onError: (err) => toast.error('Erreur suppression', { description: err.message.slice(0, 200) }),
  })
}
