import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Database } from '@/types/database'

type OrgRole = Database['public']['Enums']['org_role']
type OrgSegment = Database['public']['Enums']['org_segment']
type OrgPlan = Database['public']['Enums']['org_plan']
type BillingMode = Database['public']['Enums']['billing_mode']

/**
 * Représentation aplatie d'une organisation à laquelle l'utilisateur courant
 * appartient. Le `role` est joint depuis `organization_members`.
 */
export interface Organization {
  id: string
  name: string
  slug: string
  segment: OrgSegment
  plan: OrgPlan
  billing_mode: BillingMode
  role: OrgRole
}

interface OrgState {
  currentOrgId: string | null
  organizations: Organization[]
  isLoading: boolean
  setCurrentOrgId: (id: string) => void
  setOrganizations: (orgs: Organization[]) => void
  setLoading: (loading: boolean) => void
  reset: () => void
  /**
   * Helper non réactif (lit depuis `get()`). Pour un accès réactif dans un
   * composant, sélectionner directement `currentOrgId` + `organizations`.
   */
  currentOrg: () => Organization | null
}

/**
 * Store Zustand multi-tenant qui tient l'org courante et la liste des orgs
 * de l'utilisateur. Persist `currentOrgId` uniquement (la liste est refetch
 * par `useOrganizations` au démarrage pour éviter les données stale).
 */
export const useOrgStore = create<OrgState>()(
  persist(
    (set, get) => ({
      currentOrgId: null,
      organizations: [],
      isLoading: false,
      setCurrentOrgId: (id) => set({ currentOrgId: id }),
      setOrganizations: (orgs) =>
        set((s) => ({
          organizations: orgs,
          // Auto-pick first org if none selected, or if current selection
          // is no longer valid (user removed from that org, etc.).
          currentOrgId:
            s.currentOrgId && orgs.find((o) => o.id === s.currentOrgId)
              ? s.currentOrgId
              : (orgs[0]?.id ?? null),
        })),
      setLoading: (isLoading) => set({ isLoading }),
      reset: () => set({ currentOrgId: null, organizations: [], isLoading: false }),
      currentOrg: () => {
        const s = get()
        return s.organizations.find((o) => o.id === s.currentOrgId) ?? null
      },
    }),
    {
      name: 'kairos-org',
      partialize: (s) => ({ currentOrgId: s.currentOrgId }),
      // Bump à chaque fois qu'on veut invalider tous les localStorage `kairos-org`
      // existants (ex. après une migration de schéma multi-tenant). Zustand
      // ignore alors le payload persisté et ré-init `currentOrgId = null`
      // → le bootstrap `useOrganizations` re-pick la 1re org propre.
      version: 2,
    },
  ),
)
