import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

// =============================================================================
// Hooks pour la page /admin/api-inbound — observabilité du pipeline
// research-from-seed (caller Bassira).
//
// La table `research_sessions` n'est PAS encore régénérée dans
// `src/types/database.ts` (les types sont gelés à une version antérieure
// à la migration 20260512000001). On utilise donc des types locaux + un
// cast minimal du client Supabase — pattern identique à `useIsAppAdmin`.
//
// Sécurité : la policy SELECT créée par 20260513000001 limite l'accès aux
// app_admins. Un non-admin recevra simplement 0 rows (filtré par RLS).
// =============================================================================

export type ResearchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout'

export type ResearchOutputProfile = 'light' | 'full' | string

export interface ResearchSessionRow {
  id: string
  api_key_id: string | null
  proxy_user_id: string | null
  status: ResearchStatus
  seed: string
  lang: string
  sector_hint: string | null
  depth_hint: number | null
  output_profile: ResearchOutputProfile | null
  result: ResearchResultPayload | null
  error_detail: ResearchErrorDetail | null
  telemetry: ResearchTelemetry | null
  created_at: string
  updated_at: string
  completed_at: string | null
  expires_at: string
}

export interface ResearchSessionListItem extends ResearchSessionRow {
  api_key: { key_prefix: string | null; name: string | null } | null
}

export interface ResearchTelemetryStage {
  name: string
  ok: boolean
  duration_ms?: number
  cost_usd?: number
  model_used?: string
  [k: string]: unknown
}

export interface ResearchTelemetry {
  stages?: ResearchTelemetryStage[]
  total_duration_ms?: number
  total_cost_usd?: number
  model_used?: string
  [k: string]: unknown
}

export interface ResearchErrorDetail {
  error?: string
  stage?: string
  detail?: unknown
  upstream_errors?: unknown[]
  [k: string]: unknown
}

export type ResearchResultPayload = Record<string, unknown>

export interface ResearchLogRow {
  id: number
  user_id: string | null
  action: string
  payload: Record<string, unknown> | null
  status: string | null
  ts: string
}

export interface ResearchSessionFilters {
  status: ResearchStatus | 'all'
  keyPrefix: string
  search: string
}

// ---------------------------------------------------------------------------
// Client Supabase typé localement (les tables manquent du Database généré)
// ---------------------------------------------------------------------------

interface SupabaseQueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface SessionsQueryBuilder {
  select(cols: string): SessionsQueryBuilder
  eq(col: string, value: string | number): SessionsQueryBuilder
  ilike(col: string, value: string): SessionsQueryBuilder
  order(col: string, opts: { ascending: boolean }): SessionsQueryBuilder
  limit(n: number): Promise<SupabaseQueryResult<unknown[]>>
  maybeSingle(): Promise<SupabaseQueryResult<unknown>>
}

interface LogsQueryBuilder {
  select(cols: string): LogsQueryBuilder
  gte(col: string, value: string): LogsQueryBuilder
  lte(col: string, value: string): LogsQueryBuilder
  eq(col: string, value: string): LogsQueryBuilder
  order(col: string, opts: { ascending: boolean }): LogsQueryBuilder
  limit(n: number): Promise<SupabaseQueryResult<ResearchLogRow[]>>
}

interface TypedSupabaseClient {
  from(table: 'research_sessions'): SessionsQueryBuilder
  from(table: 'logs'): LogsQueryBuilder
}

function typedClient(): TypedSupabaseClient {
  return supabase as unknown as TypedSupabaseClient
}

// ---------------------------------------------------------------------------
// useResearchSessions — liste filtrée des 50 dernières sessions
// ---------------------------------------------------------------------------

const SESSIONS_LIST_LIMIT = 50

export function useResearchSessions(
  filters: ResearchSessionFilters,
): UseQueryResult<ResearchSessionListItem[], Error> {
  return useQuery<ResearchSessionListItem[], Error>({
    queryKey: ['research_sessions', 'list', filters],
    refetchInterval: (query) => {
      const rows = query.state.data ?? []
      const hasActive = rows.some((r) => r.status === 'pending' || r.status === 'running')
      return hasActive ? 3000 : 15000
    },
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const client = typedClient()
      let q = client
        .from('research_sessions')
        .select(
          'id, api_key_id, proxy_user_id, status, seed, lang, sector_hint, depth_hint, output_profile, result, error_detail, telemetry, created_at, updated_at, completed_at, expires_at, api_key:public_api_keys(key_prefix, name)',
        )

      if (filters.status !== 'all') {
        q = q.eq('status', filters.status)
      }
      if (filters.keyPrefix.trim().length > 0) {
        q = q.ilike('api_key.key_prefix', `${filters.keyPrefix.trim()}%`)
      }
      if (filters.search.trim().length > 0) {
        q = q.ilike('seed', `%${filters.search.trim()}%`)
      }

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(SESSIONS_LIST_LIMIT)

      if (error) throw new Error(error.message)
      return (data ?? []) as ResearchSessionListItem[]
    },
  })
}

// ---------------------------------------------------------------------------
// useResearchSessionDetail — une session + ses logs liés (best-effort window)
// ---------------------------------------------------------------------------

export interface ResearchSessionDetail {
  session: ResearchSessionListItem
  logs: ResearchLogRow[]
}

const PIPELINE_LOG_ACTIONS = [
  'research-strategist',
  'rubric-architect',
  'scraper-x',
  'scraper-reddit',
  'scraper-arxiv',
  'llm-score-batch',
  'signal-synthesizer',
  'quality-auditor',
]

export function useResearchSessionDetail(
  sessionId: string | null,
): UseQueryResult<ResearchSessionDetail | null, Error> {
  return useQuery<ResearchSessionDetail | null, Error>({
    queryKey: ['research_sessions', 'detail', sessionId],
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const detail = query.state.data
      if (!detail) return 3000
      const s = detail.session.status
      return s === 'pending' || s === 'running' ? 3000 : 30000
    },
    queryFn: async () => {
      if (!sessionId) return null

      const client = typedClient()

      const { data: sessionData, error: sessionErr } = await client
        .from('research_sessions')
        .select(
          'id, api_key_id, proxy_user_id, status, seed, lang, sector_hint, depth_hint, output_profile, result, error_detail, telemetry, created_at, updated_at, completed_at, expires_at, api_key:public_api_keys(key_prefix, name)',
        )
        .eq('id', sessionId)
        .maybeSingle()

      if (sessionErr) throw new Error(sessionErr.message)
      if (!sessionData) return null

      const session = sessionData as ResearchSessionListItem

      // Logs liés : fenêtre temporelle + user_id proxy + actions pipeline.
      // Best-effort : si la table logs a une RLS user-scoped et que le
      // proxy_user_id n'est pas l'app_admin connecté, on récupèrera 0 row.
      // C'est OK — la page n'a pas vocation à voir les logs d'autres orgs.
      let logs: ResearchLogRow[] = []
      const lowerBound = session.created_at
      const upperBound = session.completed_at ?? new Date().toISOString()

      if (session.proxy_user_id) {
        const { data: logsData, error: logsErr } = await client
          .from('logs')
          .select('id, user_id, action, payload, status, ts')
          .eq('user_id', session.proxy_user_id)
          .gte('ts', lowerBound)
          .lte('ts', upperBound)
          .order('ts', { ascending: true })
          .limit(200)

        if (logsErr) {
          // Non-bloquant : on retourne quand même la session sans les logs.
          logs = []
        } else {
          logs = (logsData ?? []).filter((row) =>
            PIPELINE_LOG_ACTIONS.some((a) => row.action.startsWith(a)),
          )
        }
      }

      return { session, logs }
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers d'affichage utilisés par la page
// ---------------------------------------------------------------------------

export function computeSessionDurationMs(row: ResearchSessionRow): number | null {
  if (!row.completed_at) return null
  const start = new Date(row.created_at).getTime()
  const end = new Date(row.completed_at).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, end - start)
}

export function failedStageOf(row: ResearchSessionRow): string | null {
  if (row.status !== 'failed' && row.status !== 'timeout') return null
  const fromDetail = row.error_detail?.stage
  if (typeof fromDetail === 'string' && fromDetail.length > 0) return fromDetail
  const stages = row.telemetry?.stages ?? []
  const firstKo = stages.find((s) => s.ok === false)
  return firstKo?.name ?? null
}
