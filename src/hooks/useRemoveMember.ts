import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useOrgStore } from '@/stores/org'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Mutation qui invoque l'edge fn `remove-member` pour retirer un membre.
// La fn vérifie qu'on ne retire pas le dernier owner et qu'un admin ne peut
// pas toucher un owner.
// =============================================================================

interface RemoveMemberInput {
  user_id: string
}

interface RemoveMemberResponse {
  ok: true
  removed: true
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation<RemoveMemberResponse, Error, RemoveMemberInput>({
    mutationFn: async ({ user_id }) => {
      const orgId = useOrgStore.getState().currentOrgId
      if (!orgId) throw new Error('no_org_selected')
      const { data, error } = await supabase.functions.invoke<RemoveMemberResponse>(
        'remove-member',
        {
          body: { org_id: orgId, user_id, action: 'remove' },
        },
      )
      if (error) throw error
      if (!data) throw new Error('empty_response')
      return data
    },
    onSuccess: () => {
      toast.success('Membre retiré')
      qc.invalidateQueries({ queryKey: ['team_members'] })
    },
    onError: (err) => {
      toast.error('Échec du retrait', { description: err.message.slice(0, 200) })
    },
  })
}
