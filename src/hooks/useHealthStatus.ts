import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// =============================================================================
// Wave 6 — Sub-wave 6.5 — Story S6-SLAMonitoring
//
// Hook de lecture du statut de santé pour la page publique /status.
//
// La table `health_checks` et la vue `daily_uptime` sont créées par la
// migration 20260502000012 mais ne sont pas encore typées dans
// `src/types/database.ts` (régénération nécessaire post-`db push`). On
// utilise donc un cast minimal au point d'entrée du builder `from()`,
// puis on re-type fortement la sortie.
//
// Trois requêtes sont exposées :
//   1. useLatestHealthByService — dernier check par service (carte status)
//   2. useDailyUptime           — % uptime par service par jour sur 90 j (timeline)
//   3. useRecentIncidents       — 10 derniers checks status != 'ok' (table)
//
// La page n'a pas besoin d'auth : RLS autorise SELECT à anon (cf. migration).
// =============================================================================

export type HealthService = 'db' | 'minio' | 'llm' | 'apify'
export type HealthCheckStatus = 'ok' | 'degraded' | 'down'

export interface HealthCheckRow {
  id: number
  checked_at: string
  service: HealthService
  status: HealthCheckStatus
  latency_ms: number | null
  error: string | null
}

export interface DailyUptimeRow {
  service: HealthService
  day: string // YYYY-MM-DD
  total_checks: number
  ok_checks: number
  degraded_checks: number
  down_checks: number
  uptime_pct: number
  avg_latency_ms: number
}

const REFRESH_INTERVAL_MS = 60_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any

function rawClient(): { from: (t: string) => AnyBuilder } {
  return supabase as unknown as { from: (t: string) => AnyBuilder }
}

/**
 * Renvoie le dernier check par service (4 lignes max). On lit les 200
 * derniers enregistrements puis on déduplique côté JS pour éviter une
 * dépendance à `distinct on` qui n'est pas exposée par PostgREST.
 */
export function useLatestHealthByService(): UseQueryResult<
  Record<HealthService, HealthCheckRow | null>,
  Error
> {
  return useQuery<Record<HealthService, HealthCheckRow | null>, Error>({
    queryKey: ['health_status', 'latest'],
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async () => {
      const { data, error } = await rawClient()
        .from('health_checks')
        .select('id, checked_at, service, status, latency_ms, error')
        .order('checked_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const rows = (data ?? []) as HealthCheckRow[]
      const map: Record<HealthService, HealthCheckRow | null> = {
        db: null,
        minio: null,
        llm: null,
        apify: null,
      }
      for (const row of rows) {
        if (map[row.service] === null) {
          map[row.service] = row
        }
      }
      return map
    },
  })
}

/**
 * Renvoie l'historique 90 j de la vue `daily_uptime` pour la timeline.
 * Tri ascendant par jour pour faciliter le rendu Recharts.
 */
export function useDailyUptime(): UseQueryResult<DailyUptimeRow[], Error> {
  return useQuery<DailyUptimeRow[], Error>({
    queryKey: ['health_status', 'daily_uptime_90d'],
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async () => {
      const { data, error } = await rawClient()
        .from('daily_uptime')
        .select(
          'service, day, total_checks, ok_checks, degraded_checks, down_checks, uptime_pct, avg_latency_ms',
        )
        .order('day', { ascending: true })
      if (error) throw error
      return (data ?? []) as DailyUptimeRow[]
    },
  })
}

/**
 * Renvoie les 10 derniers checks dont le status n'est pas `ok` — utilisé
 * comme historique d'incidents en bas de la page status.
 */
export function useRecentIncidents(limit = 10): UseQueryResult<HealthCheckRow[], Error> {
  return useQuery<HealthCheckRow[], Error>({
    queryKey: ['health_status', 'incidents', limit],
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async () => {
      const { data, error } = await rawClient()
        .from('health_checks')
        .select('id, checked_at, service, status, latency_ms, error')
        .neq('status', 'ok')
        .order('checked_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as HealthCheckRow[]
    },
  })
}

/**
 * Aide : calcule l'uptime moyen sur une fenêtre de N jours, par service,
 * à partir d'un dataset DailyUptimeRow[]. Retourne `null` si la fenêtre
 * est vide pour le service donné (pas de check sur la période).
 */
export function computeUptimeOver(
  rows: DailyUptimeRow[],
  service: HealthService,
  windowDays: number,
): number | null {
  const cutoffMs = Date.now() - windowDays * 86_400_000
  const filtered = rows.filter((r) => {
    if (r.service !== service) return false
    const d = Date.parse(r.day)
    return Number.isFinite(d) && d >= cutoffMs
  })
  if (filtered.length === 0) return null
  const totalChecks = filtered.reduce((acc, r) => acc + (r.total_checks ?? 0), 0)
  const okChecks = filtered.reduce((acc, r) => acc + (r.ok_checks ?? 0), 0)
  if (totalChecks === 0) return null
  return Math.round((okChecks / totalChecks) * 100_000) / 1000 // 3 décimales
}

/**
 * Aide : status global agrégé à partir des 4 derniers checks par service.
 *  - tous `ok`        → `ok`
 *  - au moins 1 down  → `down`
 *  - sinon            → `degraded`
 *  - aucun check      → `unknown`
 */
export function computeGlobalStatus(
  latest: Record<HealthService, HealthCheckRow | null> | undefined,
): 'ok' | 'degraded' | 'down' | 'unknown' {
  if (!latest) return 'unknown'
  const services: HealthService[] = ['db', 'minio', 'llm', 'apify']
  const rows = services.map((s) => latest[s]).filter((r): r is HealthCheckRow => r !== null)
  if (rows.length === 0) return 'unknown'
  if (rows.some((r) => r.status === 'down')) return 'down'
  if (rows.some((r) => r.status === 'degraded')) return 'degraded'
  return 'ok'
}
