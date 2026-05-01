import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export type DigestLanguage = 'fr' | 'en' | 'es'

export interface DigestRow {
  id: string
  user_id: string
  generated_at: string
  language: DigestLanguage
  signal_count: number
  min_score: number
  window_hours: number
  content: string
  model_used: string | null
  cost: number | null
}

export interface GenerateDigestArgs {
  window_hours?: number
  min_score?: number
}

export interface GenerateDigestResponse {
  ok: true
  digest_id: string
  content: string
  signal_count: number
  window_hours: number
  min_score: number
  language: DigestLanguage
  model_used: string
  provider_used: string | null
  cost: number
  generated_at: string
}

const HISTORY_LIMIT = 10

/**
 * Liste les `HISTORY_LIMIT` derniers digests générés par l'utilisateur,
 * triés par `generated_at` desc.
 */
export function useDigests(): ReturnType<typeof useQuery<DigestRow[]>> {
  return useQuery<DigestRow[]>({
    queryKey: ['digests', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digests')
        .select(
          'id, user_id, generated_at, language, signal_count, min_score, window_hours, content, model_used, cost',
        )
        .order('generated_at', { ascending: false })
        .limit(HISTORY_LIMIT)
      if (error) throw error
      return (data ?? []) as DigestRow[]
    },
  })
}

/**
 * Mutation : invoque l'edge function `digest` qui agrège les signaux scorés
 * et génère un nouveau brief 80/20 dans la langue utilisateur.
 */
export function useGenerateDigest(): ReturnType<
  typeof useMutation<GenerateDigestResponse, Error, GenerateDigestArgs>
> {
  const qc = useQueryClient()
  return useMutation<GenerateDigestResponse, Error, GenerateDigestArgs>({
    mutationFn: async (args) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/digest`
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('not_authenticated')

      const body: Record<string, number> = {}
      if (typeof args.window_hours === 'number') body.window_hours = args.window_hours
      if (typeof args.min_score === 'number') body.min_score = args.min_score

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const json = (await resp.json()) as
        | GenerateDigestResponse
        | { ok: false; error?: string; detail?: string }
      if (!resp.ok || json.ok === false) {
        const msg =
          'error' in json && typeof json.error === 'string' ? json.error : 'digest_failed'
        const detail =
          'detail' in json && typeof json.detail === 'string' ? `: ${json.detail}` : ''
        throw new Error(`${msg}${detail}`)
      }
      return json
    },
    onSuccess: (digest) => {
      toast.success(
        `Brief généré (${digest.signal_count} signaux, $${Number(digest.cost).toFixed(4)})`,
      )
      qc.invalidateQueries({ queryKey: ['digests'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) =>
      toast.error('Échec génération brief', {
        description: err.message.slice(0, 240),
      }),
  })
}

/**
 * Mutation : supprime un digest par id.
 */
export function useDeleteDigest(): ReturnType<typeof useMutation<string, Error, string>> {
  const qc = useQueryClient()
  return useMutation<string, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('digests').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      toast.success('Brief supprimé')
      qc.invalidateQueries({ queryKey: ['digests'] })
    },
    onError: (err) =>
      toast.error('Échec suppression', { description: err.message.slice(0, 240) }),
  })
}
