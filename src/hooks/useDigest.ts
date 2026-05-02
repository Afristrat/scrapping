import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

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

/**
 * Erreur métier enrichie remontée par l'edge function `digest` quand la
 * génération échoue de façon « attendue » (ex : aucun signal au-dessus du
 * seuil). On préserve les stats du corpus pour permettre à l'UI de proposer
 * une action corrective (baisser le seuil, élargir la fenêtre, etc.).
 */
export class DigestError extends Error {
  readonly code: string
  readonly message: string
  readonly detail?: string
  readonly maxScoreInWindow: number | null
  readonly scoredSignalsInWindow: number | null
  readonly scoredSignalsTotal: number | null
  readonly minScore: number | null
  readonly windowHours: number | null

  constructor(args: {
    code: string
    message: string
    detail?: string
    maxScoreInWindow?: number | null
    scoredSignalsInWindow?: number | null
    scoredSignalsTotal?: number | null
    minScore?: number | null
    windowHours?: number | null
  }) {
    super(args.message)
    this.name = 'DigestError'
    this.code = args.code
    this.message = args.message
    this.detail = args.detail
    this.maxScoreInWindow = args.maxScoreInWindow ?? null
    this.scoredSignalsInWindow = args.scoredSignalsInWindow ?? null
    this.scoredSignalsTotal = args.scoredSignalsTotal ?? null
    this.minScore = args.minScore ?? null
    this.windowHours = args.windowHours ?? null
  }
}

interface DigestErrorPayload {
  ok: false
  error?: string
  detail?: string
  message?: string
  max_score_in_window?: number | null
  scored_signals_in_window?: number | null
  scored_signals_total?: number | null
  min_score?: number | null
  window_hours?: number | null
}

function isErrorPayload(value: unknown): value is DigestErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    (value as { ok: unknown }).ok === false
  )
}

const HISTORY_LIMIT = 10

/**
 * Liste les `HISTORY_LIMIT` derniers digests générés par l'utilisateur,
 * triés par `generated_at` desc.
 */
export function useDigests(): ReturnType<typeof useQuery<DigestRow[]>> {
  const orgId = useCurrentOrgId()
  return useQuery<DigestRow[]>({
    queryKey: ['digests', 'list', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digests')
        .select(
          'id, user_id, generated_at, language, signal_count, min_score, window_hours, content, model_used, cost',
        )
        .eq('org_id', orgId ?? '')
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
      const json = (await resp.json()) as unknown
      if (!resp.ok || (isErrorPayload(json) && json.ok === false)) {
        const payload = isErrorPayload(json) ? json : ({} as DigestErrorPayload)
        const code =
          typeof payload.error === 'string' && payload.error.length > 0
            ? payload.error
            : 'digest_failed'
        const message =
          typeof payload.message === 'string' && payload.message.length > 0
            ? payload.message
            : typeof payload.detail === 'string' && payload.detail.length > 0
              ? `${code}: ${payload.detail}`
              : code
        throw new DigestError({
          code,
          message,
          detail: typeof payload.detail === 'string' ? payload.detail : undefined,
          maxScoreInWindow: payload.max_score_in_window ?? null,
          scoredSignalsInWindow: payload.scored_signals_in_window ?? null,
          scoredSignalsTotal: payload.scored_signals_total ?? null,
          minScore: payload.min_score ?? null,
          windowHours: payload.window_hours ?? null,
        })
      }
      return json as GenerateDigestResponse
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
    onError: (err) => toast.error('Échec suppression', { description: err.message.slice(0, 240) }),
  })
}
