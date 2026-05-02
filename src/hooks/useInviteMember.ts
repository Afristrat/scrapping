import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useOrgStore } from '@/stores/org'
import type { Database } from '@/types/database'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-InvitationFlow
// Mutation qui invoque l'edge fn `invite-member`. Affiche un toast avec le
// lien d'acceptation si l'email automatique n'a pas été envoyé (cas où
// SUPABASE_SERVICE_ROLE_KEY n'est pas configuré).
// =============================================================================

type OrgRole = Database['public']['Enums']['org_role']
export type InvitableRole = Exclude<OrgRole, 'owner'>

export interface InviteMemberInput {
  email: string
  role: InvitableRole
}

export interface InviteMemberResponse {
  ok: true
  invitation_id: string
  accept_url: string
  email_sent: boolean
  email_error: string | null
  expires_at: string
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation<InviteMemberResponse, Error, InviteMemberInput>({
    mutationFn: async ({ email, role }) => {
      const orgId = useOrgStore.getState().currentOrgId
      if (!orgId) throw new Error('no_org_selected')
      const { data, error } = await supabase.functions.invoke<InviteMemberResponse>(
        'invite-member',
        {
          body: { email, role, org_id: orgId },
        },
      )
      if (error) throw error
      if (!data) throw new Error('empty_response')
      return data
    },
    onSuccess: (data) => {
      if (data.email_sent) {
        toast.success('Invitation envoyée', {
          description: 'Le membre recevra un email pour rejoindre l’organisation.',
        })
      } else {
        // Lien à partager manuellement (Slack, email, etc.)
        toast.success('Invitation créée', {
          description: `Lien à partager : ${data.accept_url}`,
          duration: 12000,
        })
      }
      qc.invalidateQueries({ queryKey: ['invitations'] })
    },
    onError: (err) => {
      toast.error("Échec de l'invitation", { description: err.message.slice(0, 200) })
    },
  })
}
