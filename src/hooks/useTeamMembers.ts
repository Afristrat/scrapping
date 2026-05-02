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
      // On utilise le RPC `list_org_members(p_org_id)` SECURITY DEFINER
      // (migration 20260502000015_fix_orgm_recursion.sql) plutôt que la vue
      // `organization_members_view` qui plante en 403 — celle-ci joint
      // auth.users en mode security_invoker mais authenticated n'a pas
      // SELECT sur auth.users (et c'est sain : sinon on exposerait tous les
      // emails). Le RPC fait le JOIN avec les droits du définisseur tout en
      // gateant en interne (caller doit être membre de l'org demandée).
      const client = supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      }
      const { data, error } = await client.rpc('list_org_members', {
        p_org_id: orgId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as TeamMember[]
    },
  })
}
