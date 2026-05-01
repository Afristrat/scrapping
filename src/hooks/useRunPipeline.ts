import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface ScrapeStatus {
  name: string
  status: 'fulfilled' | 'rejected'
  value: unknown
  reason: string | null
}

export interface RunPipelineResult {
  scrape: ScrapeStatus[]
  scrape_ms: number
  scored: number
  batches_total: number
  batches_processed: number
  batches_ok: number
  batches_failed: number
  rate_limited: number
  total_to_score: number
  unscored_remaining: number
  batch_size: number
  batch_concurrency: number
  duration_ms: number
  timeout_hit: boolean
}

export function useRunPipeline() {
  const qc = useQueryClient()

  return useMutation<RunPipelineResult, Error>({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('not_authenticated')

      const baseUrl = import.meta.env.VITE_SUPABASE_URL
      const resp = await fetch(`${baseUrl}/functions/v1/run-pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`pipeline_failed: ${text.slice(0, 200)}`)
      }
      return (await resp.json()) as RunPipelineResult
    },
    onSuccess: (data) => {
      const seconds = Math.round(data.duration_ms / 100) / 10
      const parts: string[] = []
      parts.push(`${data.scored} signaux scorés en ${seconds}s`)
      if (data.batches_failed > 0) parts.push(`${data.batches_failed} batches échoués`)
      if (data.rate_limited > 0) parts.push(`${data.rate_limited} rate-limited`)

      if (data.timeout_hit && data.unscored_remaining > 0) {
        toast.warning(`Pipeline partiel : ${data.scored} scorés`, {
          description: `Reste ${data.unscored_remaining} à scorer (timeout 110s atteint). Clique "Run pipeline" à nouveau pour continuer.`,
          duration: 8000,
        })
      } else if (data.unscored_remaining > 0) {
        toast.success(parts.join(' · '), {
          description: `Reste ${data.unscored_remaining} signaux non scorés. Re-clique pour les traiter.`,
        })
      } else {
        toast.success(parts.join(' · '), {
          description:
            data.scored > 0 ? 'Tous les signaux ont été scorés.' : 'Aucun nouveau signal à scorer.',
        })
      }

      qc.invalidateQueries({ queryKey: ['signals'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) => {
      toast.error('Pipeline échoué', { description: err.message.slice(0, 200) })
    },
  })
}
