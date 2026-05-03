import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { ScoreConsensus, ScoreRunEntry } from '@/types/scoring'

/**
 * Calcule le niveau d'accord entre les modèles (agreement) à partir de la variance.
 * - variance < 10   → high
 * - variance 10-25  → medium
 * - variance > 25   → low
 * - null            → null (pas de données consensus)
 */
function computeAgreement(variance: number | null): ScoreConsensus['agreement'] {
  if (variance === null) return null
  if (variance < 10) return 'high'
  if (variance <= 25) return 'medium'
  return 'low'
}

/**
 * Récupère les données de consensus pour un signal donné.
 * Lit `scores.score_consensus`, `scores.score_variance`, `scores.models_used`
 * scoped à l'org courante via useCurrentOrgId.
 */
export function useScoreConsensus(signalId: string | null | undefined) {
  const orgId = useCurrentOrgId()

  return useQuery<ScoreConsensus>({
    queryKey: ['score_consensus', orgId, signalId],
    enabled: !!orgId && !!signalId,
    staleTime: 5 * 60 * 1000, // 5 min
    queryFn: async () => {
      const [scoreRes, runsRes] = await Promise.all([
        supabase
          .from('scores')
          .select('score_consensus, score_variance, models_used')
          .eq('signal_id', signalId ?? '')
          .eq('org_id', orgId ?? '')
          .maybeSingle(),
        supabase
          .from('score_runs')
          .select('model, provider, score, reasoning')
          .eq('signal_id', signalId ?? '')
          .eq('org_id', orgId ?? '')
          .order('ts', { ascending: false }),
      ])

      if (scoreRes.error) throw scoreRes.error

      const data = scoreRes.data
      const runs: ScoreRunEntry[] = (runsRes.data ?? []).map((r) => ({
        model: r.model,
        provider: r.provider,
        score: r.score,
        reasoning: r.reasoning,
      }))

      if (!data || data.score_consensus === null) {
        return { consensus: null, variance: null, models: [], agreement: null, runs }
      }

      const consensus = data.score_consensus ?? null
      const variance = data.score_variance ?? null
      const models = data.models_used ?? []

      return {
        consensus,
        variance,
        models,
        agreement: computeAgreement(variance),
        runs,
      }
    },
  })
}
