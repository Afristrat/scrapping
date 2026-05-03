import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

/**
 * Mutation pour mettre à jour `settings.consensus_models`.
 * Effectue un UPDATE ciblé sur (user_id, org_id) pour ne pas écraser
 * les autres colonnes du paramétrage.
 */
export function useUpdateConsensusModels() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()

  return useMutation<void, Error, string[]>({
    mutationFn: async (models) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const { error } = await supabase
        .from('settings')
        .update({ consensus_models: models })
        .eq('user_id', userId)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Modèles consensus sauvegardés')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) =>
      toast.error('Échec sauvegarde consensus', { description: err.message.slice(0, 200) }),
  })
}
