import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useLLMCostsRecent, computeTotals } from '@/hooks/useLLMCosts'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

export type SuggestionType = 'warning' | 'info' | 'tip'

export interface Suggestion {
  id: string
  type: SuggestionType
  title: string
  description: string
  action?: { label: string; tab: string }
}

/** Scores récents des 50 derniers signaux scorés */
interface RecentScore {
  score: number
  model_used: string | null
  signal_source: string | null
  signal_scraped_at: string | null
}

function useRecentScores() {
  const orgId = useCurrentOrgId()
  return useQuery<RecentScore[]>({
    queryKey: ['recent_scores_suggestions', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000, // 5 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scores')
        .select('score, model_used, signals(source, scraped_at)')
        .eq('org_id', orgId ?? '')
        .order('scored_at', { ascending: false })
        .limit(50)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => ({
        score: Number(row.score),
        model_used: row.model_used ?? null,
        signal_source: row.signals?.source ?? null,
        signal_scraped_at: row.signals?.scraped_at ?? null,
      })) as RecentScore[]
    },
  })
}

/** Dernière date de signal par source (reddit sub précis) */
interface SourceLastSeen {
  source: string
  external_id: string
  scraped_at: string
  raw_payload: Record<string, unknown>
}

function useRedditSignalsLastSeen() {
  const orgId = useCurrentOrgId()
  return useQuery<SourceLastSeen[]>({
    queryKey: ['reddit_signals_last_seen', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('signals')
        .select('source, external_id, scraped_at, raw_payload')
        .eq('org_id', orgId ?? '')
        .eq('source', 'reddit')
        .gte('scraped_at', since)
      if (error) throw error
      return (data ?? []) as SourceLastSeen[]
    },
  })
}

/**
 * Calcule les suggestions comportementales basées sur les données réelles de
 * l'utilisateur. Règles déterministes, sans appel LLM.
 */
export function useSettingsSuggestions(): { suggestions: Suggestion[]; isLoading: boolean } {
  const { data: settings, isLoading: settingsLoading } = useSettings()
  const { data: costsRaw = [], isLoading: costsLoading } = useLLMCostsRecent(14)
  const { data: recentScores = [], isLoading: scoresLoading } = useRecentScores()
  const { data: redditSignals = [], isLoading: redditLoading } = useRedditSignalsLastSeen()

  const isLoading = settingsLoading || costsLoading || scoresLoading || redditLoading

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!settings) return []

    const result: Suggestion[] = []

    /* ---------------------------------------------------------------------- */
    /* Règle 1 : Aucune source configurée                                      */
    /* ---------------------------------------------------------------------- */
    const noSources =
      (settings.reddit_subs?.length ?? 0) === 0 &&
      (settings.x_queries?.length ?? 0) === 0 &&
      (settings.arxiv_categories?.length ?? 0) === 0

    if (noSources) {
      result.push({
        id: 'no-sources',
        type: 'warning',
        title: 'Aucune source configurée',
        description:
          'Ajoutez des subreddits, des requêtes X ou des catégories arXiv pour commencer la veille.',
        action: { label: 'Configurer les sources', tab: 'sources' },
      })
    }

    /* ---------------------------------------------------------------------- */
    /* Règle 2 : Budget dépassé — coût 7j > 80% du budget hebdo               */
    /* ---------------------------------------------------------------------- */
    const dailyBudget = settings.daily_budget_usd ?? 5
    const weeklyBudget = dailyBudget * 7
    const { total7d } = computeTotals(costsRaw)

    if (weeklyBudget > 0 && total7d > weeklyBudget * 0.8) {
      result.push({
        id: 'budget-warning',
        type: 'warning',
        title: 'Consommation proche de la limite',
        description: `Votre consommation des 7 derniers jours ($${total7d.toFixed(2)}) approche la limite hebdomadaire ($${weeklyBudget.toFixed(2)}). Envisagez d'augmenter le budget ou de réduire la fréquence.`,
        action: { label: 'Ajuster le budget', tab: 'branding' },
      })
    }

    /* ---------------------------------------------------------------------- */
    /* Règle 3 : Budget sous-utilisé — coût 7j < 10% du budget hebdo          */
    /* ---------------------------------------------------------------------- */
    if (weeklyBudget > 0 && total7d < weeklyBudget * 0.1 && total7d >= 0) {
      result.push({
        id: 'budget-underused',
        type: 'tip',
        title: 'Budget largement sous-utilisé',
        description: `Votre consommation des 7 derniers jours ($${total7d.toFixed(2)}) est bien en dessous du budget hebdomadaire ($${weeklyBudget.toFixed(2)}). Vous pouvez activer plus de sources ou augmenter la fréquence.`,
        action: { label: 'Ajouter des sources', tab: 'sources' },
      })
    }

    /* ---------------------------------------------------------------------- */
    /* Règle 4 : Sources Reddit peu actives (aucun signal depuis 14 jours)     */
    /* ---------------------------------------------------------------------- */
    if ((settings.reddit_subs?.length ?? 0) > 0) {
      // Construire l'ensemble des subs qui ont au moins un signal récent
      const activeSubsInDb = new Set<string>()
      for (const row of redditSignals) {
        // Le nom du sub est dans raw_payload.subreddit ou external_id contient "r/sub"
        const payload = row.raw_payload
        const sub =
          (typeof payload.subreddit === 'string' ? payload.subreddit.toLowerCase() : null) ??
          (typeof payload.community_name === 'string'
            ? payload.community_name.toLowerCase().replace(/^r\//, '')
            : null)
        if (sub) activeSubsInDb.add(sub)
      }

      for (const configuredSub of settings.reddit_subs) {
        const normalized = configuredSub.toLowerCase().replace(/^r\//, '')
        if (!activeSubsInDb.has(normalized)) {
          result.push({
            id: `inactive-reddit-${normalized}`,
            type: 'info',
            title: `r/${configuredSub} peu actif`,
            description: `r/${configuredSub} n'a produit aucun signal ces 14 derniers jours. Envisagez de le retirer ou de l'ajuster.`,
            action: { label: 'Gérer les sources', tab: 'sources' },
          })
          // On s'arrête à la première source inactive pour ne pas saturer (max 3 total)
          break
        }
      }
    }

    /* ---------------------------------------------------------------------- */
    /* Règle 5 : Modèle puissant mais score moyen faible                       */
    /* ---------------------------------------------------------------------- */
    const HEAVY_MODELS = ['claude-opus', 'gpt-4o', 'claude-opus-4', 'claude-opus-3-5']

    const scoringModel = settings.model_config?.scoring
    const modelId = scoringModel?.model ?? ''
    const isHeavyModel = HEAVY_MODELS.some((m) => modelId.toLowerCase().includes(m))

    if (isHeavyModel && recentScores.length >= 10) {
      const avgScore = recentScores.reduce((sum, r) => sum + r.score, 0) / recentScores.length

      if (avgScore < 50) {
        result.push({
          id: 'heavy-model-low-score',
          type: 'tip',
          title: 'Modèle puissant mais score moyen faible',
          description: `Votre modèle de scoring (${modelId}) est performant mais le score moyen des signaux récents est faible (${Math.round(avgScore)}/100). Essayez un modèle plus léger pour économiser.`,
          action: { label: 'Changer de modèle', tab: 'models' },
        })
      }
    }

    // Maximum 3 suggestions affichées
    return result.slice(0, 3)
  }, [settings, costsRaw, recentScores, redditSignals])

  return { suggestions, isLoading }
}
