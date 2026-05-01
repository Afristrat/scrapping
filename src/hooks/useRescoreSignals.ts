import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface RescoreResult {
  batch_size: number
  scored: number
  missed: number
  cost: number
  parse_failed?: boolean
}

async function callRescore(signalIds: string[]): Promise<RescoreResult> {
  if (signalIds.length === 0) {
    return { batch_size: 0, scored: 0, missed: 0, cost: 0 }
  }
  const { data, error } = await supabase.functions.invoke<RescoreResult>('llm-score-batch', {
    body: { signal_ids: signalIds },
  })
  if (error) throw error
  if (!data) throw new Error('empty_response')
  return data
}

/**
 * Re-score a single signal. Used by the inline ↻ button on each score
 * cell. The mutation context returns the id so the table can light up
 * the row briefly on success ("flash" UX).
 */
export function useRescoreSignal() {
  const qc = useQueryClient()
  return useMutation<RescoreResult, Error, { id: string }, { id: string }>({
    mutationFn: ({ id }) => callRescore([id]),
    onMutate: ({ id }) => ({ id }),
    onSuccess: (data, { id }) => {
      if (data.scored > 0) {
        toast.success('Signal re-scoré', { description: `id=${id.slice(0, 8)}…` })
      } else if (data.parse_failed) {
        toast.error('Re-scoring échoué', {
          description: 'Le LLM a renvoyé une sortie illisible. Voir Logs.',
        })
      } else {
        toast.warning('Re-scoring sans résultat', {
          description: 'Le LLM n’a pas renvoyé de score pour ce signal.',
        })
      }
      qc.invalidateQueries({ queryKey: ['signals'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) => {
      toast.error('Re-scoring échoué', { description: err.message.slice(0, 200) })
    },
  })
}

/**
 * Re-score a list of signals in one shot. The edge function caps a
 * single call at 30 signals — so we chunk client-side and aggregate
 * the results to keep the contract simple from the UI side.
 */
const BULK_CHUNK = 30

export function useRescoreSignalsBulk() {
  const qc = useQueryClient()
  return useMutation<RescoreResult, Error, { ids: string[] }, { ids: string[] }>({
    mutationFn: async ({ ids }) => {
      if (ids.length === 0) {
        return { batch_size: 0, scored: 0, missed: 0, cost: 0 }
      }
      const aggregate: RescoreResult = {
        batch_size: 0,
        scored: 0,
        missed: 0,
        cost: 0,
        parse_failed: false,
      }
      for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        const chunk = ids.slice(i, i + BULK_CHUNK)
        const r = await callRescore(chunk)
        aggregate.batch_size += r.batch_size
        aggregate.scored += r.scored
        aggregate.missed += r.missed
        aggregate.cost += r.cost
        if (r.parse_failed) aggregate.parse_failed = true
      }
      return aggregate
    },
    onMutate: ({ ids }) => ({ ids }),
    onSuccess: (data) => {
      const cents = Math.round(data.cost * 1000) / 1000
      toast.success(`Re-scoring terminé : ${data.scored}/${data.batch_size}`, {
        description:
          data.missed > 0
            ? `${data.missed} signal(aux) toujours non scoré(s) · coût ${cents}$`
            : `Coût ${cents}$`,
      })
      qc.invalidateQueries({ queryKey: ['signals'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) => {
      toast.error('Re-scoring échoué', { description: err.message.slice(0, 200) })
    },
  })
}
