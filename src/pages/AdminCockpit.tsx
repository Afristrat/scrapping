import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Mail,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminMetricsForbiddenError,
  useAdminMetrics,
  type AdminAlert,
  type AlertType,
  type OrgSegment,
  type TenantMetrics,
} from '@/hooks/useAdminMetrics'
import { useIsAppAdmin } from '@/hooks/useIsAppAdmin'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 6 — Sub-wave 6.4 — Story S6-AdminCockpit
//
// Page /admin réservée aux super-admins Kairos (app_admins). Offre un
// panorama opérationnel cross-tenant : COG, marge brute, MRR/ARR par
// segment, alertes outliers / low-margin / invitations expirées.
//
// Sécurité : double gate (cf. CLAUDE.md règle fondamentale).
//   1. Hook `useIsAppAdmin()` côté frontend → cache l'UI aux non-admins.
//   2. Edge fn `admin-metrics` re-vérifie `is_app_admin()` → 403 si bypass.
// Le frontend n'est JAMAIS source de vérité — il reste une UX layer.
// =============================================================================

const SEGMENT_LABELS: Record<OrgSegment, string> = {
  vc_pe: 'VC / PE',
  legal: 'Avocats',
  newsletter: 'Newsletter',
  brand: 'Brand',
  cto_sme: 'CTO / PME',
  solo: 'Solo',
}

const SEGMENT_COLORS: Record<OrgSegment, string> = {
  vc_pe: '#10b981',
  legal: '#6366f1',
  newsletter: '#f59e0b',
  brand: '#ec4899',
  cto_sme: '#3b82f6',
  solo: '#64748b',
}

const ALERT_META: Record<
  AlertType,
  { label: string; icon: typeof AlertTriangle; toneClasses: string }
> = {
  outlier_consumption: {
    label: 'Consommation outlier',
    icon: AlertTriangle,
    toneClasses: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  low_margin: {
    label: 'Marge faible',
    icon: AlertOctagon,
    toneClasses: 'border-red-200 bg-red-50 text-red-900',
  },
  expired_invitation: {
    label: 'Invitation en attente',
    icon: Clock,
    toneClasses: 'border-slate-200 bg-slate-50 text-slate-700',
  },
}

type SortKey = keyof Pick<
  TenantMetrics,
  | 'org_name'
  | 'segment'
  | 'plan'
  | 'billing_mode'
  | 'members'
  | 'signals_30d'
  | 'apify_cost_30d'
  | 'llm_cost_30d'
  | 'revenue_30d'
  | 'margin_pct'
>

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

export default function AdminCockpit(): React.ReactElement {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin()
  const metricsQuery = useAdminMetrics()

  // Hooks d'état toujours appelés (avant tout return conditionnel) afin de
  // respecter les règles des hooks React.
  const [sort, setSort] = useState<SortState>({ key: 'revenue_30d', dir: 'desc' })
  const [selectedAlert, setSelectedAlert] = useState<AdminAlert | null>(null)
  const [selectedTenant, setSelectedTenant] = useState<TenantMetrics | null>(null)

  const tenantsSorted = useMemo(() => {
    if (!metricsQuery.data) return []
    const items = [...metricsQuery.data.tenants]
    items.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return items
  }, [metricsQuery.data, sort])

  // ---- Gate frontend ----
  if (isAdminLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!isAdmin) {
    return <AccessDeniedView />
  }

  if (metricsQuery.isError) {
    if (metricsQuery.error instanceof AdminMetricsForbiddenError) {
      return <AccessDeniedView />
    }
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Échec du chargement des métriques admin.</p>
            <p className="mt-1 text-xs text-red-700">{metricsQuery.error.message}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => metricsQuery.refetch()}
            >
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (metricsQuery.isLoading || !metricsQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const { kpis, alerts, generated_at } = metricsQuery.data

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Cockpit admin Kairos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vue cross-tenant — réservée aux super-admins de la plateforme.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Mis à jour : {new Date(generated_at).toLocaleTimeString('fr-FR')}
        </p>
      </header>

      {/* A. KPI Cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="MRR total"
          value={`€${kpis.total_revenue_30d.toLocaleString('fr-FR')}`}
          tone="emerald"
          hint={`${kpis.total_active_subs} abonnements actifs`}
        />
        <KpiCard
          label="ARR projeté"
          value={`€${kpis.arr_projected.toLocaleString('fr-FR')}`}
          tone="indigo"
          hint="MRR × 12"
        />
        <KpiCard
          label="Tenants actifs"
          value={String(kpis.total_tenants)}
          tone="slate"
          hint={`${kpis.total_active_subs} avec sub`}
        />
        <KpiCard
          label="Marge brute 30j"
          value={`${kpis.gross_margin_30d_pct.toFixed(1)} %`}
          tone={
            kpis.gross_margin_30d_pct >= 90
              ? 'emerald'
              : kpis.gross_margin_30d_pct >= 75
                ? 'amber'
                : 'red'
          }
          hint={`COG : €${kpis.total_cog_30d.toLocaleString('fr-FR')}`}
          tooltip="Marge brute = (Revenue − Apify − LLM) / Revenue. Calculée sur les 30 derniers jours."
        />
      </section>

      {/* B. Alertes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertes ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && (
            <p className="text-sm text-slate-500">
              Aucune alerte en cours. Tout est sous contrôle.
            </p>
          )}
          {alerts.map((alert, idx) => {
            const meta = ALERT_META[alert.type]
            const Icon = meta.icon
            return (
              <div
                key={`${alert.type}-${alert.org_id}-${idx}`}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-lg border p-3 text-sm',
                  meta.toneClasses,
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">{meta.label}</p>
                    <p className="mt-0.5 text-xs">{alert.msg}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedAlert(alert)}>
                  Action
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* C. Tableau Tenants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenants ({tenantsSorted.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <SortHeader sort={sort} setSort={setSort} colKey="org_name">
                    Organisation
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="segment">
                    Segment
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="plan">
                    Plan
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="billing_mode">
                    Mode
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="members" align="right">
                    Membres
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="signals_30d" align="right">
                    Signaux 30j
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="apify_cost_30d" align="right">
                    Apify €
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="llm_cost_30d" align="right">
                    LLM €
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="revenue_30d" align="right">
                    Revenu 30j
                  </SortHeader>
                  <SortHeader sort={sort} setSort={setSort} colKey="margin_pct" align="right">
                    Marge %
                  </SortHeader>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenantsSorted.map((t) => (
                  <tr
                    key={t.org_id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-slate-50',
                      marginRowClass(t.margin_pct),
                    )}
                    onClick={() => setSelectedTenant(t)}
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">{t.org_name}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {SEGMENT_LABELS[t.segment]}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700 uppercase">{t.plan}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 uppercase">{t.billing_mode}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{t.members}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {t.signals_30d.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {t.apify_cost_30d.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {t.llm_cost_30d.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                      {t.revenue_30d.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                      {t.margin_pct.toFixed(1)} %
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTenant(t)
                        }}
                      >
                        Détail
                      </Button>
                    </td>
                  </tr>
                ))}
                {tenantsSorted.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-500">
                      Aucun tenant à afficher.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* D. Charts */}
      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MRR par segment</CardTitle>
          </CardHeader>
          <CardContent>
            <MrrSegmentChart kpis={kpis} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition ARR</CardTitle>
          </CardHeader>
          <CardContent>
            <ArrPieChart kpis={kpis} />
          </CardContent>
        </Card>
      </section>

      {/* Dialog alerte */}
      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent>
          {selectedAlert && (
            <>
              <DialogHeader>
                <DialogTitle>{ALERT_META[selectedAlert.type].label}</DialogTitle>
                <DialogDescription>{selectedAlert.msg}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  <span className="font-medium text-slate-700">Tenant : </span>
                  <code>{selectedAlert.org_id}</code>
                </p>
                <p className="mt-2">
                  Action recommandée :{' '}
                  {selectedAlert.type === 'low_margin'
                    ? 'Vérifier la clé BYOK ou contacter le client pour upgrade de plan.'
                    : selectedAlert.type === 'outlier_consumption'
                      ? 'Investiguer la source du pic de consommation. Possible bug ou usage non prévu.'
                      : 'Relancer le destinataire ou révoquer l’invitation.'}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                  Fermer
                </Button>
                <a
                  href={`mailto:csm@kairos.example?subject=${encodeURIComponent(
                    `[Kairos] ${ALERT_META[selectedAlert.type].label}`,
                  )}`}
                >
                  <Button>
                    <Mail className="mr-2 h-4 w-4" /> Contacter le CSM
                  </Button>
                </a>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog tenant détail */}
      <Dialog open={!!selectedTenant} onOpenChange={(open) => !open && setSelectedTenant(null)}>
        <DialogContent className="sm:max-w-xl">
          {selectedTenant && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTenant.org_name}</DialogTitle>
                <DialogDescription>
                  {SEGMENT_LABELS[selectedTenant.segment]} ·{' '}
                  <span className="uppercase">{selectedTenant.plan}</span> ·{' '}
                  <span className="uppercase">{selectedTenant.billing_mode}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailRow label="Membres" value={selectedTenant.members.toString()} />
                <DetailRow
                  label="Signaux 30j"
                  value={selectedTenant.signals_30d.toLocaleString('fr-FR')}
                />
                <DetailRow
                  label="Apify 30j"
                  value={`€${selectedTenant.apify_cost_30d.toFixed(2)}`}
                />
                <DetailRow label="LLM 30j" value={`€${selectedTenant.llm_cost_30d.toFixed(2)}`} />
                <DetailRow label="Revenu 30j" value={`€${selectedTenant.revenue_30d.toFixed(2)}`} />
                <DetailRow
                  label="Marge"
                  value={`€${selectedTenant.margin_30d.toFixed(2)} (${selectedTenant.margin_pct.toFixed(1)} %)`}
                />
                <DetailRow
                  label="Z-score signaux"
                  value={selectedTenant.outlier_score.toFixed(2)}
                />
                <DetailRow
                  label="ID"
                  value={<code className="text-xs">{selectedTenant.org_id}</code>}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTenant(null)}>
                  Fermer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================================
// Sub-composants
// =============================================================================

function AccessDeniedView(): React.ReactElement {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldAlert className="mx-auto h-12 w-12 text-slate-400" />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Accès refusé</h1>
      <p className="mt-2 text-sm text-slate-600">
        Cette page est réservée aux administrateurs de la plateforme Kairos.
      </p>
      <Link to="/dashboard">
        <Button className="mt-6" variant="default">
          Retour au dashboard
        </Button>
      </Link>
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  tone: 'emerald' | 'indigo' | 'amber' | 'red' | 'slate'
  tooltip?: string
}

function KpiCard({ label, value, hint, tone, tooltip }: KpiCardProps): React.ReactElement {
  const toneClasses: Record<KpiCardProps['tone'], string> = {
    emerald: 'text-emerald-600',
    indigo: 'text-indigo-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    slate: 'text-slate-700',
  }
  const Icon = tone === 'red' || tone === 'amber' ? TrendingDown : TrendingUp
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
          <Icon className={cn('h-4 w-4', toneClasses[tone])} />
        </div>
        <p className={cn('mt-2 text-2xl font-semibold', toneClasses[tone])} title={tooltip}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

interface SortHeaderProps {
  sort: SortState
  setSort: (s: SortState) => void
  colKey: SortKey
  align?: 'left' | 'right'
  children: React.ReactNode
}

function SortHeader({
  sort,
  setSort,
  colKey,
  align = 'left',
  children,
}: SortHeaderProps): React.ReactElement {
  const active = sort.key === colKey
  const Arrow = active && sort.dir === 'asc' ? ArrowUpRight : ArrowDownRight
  return (
    <th
      className={cn(
        'cursor-pointer px-3 py-2.5 select-none hover:bg-slate-100',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => {
        if (active) {
          setSort({ key: colKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
        } else {
          setSort({ key: colKey, dir: 'desc' })
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <Arrow className="h-3 w-3" />}
      </span>
    </th>
  )
}

function marginRowClass(marginPct: number): string {
  if (marginPct >= 90) return 'bg-emerald-50/40'
  if (marginPct >= 75) return ''
  if (marginPct >= 50) return 'bg-amber-50/60'
  return 'bg-red-50/70'
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): React.ReactElement {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  )
}

interface MrrChartProps {
  kpis: { mrr_by_segment: Record<OrgSegment, number> }
}

function MrrSegmentChart({ kpis }: MrrChartProps): React.ReactElement {
  // Pas d'historique disponible côté backend pour cette story (on n'a que le
  // snapshot courant). On simule donc une projection 12 mois en plat — quand
  // un historique sera disponible (Wave 6.5), on pourra hydrater de vraies
  // séries temporelles.
  const segments = Object.keys(kpis.mrr_by_segment) as OrgSegment[]
  const months = ['M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'M0']
  const data = months.map((m) => {
    const row: Record<string, string | number> = { month: m }
    for (const seg of segments) {
      row[seg] = kpis.mrr_by_segment[seg]
    }
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
        <Tooltip formatter={(v) => `€${Number(v).toFixed(0)}`} />
        <Legend />
        {segments.map((seg) => (
          <Line
            key={seg}
            type="monotone"
            dataKey={seg}
            stroke={SEGMENT_COLORS[seg]}
            strokeWidth={2}
            name={SEGMENT_LABELS[seg]}
            dot={{ r: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function ArrPieChart({ kpis }: MrrChartProps): React.ReactElement {
  const segments = Object.keys(kpis.mrr_by_segment) as OrgSegment[]
  const data = segments
    .map((seg) => ({ name: SEGMENT_LABELS[seg], seg, value: kpis.mrr_by_segment[seg] * 12 }))
    .filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Aucun ARR à afficher (aucun abonnement actif).
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={90}
          label={(entry: { name?: string; value?: number }) =>
            `${entry.name ?? ''} (€${(entry.value ?? 0).toFixed(0)})`
          }
        >
          {data.map((d) => (
            <Cell key={d.seg} fill={SEGMENT_COLORS[d.seg]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => `€${Number(v).toLocaleString('fr-FR')}`} />
      </PieChart>
    </ResponsiveContainer>
  )
}
