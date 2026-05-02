import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface RescoreResult {
  batch_size: number
  scored: number
  missed: number
  cost: number
  parse_failed?: boolean
  error?: string
  detail?: string
}

/**
 * Extrait un message d'erreur lisible depuis l'objet retourné par
 * `supabase.functions.invoke`. La librairie wrappe les réponses 4xx/5xx
 * dans une `FunctionsHttpError` dont le `message` est générique
 * (« Edge Function returned a non-2xx status code »). Le vrai détail est
 * dans `context.body` (Response). On le récupère pour offrir à
 * l'utilisateur un message exploitable (« missing_api_key »,
 * « settings_not_found », « dispatch_unreachable », etc.).
 */
async function extractFunctionsError(error: unknown): Promise<string> {
  if (!error) return 'unknown_error'
  const e = error as { message?: string; context?: unknown }
  const fallback = e.message ?? 'unknown_error'

  const ctx = e.context
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json()
      if (typeof body === 'object' && body !== null) {
        const detail = (body as { detail?: string }).detail
        const errCode = (body as { error?: string }).error
        const hint = (body as { hint?: string }).hint
        if (detail) return errCode ? `${errCode}: ${detail}` : detail
        if (errCode) return hint ? `${errCode} (${hint})` : errCode
      }
    } catch {
      // body n'est pas du JSON, on retourne le fallback
    }
  }
  return fallback
}

async function callRescore(signalIds: string[]): Promise<RescoreResult> {
  if (signalIds.length === 0) {
    return { batch_size: 0, scored: 0, missed: 0, cost: 0 }
  }
  const { data, error } = await supabase.functions.invoke<RescoreResult>('llm-score-batch', {
    body: { signal_ids: signalIds },
  })
  if (error) {
    const detail = await extractFunctionsError(error)
    throw new Error(detail)
  }
  if (!data) throw new Error('empty_response')
  return data
}

/**
 * Re-score un signal isolé. Utilisé par le bouton ↻ inline sur chaque
 * cellule de score. Le contexte de mutation expose l'id pour que la
 * table puisse déclencher l'animation de flash en succès.
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
          description: `Le LLM a renvoyé une sortie illisible (${data.detail ?? 'parse_failed'}). Voir Logs.`,
        })
      } else {
        toast.warning('Re-scoring sans résultat', {
          description: data.detail ?? 'Le LLM n’a pas renvoyé de score pour ce signal.',
        })
      }
      qc.invalidateQueries({ queryKey: ['signals'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) => {
      toast.error('Re-scoring échoué', { description: err.message.slice(0, 300) })
    },
  })
}

/**
 * Re-score N signaux en lots de 30 (cap edge function). Robuste : si une
 * batch échoue (réseau, missing_api_key, etc.), on continue les batches
 * suivantes et on agrège les erreurs dans le résultat final. L'utilisateur
 * voit le bilan complet (X scorés, Y échecs) plutôt qu'un échec brutal.
 */
const BULK_CHUNK = 30

interface BulkRescoreResult extends RescoreResult {
  batches_total: number
  batches_failed: number
  errors: string[]
}

export function useRescoreSignalsBulk() {
  const qc = useQueryClient()
  return useMutation<BulkRescoreResult, Error, { ids: string[] }, { ids: string[] }>({
    mutationFn: async ({ ids }) => {
      if (ids.length === 0) {
        return {
          batch_size: 0,
          scored: 0,
          missed: 0,
          cost: 0,
          batches_total: 0,
          batches_failed: 0,
          errors: [],
        }
      }
      const aggregate: BulkRescoreResult = {
        batch_size: 0,
        scored: 0,
        missed: 0,
        cost: 0,
        parse_failed: false,
        batches_total: 0,
        batches_failed: 0,
        errors: [],
      }
      for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        const chunk = ids.slice(i, i + BULK_CHUNK)
        aggregate.batches_total += 1
        try {
          const r = await callRescore(chunk)
          aggregate.batch_size += r.batch_size
          aggregate.scored += r.scored
          aggregate.missed += r.missed
          aggregate.cost += r.cost
          if (r.parse_failed) {
            aggregate.parse_failed = true
            aggregate.errors.push(`Batch ${aggregate.batches_total}: ${r.detail ?? 'parse_failed'}`)
          }
        } catch (err) {
          aggregate.batches_failed += 1
          aggregate.batch_size += chunk.length
          aggregate.missed += chunk.length
          const message = err instanceof Error ? err.message : 'unknown_error'
          aggregate.errors.push(`Batch ${aggregate.batches_total}: ${message}`)
          // Si toutes les premières batches échouent avec la même cause
          // (ex. missing_api_key), abandonner pour éviter de gaspiller.
          if (aggregate.batches_failed >= 3 && aggregate.scored === 0) {
            aggregate.errors.push(
              `Abandon après ${aggregate.batches_failed} échecs consécutifs. Vérifier les clés API et réessayer.`,
            )
            break
          }
        }
      }
      return aggregate
    },
    onMutate: ({ ids }) => ({ ids }),
    onSuccess: (data) => {
      const cost = (Math.round(data.cost * 1000) / 1000).toFixed(3)
      const stats = `${data.scored}/${data.batch_size} re-scorés · ${data.batches_failed}/${data.batches_total} batches en échec · coût ${cost} $`
      if (data.batches_failed === 0 && data.parse_failed !== true) {
        toast.success('Re-scoring terminé', { description: stats })
      } else if (data.scored === 0) {
        toast.error('Re-scoring échoué', {
          description: `${stats}\n${data.errors[0] ?? ''}`.slice(0, 500),
        })
      } else {
        toast.warning('Re-scoring partiel', {
          description: `${stats}\nPremière erreur : ${data.errors[0] ?? '—'}`.slice(0, 500),
        })
      }
      qc.invalidateQueries({ queryKey: ['signals'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) => {
      toast.error('Re-scoring échoué', { description: err.message.slice(0, 300) })
    },
  })
}
