import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Mutation qui supprime une invitation pending. Les RLS `inv_delete`
// imposent déjà que seul un owner/admin de l'org puisse supprimer.
// =============================================================================

export function useRevokeInvitation() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Invitation révoquée')
      qc.invalidateQueries({ queryKey: ['invitations'] })
    },
    onError: (err) => {
      toast.error('Échec de la révocation', { description: err.message.slice(0, 200) })
    },
  })
}
