import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// =============================================================================
// Wave 6 — Sub-wave 6.4 — Story S6-AdminCockpit
//
// Hook qui invoque l'edge function `admin-metrics` et retourne le panorama
// opérationnel cross-tenant pour la page /admin.
//
// L'edge fn refuse les non-admins (HTTP 403) — ce hook re-throw alors une
// erreur explicite que la page peut intercepter pour afficher un message
// « Accès réservé ».
//
// Refresh chaque minute pour conserver la vue MRR / outliers en quasi-live.
// =============================================================================

export type OrgSegment = 'vc_pe' | 'legal' | 'newsletter' | 'brand' | 'cto_sme' | 'solo'
export type OrgPlan = 'solo' | 'pro' | 'enterprise'
export type BillingMode = 'maison' | 'byok'

export interface TenantMetrics {
  org_id: string
  org_name: string
  segment: OrgSegment
  plan: OrgPlan
  billing_mode: BillingMode
  members: number
  signals_30d: number
  apify_cost_30d: number
  llm_cost_30d: number
  revenue_30d: number
  margin_30d: number
  margin_pct: number
  outlier_score: number
}

export type AlertType = 'outlier_consumption' | 'low_margin' | 'expired_invitation'

export interface AdminAlert {
  type: AlertType
  org_id: string
  msg: string
}

export interface AdminMetricsKpis {
  total_tenants: number
  total_active_subs: number
  mrr_by_segment: Record<OrgSegment, number>
  arr_projected: number
  total_cog_30d: number
  total_revenue_30d: number
  gross_margin_30d_pct: number
}

export interface AdminMetricsResponse {
  tenants: TenantMetrics[]
  kpis: AdminMetricsKpis
  alerts: AdminAlert[]
  generated_at: string
}

export class AdminMetricsForbiddenError extends Error {
  constructor() {
    super('forbidden')
    this.name = 'AdminMetricsForbiddenError'
  }
}

export function useAdminMetrics(): UseQueryResult<AdminMetricsResponse, Error> {
  return useQuery<AdminMetricsResponse, Error>({
    queryKey: ['admin_metrics'],
    refetchInterval: 60_000,
    retry: (failureCount, err) => {
      // 403 ne sera jamais récupérable, inutile de retry.
      if (err instanceof AdminMetricsForbiddenError) return false
      return failureCount < 2
    },
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<AdminMetricsResponse>(
        'admin-metrics',
        { body: {} },
      )
      if (error) {
        // Supabase functions client wrappe les statuts non-2xx dans error.
        const msg = error.message ?? ''
        if (/403|forbidden/i.test(msg)) throw new AdminMetricsForbiddenError()
        throw error
      }
      if (!data) throw new Error('empty_response')
      return data
    },
  })
}
