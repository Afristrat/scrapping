import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useOrgStore, type Organization } from '@/stores/org'
import type { Database } from '@/types/database'

type OrgRole = Database['public']['Enums']['org_role']
type OrgSegment = Database['public']['Enums']['org_segment']
type OrgPlan = Database['public']['Enums']['org_plan']
type BillingMode = Database['public']['Enums']['billing_mode']

interface MembershipRow {
  role: OrgRole
  organizations: {
    id: string
    name: string
    slug: string
    segment: OrgSegment
    plan: OrgPlan
    billing_mode: BillingMode
  } | null
}

/**
 * Fetches the organizations the current user belongs to (via
 * `organization_members`) and syncs them into `useOrgStore`. Auto-selects
 * the first org if none was previously persisted.
 *
 * Should be called once at the root of any auth-protected layout (cf.
 * `AppLayout`) so the rest of the data hooks can rely on a populated
 * `currentOrgId` before issuing queries.
 */
export function useOrganizations() {
  const session = useAuthStore((s) => s.session)
  const setOrganizations = useOrgStore((s) => s.setOrganizations)
  const setLoading = useOrgStore((s) => s.setLoading)

  return useQuery<Organization[]>({
    queryKey: ['organizations', session?.user?.id ?? null],
    enabled: !!session?.user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('organization_members')
          .select(
            `
            role,
            organizations:organizations!inner ( id, name, slug, segment, plan, billing_mode )
          `,
          )
          .eq('user_id', session?.user.id ?? '')

        if (error) throw error

        const rows = (data ?? []) as unknown as MembershipRow[]
        const orgs: Organization[] = rows
          .filter(
            (
              m,
            ): m is MembershipRow & {
              organizations: NonNullable<MembershipRow['organizations']>
            } => m.organizations !== null,
          )
          .map((m) => ({
            id: m.organizations.id,
            name: m.organizations.name,
            slug: m.organizations.slug,
            segment: m.organizations.segment,
            plan: m.organizations.plan,
            billing_mode: m.organizations.billing_mode,
            role: m.role,
          }))

        setOrganizations(orgs)
        return orgs
      } finally {
        setLoading(false)
      }
    },
  })
}
