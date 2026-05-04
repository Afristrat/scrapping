import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  ListChecks,
  Mail,
  Plus,
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
// Wave 7.5 — Refonte design Material You / Stitch Kairos.
// Sécurité (gates frontend + edge fn) inchangée. Re-skin uniquement.
// =============================================================================

const SEGMENT_LABELS: Record<OrgSegment, string> = {
  vc_pe: 'VC / PE',
  legal: 'Avocats',
  newsletter: 'Newsletter',
  brand: 'Brand',
  cto_sme: 'CTO / PME',
  solo: 'Solo',
}

// Palette Recharts alignée Material You — tokens primaires/secondaires/tertiaires
const SEGMENT_COLORS: Record<OrgSegment, string> = {
  vc_pe: '#006948',
  legal: '#0051d5',
  newsletter: '#9b3e3b',
  brand: '#ba5551',
  cto_sme: '#316bf3',
  solo: '#3d4a42',
}

const ALERT_META: Record<
  AlertType,
  { label: string; icon: typeof AlertTriangle; toneClasses: string }
> = {
  outlier_consumption: {
    label: 'Consommation outlier',
    icon: AlertTriangle,
    toneClasses: 'border-tertiary-fixed bg-tertiary-fixed/40 text-on-tertiary-fixed-variant',
  },
  low_margin: {
    label: 'Marge faible',
    icon: AlertOctagon,
    toneClasses: 'border-error/40 bg-error-container text-on-error-container',
  },
  expired_invitation: {
    label: 'Invitation en attente',
    icon: Clock,
    toneClasses: 'border-outline-variant bg-surface-container-low text-on-surface-variant',
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
      <div className="border-error/40 bg-error-container text-on-error-container rounded-xl border p-6 text-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="text-error mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Échec du chargement des métriques admin.</p>
            <p className="mt-1 text-xs">{metricsQuery.error.message}</p>
            <Button
              size="sm"
              variant="outline"
              className="border-outline-variant text-on-surface mt-3"
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
    <div className="mx-auto w-full max-w-[80rem] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-on-surface text-2xl font-semibold tracking-[-0.01em]">
            Cockpit admin Kairos
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Vue cross-tenant — réservée aux super-admins de la plateforme.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-on-surface-variant text-xs">
            Mis à jour : {new Date(generated_at).toLocaleTimeString('fr-FR')}
          </p>
          <Link to="/admin/queue">
            <Button
              size="sm"
              variant="outline"
              className="border-outline-variant text-on-surface gap-1.5 rounded-lg"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Queue enrichissement
            </Button>
          </Link>
          <Link to="/admin/csm">
            <Button
              size="sm"
              className="bg-primary text-on-primary hover:bg-primary/90 gap-1.5 rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
              Onboarder un client
            </Button>
          </Link>
        </div>
      </header>

      {/* A. KPI Cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="MRR total"
          value={`€${kpis.total_revenue_30d.toLocaleString('fr-FR')}`}
          tone="primary"
          hint={`${kpis.total_active_subs} abonnements actifs`}
        />
        <KpiCard
          label="ARR projeté"
          value={`€${kpis.arr_projected.toLocaleString('fr-FR')}`}
          tone="secondary"
          hint="MRR × 12"
        />
        <KpiCard
          label="Tenants actifs"
          value={String(kpis.total_tenants)}
          tone="neutral"
          hint={`${kpis.total_active_subs} avec sub`}
        />
        <KpiCard
          label="Marge brute 30j"
          value={`${kpis.gross_margin_30d_pct.toFixed(1)} %`}
          tone={
            kpis.gross_margin_30d_pct >= 90
              ? 'primary'
              : kpis.gross_margin_30d_pct >= 75
                ? 'tertiary'
                : 'error'
          }
          hint={`COG : €${kpis.total_cog_30d.toLocaleString('fr-FR')}`}
          tooltip="Marge brute = (Revenue − Apify − LLM) / Revenue. Calculée sur les 30 derniers jours."
        />
      </section>

      {/* B. Alertes */}
      <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
        <CardHeader>
          <CardTitle className="text-on-surface text-base font-semibold">
            Alertes ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && (
            <p className="text-on-surface-variant text-sm">
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
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{meta.label}</p>
                    <p className="mt-0.5 text-xs">{alert.msg}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedAlert(alert)}
                  className="border-outline-variant text-on-surface bg-surface-container-lowest"
                >
                  Action
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* C. Tableau Tenants */}
      <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
        <CardHeader>
          <CardTitle className="text-on-surface text-base font-semibold">
            Tenants ({tenantsSorted.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-outline-variant overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold tracking-[0.05em] uppercase">
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
              <tbody className="divide-outline-variant divide-y">
                {tenantsSorted.map((t) => (
                  <tr
                    key={t.org_id}
                    className={cn(
                      'hover:bg-surface-container-low cursor-pointer transition-colors',
                      marginRowClass(t.margin_pct),
                    )}
                    onClick={() => setSelectedTenant(t)}
                  >
                    <td className="text-on-surface px-3 py-2 font-medium">{t.org_name}</td>
                    <td className="text-on-surface-variant px-3 py-2 text-xs">
                      {SEGMENT_LABELS[t.segment]}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-xs uppercase">{t.plan}</td>
                    <td className="text-on-surface-variant px-3 py-2 text-xs uppercase">
                      {t.billing_mode}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-right font-mono text-xs">
                      {t.members}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-right font-mono text-xs">
                      {t.signals_30d.toLocaleString('fr-FR')}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-right font-mono text-xs">
                      {t.apify_cost_30d.toFixed(2)}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-right font-mono text-xs">
                      {t.llm_cost_30d.toFixed(2)}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-right font-mono text-xs font-medium">
                      {t.revenue_30d.toFixed(2)}
                    </td>
                    <td className="text-on-surface px-3 py-2 text-right font-mono text-xs font-medium">
                      {t.margin_pct.toFixed(1)} %
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-on-surface-variant hover:text-on-surface"
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
                    <td
                      colSpan={11}
                      className="text-on-surface-variant px-3 py-8 text-center text-sm"
                    >
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
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface text-base font-semibold">
              MRR par segment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MrrSegmentChart kpis={kpis} />
          </CardContent>
        </Card>
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface text-base font-semibold">
              Répartition ARR
            </CardTitle>
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
              <div className="border-outline-variant bg-surface-container-low text-on-surface-variant rounded-lg border p-3 text-xs">
                <p>
                  <span className="text-on-surface font-medium">Tenant : </span>
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
                  <Button className="bg-primary text-on-primary hover:bg-primary-container">
                    <Mail className="mr-2 h-4 w-4" aria-hidden="true" /> Contacter le CSM
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
      <div className="bg-error-container text-on-error-container mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="text-on-surface mt-4 text-xl font-semibold tracking-[-0.01em]">
        Accès refusé
      </h1>
      <p className="text-on-surface-variant mt-2 text-sm">
        Cette page est réservée aux administrateurs de la plateforme Kairos. Si vous pensez avoir
        besoin d’y accéder, contactez votre référent Kairos.
      </p>
      <Link to="/dashboard">
        <Button className="bg-primary text-on-primary hover:bg-primary-container mt-6 h-11 rounded-lg">
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
  tone: 'primary' | 'secondary' | 'tertiary' | 'error' | 'neutral'
  tooltip?: string
}

function KpiCard({ label, value, hint, tone, tooltip }: KpiCardProps): React.ReactElement {
  const toneClasses: Record<KpiCardProps['tone'], string> = {
    primary: 'text-primary',
    secondary: 'text-secondary-container',
    tertiary: 'text-tertiary',
    error: 'text-error',
    neutral: 'text-on-surface',
  }
  const Icon = tone === 'error' || tone === 'tertiary' ? TrendingDown : TrendingUp
  return (
    <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
            {label}
          </p>
          <Icon className={cn('h-4 w-4', toneClasses[tone])} aria-hidden="true" />
        </div>
        <p
          className={cn(
            'mt-2 text-2xl font-semibold tracking-[-0.01em] tabular-nums',
            toneClasses[tone],
          )}
          title={tooltip}
        >
          {value}
        </p>
        {hint && <p className="text-on-surface-variant mt-1 text-xs">{hint}</p>}
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
        'hover:bg-surface-container cursor-pointer px-3 py-2.5 select-none',
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
        {active && <Arrow className="h-3 w-3" aria-hidden="true" />}
      </span>
    </th>
  )
}

function marginRowClass(marginPct: number): string {
  if (marginPct >= 90) return 'bg-primary-fixed/10'
  if (marginPct >= 75) return ''
  if (marginPct >= 50) return 'bg-tertiary-fixed/30'
  return 'bg-error-container/40'
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): React.ReactElement {
  return (
    <div className="border-outline-variant bg-surface-container-low rounded-lg border px-3 py-2">
      <p className="text-on-surface-variant text-xs">{label}</p>
      <p className="text-on-surface mt-0.5 font-medium">{value}</p>
    </div>
  )
}

interface MrrChartProps {
  kpis: { mrr_by_segment: Record<OrgSegment, number> }
}

function MrrSegmentChart({ kpis }: MrrChartProps): React.ReactElement {
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
        <CartesianGrid strokeDasharray="3 3" stroke="#bccac0" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#3d4a42' }} />
        <YAxis tick={{ fontSize: 11, fill: '#3d4a42' }} tickFormatter={(v) => `€${v}`} />
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
      <p className="text-on-surface-variant py-8 text-center text-sm">
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
