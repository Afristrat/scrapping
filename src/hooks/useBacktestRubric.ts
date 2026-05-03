import { useMutation } from '@tanstack/react-query'
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

interface BacktestRubricPayload {
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
  return useMutation<BacktestResult[], Error, BacktestRubricPayload>({
    mutationFn: async (payload) => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('not_authenticated')

      const baseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const resp = await fetch(`${baseUrl}/functions/v1/backtest-rubric`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = (await resp.json()) as BacktestRubricResponse

      if (resp.status === 409 || data.error === 'backtest_in_progress') {
        throw new Error('backtest_in_progress')
      }

      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? `backtest_failed: HTTP ${resp.status}`)
      }

      return data.results
    },
  })
}
