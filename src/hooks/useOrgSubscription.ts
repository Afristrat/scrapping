import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Récupère l'abonnement actif de l'org courante (pour afficher seats).
// Best-effort : si pas d'abonnement (org en trial ou plan 'solo' gratuit),
// on retourne null et la page TeamSettings affiche un fallback.
// =============================================================================

type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row']

export function useOrgSubscription() {
  const orgId = useCurrentOrgId()
  return useQuery<SubscriptionRow | null>({
    queryKey: ['org_subscription', orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!orgId) return null
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ?? null
    },
  })
}
