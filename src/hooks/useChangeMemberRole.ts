import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useOrgStore } from '@/stores/org'
import type { Database } from '@/types/database'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Mutation qui invoque l'edge fn `remove-member` (action=change_role).
// Seul un owner peut promouvoir vers owner ; un admin ne peut pas modifier
// un owner — le contrôle est appliqué côté edge fn.
// =============================================================================

type OrgRole = Database['public']['Enums']['org_role']

interface ChangeRoleInput {
  user_id: string
  new_role: OrgRole
}

interface ChangeRoleResponse {
  ok: true
  role: OrgRole
  unchanged?: boolean
}

export function useChangeMemberRole() {
  const qc = useQueryClient()
  return useMutation<ChangeRoleResponse, Error, ChangeRoleInput>({
    mutationFn: async ({ user_id, new_role }) => {
      const orgId = useOrgStore.getState().currentOrgId
      if (!orgId) throw new Error('no_org_selected')
      const { data, error } = await supabase.functions.invoke<ChangeRoleResponse>('remove-member', {
        body: { org_id: orgId, user_id, action: 'change_role', new_role },
      })
      if (error) throw error
      if (!data) throw new Error('empty_response')
      return data
    },
    onSuccess: (data) => {
      if (data.unchanged) return
      toast.success('Rôle mis à jour')
      qc.invalidateQueries({ queryKey: ['team_members'] })
    },
    onError: (err) => {
      toast.error('Échec du changement de rôle', { description: err.message.slice(0, 200) })
    },
  })
}
