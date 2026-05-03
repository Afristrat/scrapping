import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { SignalSource } from '@/lib/source-meta'

export type PeriodKey = '24h' | '7j' | '30j' | 'all'
export type SortKey = 'score' | 'date'

export const PERIOD_HOURS: Record<PeriodKey, number | null> = {
  '24h': 24,
  '7j': 24 * 7,
  '30j': 24 * 30,
  all: null,
}

export interface SignalFilters {
  sources: SignalSource[]
  minScore: number
  period: PeriodKey
  sortBy: SortKey
}

export interface SignalRow {
  id: string
  source: SignalSource
  external_id: string
  url: string | null
  title: string | null
  raw_payload: Record<string, unknown>
  scraped_at: string
  signal_date: string | null
  score: number | null
  reasoning: string | null
  model_used: string | null
  cost: number | null
  scored_at: string | null
}

interface RawSignal {
  id: string
  source: SignalSource
  external_id: string
  url: string | null
  title: string | null
  raw_payload: Record<string, unknown>
  scraped_at: string
  signal_date: string | null
  scores: Array<{
    score: number
    reasoning: string | null
    model_used: string
    cost: number
    scored_at: string
  }>
}

export function useSignals(filters: SignalFilters) {
  const orgId = useCurrentOrgId()
  return useQuery<SignalRow[]>({
    queryKey: ['signals', orgId, filters],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from('signals')
        .select('*, scores(score, reasoning, model_used, cost, scored_at)')
        .eq('org_id', orgId ?? '')

      if (filters.sources.length > 0) {
        q = q.in('source', filters.sources)
      }
      const periodHours = PERIOD_HOURS[filters.period]
      if (periodHours != null) {
        const since = new Date(Date.now() - periodHours * 3_600_000).toISOString()
        // Filtre sur la date du contenu si dispo, sinon fallback sur la date de scrape
        q = q.or(`signal_date.gte.${since},and(signal_date.is.null,scraped_at.gte.${since})`)
      }
      if (filters.minScore > 0) {
        q = q.not('scores', 'is', null).gte('scores.score', filters.minScore)
      }

      // Limit assez large pour couvrir TOUT le corpus utilisateur typique
      // (jusqu à 5000 signaux). Sinon, le tri par scraped_at DESC suivi de la
      // limit faisait sauter les top scores des sources moins prolifiques :
      // ex 640 Reddit + 108 ArXiv = 748 total → limit 500 coupait 248 ArXiv
      // potentiellement haut score (95, 90). Le tri client-side par score
      // remontait alors uniquement les Reddit récents.
      const { data, error } = await q.order('scraped_at', { ascending: false }).limit(5000)
      if (error) throw error

      const rows: SignalRow[] = (data as unknown as RawSignal[]).map((s) => ({
        id: s.id,
        source: s.source,
        external_id: s.external_id,
        url: s.url,
        title: s.title,
        raw_payload: s.raw_payload,
        scraped_at: s.scraped_at,
        signal_date: s.signal_date,
        score: s.scores[0]?.score ?? null,
        reasoning: s.scores[0]?.reasoning ?? null,
        model_used: s.scores[0]?.model_used ?? null,
        cost: s.scores[0]?.cost ?? null,
        scored_at: s.scores[0]?.scored_at ?? null,
      }))

      // Tri par score DESC primaire, date DESC secondaire (sortBy='score', défaut)
      // ou date DESC primaire, score DESC secondaire (sortBy='date').
      // Les non-scorés ont un score implicite de -1 → relégués quand sortBy='score'.
      rows.sort((a, b) => {
        const aDate = a.signal_date ?? a.scraped_at
        const bDate = b.signal_date ?? b.scraped_at
        const aScore = a.score ?? -1
        const bScore = b.score ?? -1

        if (filters.sortBy === 'date') {
          const dateCmp = bDate.localeCompare(aDate)
          if (dateCmp !== 0) return dateCmp
          return bScore - aScore
        }
        // sortBy === 'score' (défaut)
        const scoreCmp = bScore - aScore
        if (scoreCmp !== 0) return scoreCmp
        return bDate.localeCompare(aDate)
      })

      return rows
    },
  })
}

/**
 * Supprime un signal par son id. La table `scores` étant configurée en
 * `ON DELETE CASCADE`, les scores associés sont purgés automatiquement.
 * RLS garantit qu'un user ne peut supprimer que ses propres signaux.
 */
export function useDeleteSignal() {
  const qc = useQueryClient()
  return useMutation<string, Error, string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('signals').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return id
    },
    onSuccess: () => {
      toast.success('Signal supprimé')
      void qc.invalidateQueries({ queryKey: ['signals'] })
    },
    onError: (err) => {
      toast.error('Échec de la suppression', { description: err.message.slice(0, 200) })
    },
  })
}

/**
 * Supprime plusieurs signaux en une seule requête via `.in('id', ids)`.
 * Cascade gérée par la FK `scores.signal_id ON DELETE CASCADE`.
 */
export function useDeleteSignalsBulk() {
  const qc = useQueryClient()
  return useMutation<string[], Error, string[]>({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return []
      const { error } = await supabase.from('signals').delete().in('id', ids)
      if (error) throw new Error(error.message)
      return ids
    },
    onSuccess: (ids) => {
      const n = ids.length
      toast.success(n > 1 ? `${n} signaux supprimés` : `${n} signal supprimé`)
      void qc.invalidateQueries({ queryKey: ['signals'] })
    },
    onError: (err) => {
      toast.error('Échec de la suppression groupée', {
        description: err.message.slice(0, 200),
      })
    },
  })
}
