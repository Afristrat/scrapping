import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Hook qui liste les membres de l'org courante avec leur email. Lit la vue
// `public.organization_members_view` (migration 20260502000007) qui joint
// auth.users — gated par les RLS de organization_members sous-jacente.
//
// La vue n'est pas encore typée dans `src/types/database.ts` (régénération
// nécessaire après `bunx supabase db push`). On utilise donc un cast minimal
// au point d'entrée du builder, le résultat étant ensuite re-typé fortement.
// =============================================================================

type OrgRole = Database['public']['Enums']['org_role']

export interface TeamMember {
  org_id: string
  user_id: string
  role: OrgRole
  joined_at: string
  email: string | null
}

export function useTeamMembers() {
  const orgId = useCurrentOrgId()
  return useQuery<TeamMember[]>({
    queryKey: ['team_members', orgId],
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!orgId) return []
      // Cast nécessaire : `organization_members_view` n'est pas dans
      // `Database` tant que les types ne sont pas régénérés post-migration
      // (cf. CLAUDE.md piège connu).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as { from: (t: string) => any }
      const { data, error } = await client
        .from('organization_members_view')
        .select('org_id, user_id, role, joined_at, email')
        .eq('org_id', orgId)
        .order('joined_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TeamMember[]
    },
  })
}
