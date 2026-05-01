import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export type PurgeScope = 'signals' | 'all'

export interface PurgeResult {
  scope: PurgeScope
  counts: {
    signals?: number
    logs?: number
    llm_costs?: number
    digests?: number
  }
}

export function usePurge() {
  const qc = useQueryClient()
  return useMutation<PurgeResult, Error, { scope: PurgeScope }>({
    mutationFn: async ({ scope }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('not_authenticated')

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/purge`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, scope }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error ?? json.detail ?? 'purge_failed')
      return json as PurgeResult
    },
    onSuccess: (data) => {
      const summary = Object.entries(data.counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')
      toast.success(`Purgé : ${summary}`)
      qc.invalidateQueries()
    },
    onError: (err) => toast.error('Échec purge', { description: err.message.slice(0, 200) }),
  })
}
