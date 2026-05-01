import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export type PeriodDays = 1 | 7 | 30

export interface Digest {
  id: string
  user_id: string
  period_days: PeriodDays
  language: string
  content: string
  signals_count: number
  model_used: string
  cost: number
  generated_at: string
}

export function useLatestDigest(periodDays: PeriodDays) {
  return useQuery<Digest | null>({
    queryKey: ['digest', 'latest', periodDays],
    queryFn: async () => {
      const { data, error } = await (
        supabase.from('digests' as never) as ReturnType<typeof supabase.from>
      )
        .select('*')
        .eq('period_days', periodDays)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as Digest | null
    },
  })
}

export function useGenerateDigest() {
  const qc = useQueryClient()
  return useMutation<Digest, Error, { period_days: PeriodDays }>({
    mutationFn: async ({ period_days }) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/digest`
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('not_authenticated')

      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_days }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error ?? json.detail ?? 'digest_failed')
      return json.digest as Digest
    },
    onSuccess: (digest) => {
      toast.success(
        `Brief généré (${digest.signals_count} signaux, $${Number(digest.cost).toFixed(4)})`,
      )
      qc.invalidateQueries({ queryKey: ['digest'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) =>
      toast.error('Échec génération brief', { description: err.message.slice(0, 200) }),
  })
}
