import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export interface ScoreDelta {
  signal_id: string
  title: string
  current_score: number | null
  backtested_score: number
  delta: number
  reasoning_new: string
}

export type BacktestResult = ScoreDelta

export interface BacktestRubricPayload {
  rubric_prompt: string
  criteria?: Array<{ label: string; weight: number }>
  max_signals?: number
}

interface BacktestRubricResponse {
  ok: boolean
  results: BacktestResult[]
  error?: string
}

export function useBacktestRubric() {
  const abortControllerRef = useRef<AbortController | null>(null)

  const mutation = useMutation<BacktestResult[], Error, BacktestRubricPayload>({
    mutationFn: async (payload) => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('not_authenticated')

      // Abort tout fetch précédent encore en cours
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      const baseUrl = import.meta.env.VITE_SUPABASE_URL as string

      let resp: Response
      try {
        resp = await fetch(`${baseUrl}/functions/v1/backtest-rubric`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('backtest_cancelled', { cause: err })
        }
        throw err
      }

      const data = (await resp.json()) as BacktestRubricResponse

      if (resp.status === 409 || data.error === 'backtest_in_progress') {
        throw new Error('backtest_in_progress')
      }

      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? `backtest_failed: HTTP ${resp.status}`)
      }

      return data.results
    },
    onError: (err) => {
      if (err.message === 'backtest_in_progress') {
        toast.warning('Un backtest est déjà en cours pour ce compte.')
      }
      // backtest_cancelled est silencieux (annulé volontairement par l'utilisateur)
    },
  })

  /** Annule le fetch en cours + reset la mutation */
  const cancel = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    mutation.reset()
  }

  return { ...mutation, cancel }
}
