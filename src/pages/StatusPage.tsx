import { useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  HelpCircle,
  ServerCrash,
  Sparkles,
  Wifi,
  XCircle,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computeGlobalStatus,
  computeUptimeOver,
  type DailyUptimeRow,
  type HealthCheckRow,
  type HealthCheckStatus,
  type HealthService,
  useDailyUptime,
  useLatestHealthByService,
  useRecentIncidents,
} from '@/hooks/useHealthStatus'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 6 — Sub-wave 6.5 — Story S6-SLAMonitoring
//
// Page publique /status. Affiche en temps réel l'état des 4 services
// monitorés et l'historique 90 j. Sert d'élément de preuve commercial pour
// l'engagement SLA 99,9 % du plan Enterprise.
//
// Architecture :
//   - Bandeau global (vert / orange / rouge) selon les derniers checks
//   - 4 cartes service (DB, MinIO, LLM, Apify) avec uptime 30 j et 90 j
//   - Timeline 90 j en LineChart Recharts (axis x : date, y : uptime %)
//   - Liste des derniers incidents (status != 'ok'), 10 max
//   - Footer : engagement contractuel + lien vers la doc SLA
// =============================================================================

interface ServiceMeta {
  id: HealthService
  label: string
  description: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  color: string // hex pour Recharts
}

const SERVICE_META: ServiceMeta[] = [
  {
    id: 'db',
    label: 'Base de données',
    description: 'Postgres Supabase — lectures, écritures, RLS.',
    icon: Database,
    color: '#10b981',
  },
  {
    id: 'minio',
    label: 'Object storage (MinIO)',
    description: 'Mémoire 90 j des topics et exports.',
    icon: HardDrive,
    color: '#6366f1',
  },
  {
    id: 'llm',
    label: 'LLM (OpenRouter)',
    description: 'Scoring, digest, classification IA.',
    icon: Sparkles,
    color: '#f59e0b',
  },
  {
    id: 'apify',
    label: 'Scraping (Apify)',
    description: 'Collecte X et Reddit.',
    icon: Wifi,
    color: '#ec4899',
  },
]

const STATUS_LABELS: Record<HealthCheckStatus, string> = {
  ok: 'Opérationnel',
  degraded: 'Dégradé',
  down: 'Indisponible',
}

const GLOBAL_STATUS_META: Record<
  'ok' | 'degraded' | 'down' | 'unknown',
  {
    label: string
    description: string
    classes: string
    Icon: React.ComponentType<{ className?: string }>
  }
> = {
  ok: {
    label: 'Tous les systèmes sont opérationnels',
    description: 'Aucun incident en cours sur les 4 services monitorés.',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    Icon: CheckCircle2,
  },
  degraded: {
    label: 'Service dégradé',
    description: 'Au moins un service est en latence élevée. Aucune indisponibilité.',
    classes: 'border-amber-200 bg-amber-50 text-amber-900',
    Icon: AlertTriangle,
  },
  down: {
    label: 'Incident en cours',
    description: 'Au moins un service est indisponible. Notre équipe est notifiée.',
    classes: 'border-red-200 bg-red-50 text-red-900',
    Icon: ServerCrash,
  },
  unknown: {
    label: 'Statut indisponible',
    description: 'Aucune sonde récente — la collecte est peut-être en pause.',
    classes: 'border-slate-200 bg-slate-50 text-slate-700',
    Icon: HelpCircle,
  },
}

function formatPct(value: number | null): string {
  if (value === null) return '—'
  if (value === 100) return '100,000 %'
  return `${value.toFixed(3).replace('.', ',')} %`
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2).replace('.', ',')} s`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusColorClasses(status: HealthCheckStatus): string {
  if (status === 'ok') return 'bg-emerald-100 text-emerald-800'
  if (status === 'degraded') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

interface TimelineDatum {
  day: string
  db: number | null
  minio: number | null
  llm: number | null
  apify: number | null
}

function buildTimelineData(rows: DailyUptimeRow[]): TimelineDatum[] {
  const byDay = new Map<string, TimelineDatum>()
  for (const row of rows) {
    const existing =
      byDay.get(row.day) ??
      ({
        day: row.day,
        db: null,
        minio: null,
        llm: null,
        apify: null,
      } satisfies TimelineDatum)
    existing[row.service] = row.uptime_pct
    byDay.set(row.day, existing)
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day))
}

interface ServiceCardProps {
  meta: ServiceMeta
  latest: HealthCheckRow | null
  uptime30: number | null
  uptime90: number | null
}

function ServiceCard({ meta, latest, uptime30, uptime90 }: ServiceCardProps): React.ReactElement {
  const Icon = meta.icon
  const status: HealthCheckStatus = latest?.status ?? 'down'
  const statusKnown = latest !== null

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700"
              style={{ color: meta.color }}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
            </div>
          </div>
          {statusKnown ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase',
                statusColorClasses(status),
              )}
            >
              {STATUS_LABELS[status]}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              Inconnu
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Uptime 30 j</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
              {formatPct(uptime30)}
            </dd>
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Uptime 90 j</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
              {formatPct(uptime90)}
            </dd>
          </div>
        </dl>
        {latest ? (
          <p className="mt-3 text-xs text-slate-500">
            Dernier check : {formatDateTime(latest.checked_at)} · Latence{' '}
            <span className="font-mono">{formatLatency(latest.latency_ms)}</span>
            {latest.error ? (
              <>
                {' '}
                ·{' '}
                <span className="text-red-700" title={latest.error}>
                  {latest.error.slice(0, 60)}
                </span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Aucun check enregistré — le cron de monitoring n'a pas encore tourné.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function StatusPage(): React.ReactElement {
  const latestQuery = useLatestHealthByService()
  const dailyQuery = useDailyUptime()
  const incidentsQuery = useRecentIncidents(10)

  const timelineData = useMemo(
    () => (dailyQuery.data ? buildTimelineData(dailyQuery.data) : []),
    [dailyQuery.data],
  )

  const globalStatus = computeGlobalStatus(latestQuery.data)
  const globalMeta = GLOBAL_STATUS_META[globalStatus]
  const GlobalIcon = globalMeta.Icon

  return (
    <div className="bg-white">
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Statut</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              État des services Kairos
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Disponibilité en temps réel, historique 90 jours et incidents récents. Mis à jour
              automatiquement chaque minute.
            </p>
          </div>
          <div
            className={cn(
              'mt-8 flex items-start gap-3 rounded-2xl border-2 p-5 shadow-sm',
              globalMeta.classes,
            )}
            role="status"
          >
            <GlobalIcon className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <p className="text-lg font-semibold">{globalMeta.label}</p>
              <p className="mt-1 text-sm">{globalMeta.description}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-12 sm:px-6">
        {/* 4 cartes services */}
        <section aria-labelledby="services">
          <h2 id="services" className="text-xl font-semibold text-slate-900">
            Services monitorés
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Disponibilité agrégée sur 30 et 90 jours, avec dernier check et latence.
          </p>
          {latestQuery.isLoading || dailyQuery.isLoading ? (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SERVICE_META.map((meta) => {
                const latest = latestQuery.data?.[meta.id] ?? null
                const uptime30 = computeUptimeOver(dailyQuery.data ?? [], meta.id, 30)
                const uptime90 = computeUptimeOver(dailyQuery.data ?? [], meta.id, 90)
                return (
                  <ServiceCard
                    key={meta.id}
                    meta={meta}
                    latest={latest}
                    uptime30={uptime30}
                    uptime90={uptime90}
                  />
                )
              })}
            </div>
          )}
        </section>

        {/* Timeline 90 j */}
        <section aria-labelledby="timeline">
          <Card>
            <CardHeader>
              <CardTitle id="timeline" className="text-base">
                Historique 90 jours — uptime quotidien
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dailyQuery.isLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : timelineData.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Aucune donnée d'uptime disponible pour le moment. Les premiers checks apparaîtront
                  ici dès que le cron de monitoring sera actif.
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis
                        domain={[95, 100]}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(value) =>
                          typeof value === 'number' ? `${value.toFixed(3)} %` : '—'
                        }
                      />
                      <Legend />
                      {SERVICE_META.map((meta) => (
                        <Line
                          key={meta.id}
                          type="monotone"
                          dataKey={meta.id}
                          name={meta.label}
                          stroke={meta.color}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Incidents récents */}
        <section aria-labelledby="incidents">
          <Card>
            <CardHeader>
              <CardTitle id="incidents" className="text-base">
                Historique des incidents (10 derniers)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {incidentsQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (incidentsQuery.data?.length ?? 0) === 0 ? (
                <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Aucun incident enregistré.</p>
                    <p className="mt-0.5 text-xs">
                      Tous les checks récents sont passés. Cette zone listera les anomalies dès
                      qu'un service sera dégradé ou indisponible.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Service</th>
                        <th className="px-3 py-2.5">Statut</th>
                        <th className="px-3 py-2.5">Latence</th>
                        <th className="px-3 py-2.5">Détail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(incidentsQuery.data ?? []).map((incident) => {
                        const meta = SERVICE_META.find((m) => m.id === incident.service)
                        const Icon = meta?.icon ?? XCircle
                        return (
                          <tr key={incident.id}>
                            <td className="px-3 py-2 font-mono text-xs text-slate-700">
                              {formatDateTime(incident.checked_at)}
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                                {meta?.label ?? incident.service}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[11px] font-medium uppercase',
                                  statusColorClasses(incident.status),
                                )}
                              >
                                {STATUS_LABELS[incident.status]}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-700">
                              {formatLatency(incident.latency_ms)}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {incident.error ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <footer className="border-t border-slate-100 pt-6 text-xs text-slate-500">
          <p>
            Engagement contractuel <span className="font-semibold text-slate-700">SLA 99,9 %</span>{' '}
            (plan Enterprise). Les crédits de service en cas de manquement sont définis dans la
            documentation contractuelle (voir{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
              docs/enterprise/sla.md
            </code>
            ). Les fenêtres de maintenance planifiée sont annoncées au moins 72 heures à l'avance et
            exclues du calcul d'uptime.
          </p>
        </footer>
      </div>
    </div>
  )
}
