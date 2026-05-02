import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Liste les invitations de l'org courante (pending / acceptées / expirées).
// Le statut est dérivé côté client à partir de accepted_at + expires_at.
// =============================================================================

type OrgRole = Database['public']['Enums']['org_role']
type InvitationsRow = Database['public']['Tables']['invitations']['Row']

export type InvitationStatus = 'pending' | 'accepted' | 'expired'

export interface InvitationView {
  id: string
  org_id: string
  email: string
  role: OrgRole
  token: string
  expires_at: string
  accepted_at: string | null
  invited_by: string | null
  created_at: string
  status: InvitationStatus
  expires_in_days: number | null
}

function deriveStatus(row: InvitationsRow): InvitationStatus {
  if (row.accepted_at) return 'accepted'
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired'
  return 'pending'
}

function diffInDays(target: string): number {
  const ms = new Date(target).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function useInvitations() {
  const orgId = useCurrentOrgId()
  return useQuery<InvitationView[]>({
    queryKey: ['invitations', orgId],
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('invitations')
        .select('id, org_id, email, role, token, expires_at, accepted_at, invited_by, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as InvitationsRow[]
      return rows.map((row) => ({
        ...row,
        status: deriveStatus(row),
        expires_in_days: row.accepted_at ? null : diffInDays(row.expires_at),
      }))
    },
  })
}
