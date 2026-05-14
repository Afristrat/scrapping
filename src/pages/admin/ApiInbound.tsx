import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsAppAdmin } from '@/hooks/useIsAppAdmin'
import {
  computeSessionDurationMs,
  failedStageOf,
  useResearchSessionDetail,
  useResearchSessions,
  type ResearchLogRow,
  type ResearchSessionFilters,
  type ResearchSessionListItem,
  type ResearchStatus,
  type ResearchTelemetryStage,
} from '@/hooks/useResearchSessions'
import { cn } from '@/lib/utils'

// =============================================================================
// /admin/api-inbound — Observabilité du pipeline research-from-seed (Bassira).
//
// Pure read : la page ne touche ni au pipeline edge fn, ni aux mutations
// research_sessions. Toutes les écritures restent côté service_role.
// =============================================================================

const STATUS_LABEL: Record<ResearchStatus, string> = {
  pending: 'En attente',
  running: 'En cours',
  completed: 'Terminé',
  failed: 'Échec',
  timeout: 'Timeout',
}

const STATUS_BADGE_CLASS: Record<ResearchStatus, string> = {
  pending: 'border-outline-variant bg-surface-container text-on-surface-variant',
  running: 'border-primary/40 bg-primary-fixed text-on-primary-fixed',
  completed: 'border-primary/30 bg-primary-container text-on-primary-container',
  failed: 'border-error/40 bg-error-container text-on-error-container',
  timeout: 'border-tertiary-fixed bg-tertiary-fixed/40 text-on-tertiary-fixed-variant',
}

const STATUS_OPTIONS: ReadonlyArray<{ value: 'all' | ResearchStatus; label: string }> = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'running', label: 'En cours' },
  { value: 'pending', label: 'En attente' },
  { value: 'completed', label: 'Terminés' },
  { value: 'failed', label: 'Échecs' },
  { value: 'timeout', label: 'Timeouts' },
]

const DEFAULT_FILTERS: ResearchSessionFilters = {
  status: 'all',
  keyPrefix: '',
  search: '',
}

// =============================================================================
// Composant principal
// =============================================================================

export default function ApiInbound(): React.ReactElement {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin()

  const [filters, setFilters] = useState<ResearchSessionFilters>(DEFAULT_FILTERS)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const sessionsQuery = useResearchSessions(filters)
  const detailQuery = useResearchSessionDetail(selectedSessionId)

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const activeCount = useMemo(
    () => sessions.filter((s) => s.status === 'pending' || s.status === 'running').length,
    [sessions],
  )
  const failedCount = useMemo(
    () => sessions.filter((s) => s.status === 'failed' || s.status === 'timeout').length,
    [sessions],
  )

  if (isAdminLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!isAdmin) {
    return <AccessDeniedView />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="text-primary h-6 w-6" aria-hidden="true" />
          <div>
            <h1 className="text-on-surface text-2xl font-semibold tracking-[-0.01em]">
              API Inbound — research-from-seed
            </h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              Observabilité live · polling 3 s tant qu&apos;une session est active
            </p>
          </div>
          {activeCount > 0 && (
            <Badge className="bg-primary text-on-primary ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
              {activeCount} actif{activeCount > 1 ? 's' : ''}
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge className="bg-error-container text-on-error-container ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {failedCount} échec{failedCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="border-outline-variant text-on-surface gap-1.5"
          onClick={() => sessionsQuery.refetch()}
          disabled={sessionsQuery.isFetching}
        >
          {sessionsQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Rafraîchir
        </Button>
      </header>

      {/* Filtres */}
      <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div>
            <label className="text-on-surface-variant mb-1.5 block text-xs font-medium">
              Statut
            </label>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((f) => ({ ...f, status: value as ResearchSessionFilters['status'] }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-on-surface-variant mb-1.5 block text-xs font-medium">
              Préfixe clé API
            </label>
            <Input
              placeholder="ex. bsr_fdc0"
              value={filters.keyPrefix}
              onChange={(e) => setFilters((f) => ({ ...f, keyPrefix: e.target.value }))}
              className="font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-on-surface-variant mb-1.5 block text-xs font-medium">
              Recherche dans seed
            </label>
            <div className="relative">
              <Search
                className="text-on-surface-variant absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                placeholder="ex. Réforme Code du travail"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="pl-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <SessionsTable
        sessions={sessions}
        isLoading={sessionsQuery.isLoading}
        isError={sessionsQuery.isError}
        errorMessage={sessionsQuery.error?.message}
        onRowClick={setSelectedSessionId}
      />

      {/* Drawer détail */}
      <Sheet
        open={selectedSessionId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSessionId(null)
        }}
      >
        <SheetContent side="right" className="bg-surface w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="text-on-surface text-base font-semibold">
              Détail de la session
            </SheetTitle>
            <SheetDescription className="text-on-surface-variant text-xs">
              Mise à jour automatique toutes les 3 s tant que la session est active.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {detailQuery.isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : detailQuery.isError ? (
              <p className="text-error text-sm">Erreur : {detailQuery.error.message}</p>
            ) : detailQuery.data ? (
              <DetailPanel session={detailQuery.data.session} logs={detailQuery.data.logs} />
            ) : (
              <p className="text-on-surface-variant py-8 text-center text-sm">
                Session introuvable ou expirée (TTL 24 h).
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// =============================================================================
// Table des sessions
// =============================================================================

interface SessionsTableProps {
  sessions: ResearchSessionListItem[]
  isLoading: boolean
  isError: boolean
  errorMessage: string | undefined
  onRowClick: (id: string) => void
}

function SessionsTable({
  sessions,
  isLoading,
  isError,
  errorMessage,
  onRowClick,
}: SessionsTableProps): React.ReactElement {
  return (
    <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-on-surface text-base font-semibold">
          50 dernières sessions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <div className="border-error/40 bg-error-container text-on-error-container flex items-center gap-3 rounded-lg border p-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Erreur : {errorMessage ?? 'inconnue'}</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-on-surface-variant flex items-center gap-2 py-6 text-sm">
            <CheckCircle2 className="text-primary h-5 w-5" aria-hidden="true" />
            <p>Aucune session ne correspond aux filtres.</p>
          </div>
        ) : (
          <div className="border-outline-variant overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold tracking-[0.05em] uppercase">
                <tr>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5">Créée</th>
                  <th className="px-3 py-2.5">Clé</th>
                  <th className="px-3 py-2.5">Lang</th>
                  <th className="px-3 py-2.5">Profil</th>
                  <th className="px-3 py-2.5 text-right">Durée</th>
                  <th className="px-3 py-2.5">Stage KO</th>
                  <th className="px-3 py-2.5">Seed</th>
                </tr>
              </thead>
              <tbody className="divide-outline-variant divide-y">
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} onClick={() => onRowClick(s.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface SessionRowProps {
  session: ResearchSessionListItem
  onClick: () => void
}

function SessionRow({ session, onClick }: SessionRowProps): React.ReactElement {
  const durationMs = computeSessionDurationMs(session)
  const stage = failedStageOf(session)
  const seedPreview = session.seed.length > 60 ? session.seed.slice(0, 60) + '…' : session.seed

  return (
    <tr
      className="hover:bg-surface-container-low cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-3 py-2">
        <StatusBadge status={session.status} />
      </td>
      <td className="text-on-surface-variant px-3 py-2 text-xs whitespace-nowrap">
        {formatDateTime(session.created_at)}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {session.api_key?.key_prefix ?? <span className="text-on-surface-variant">—</span>}
      </td>
      <td className="text-on-surface-variant px-3 py-2 text-xs">{session.lang.toUpperCase()}</td>
      <td className="text-on-surface-variant px-3 py-2 text-xs">{session.output_profile ?? '—'}</td>
      <td className="text-on-surface-variant px-3 py-2 text-right font-mono text-xs tabular-nums">
        {formatDuration(durationMs)}
      </td>
      <td className="px-3 py-2 text-xs">
        {stage ? (
          <span className="text-error font-mono">{stage}</span>
        ) : (
          <span className="text-on-surface-variant">—</span>
        )}
      </td>
      <td className="text-on-surface max-w-md px-3 py-2 text-xs" title={session.seed}>
        {seedPreview}
      </td>
    </tr>
  )
}

// =============================================================================
// Panel détail (Sheet content)
// =============================================================================

interface DetailPanelProps {
  session: ResearchSessionListItem
  logs: ResearchLogRow[]
}

function DetailPanel({ session, logs }: DetailPanelProps): React.ReactElement {
  const stages = session.telemetry?.stages ?? []
  const totalDuration = session.telemetry?.total_duration_ms
  const totalCost = session.telemetry?.total_cost_usd

  return (
    <div className="space-y-5 pt-2">
      {/* Métadonnées header */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={session.status} />
          <span className="text-on-surface-variant font-mono text-xs">
            {session.id.slice(0, 8)}…
          </span>
        </div>
        <dl className="text-on-surface-variant grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <Meta label="Créée" value={formatDateTime(session.created_at)} />
          <Meta
            label="Terminée"
            value={session.completed_at ? formatDateTime(session.completed_at) : '—'}
          />
          <Meta label="Lang" value={session.lang.toUpperCase()} />
          <Meta label="Profil" value={session.output_profile ?? '—'} />
          <Meta label="Sector hint" value={session.sector_hint ?? '—'} />
          <Meta
            label="Depth hint"
            value={session.depth_hint !== null ? String(session.depth_hint) : '—'}
          />
          <Meta
            label="Clé API"
            value={
              session.api_key?.name
                ? `${session.api_key.name} (${session.api_key.key_prefix ?? '?'})`
                : (session.api_key?.key_prefix ?? '—')
            }
          />
          <Meta
            label="Durée totale"
            value={
              typeof totalDuration === 'number'
                ? formatDuration(totalDuration)
                : formatDuration(computeSessionDurationMs(session))
            }
          />
          {typeof totalCost === 'number' && (
            <Meta label="Coût" value={`$${totalCost.toFixed(4)}`} />
          )}
        </dl>
      </section>

      {/* Seed */}
      <Section title="Seed">
        <pre className="bg-surface-container-low text-on-surface max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
          {session.seed}
        </pre>
      </Section>

      {/* Stages télémétrie */}
      {stages.length > 0 && (
        <Section title={`Pipeline (${stages.length} stages)`}>
          <ul className="space-y-1.5">
            {stages.map((stage, idx) => (
              <StageRow key={`${stage.name}-${idx}`} stage={stage} />
            ))}
          </ul>
        </Section>
      )}

      {/* Erreur */}
      {session.error_detail && (
        <Section title="Erreur">
          <div className="border-error/40 bg-error-container text-on-error-container space-y-2 rounded-lg border p-3 text-xs">
            {session.error_detail.stage && (
              <p>
                <span className="font-semibold">Stage : </span>
                <span className="font-mono">{session.error_detail.stage}</span>
              </p>
            )}
            {session.error_detail.error && (
              <p>
                <span className="font-semibold">Message : </span>
                {session.error_detail.error}
              </p>
            )}
            {session.error_detail.detail !== undefined && (
              <details>
                <summary className="cursor-pointer font-semibold">Détail</summary>
                <pre className="mt-1 max-h-48 overflow-auto text-[11px] whitespace-pre-wrap">
                  {safeStringify(session.error_detail.detail)}
                </pre>
              </details>
            )}
            {Array.isArray(session.error_detail.upstream_errors) &&
              session.error_detail.upstream_errors.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-semibold">
                    Upstream errors ({session.error_detail.upstream_errors.length})
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto text-[11px] whitespace-pre-wrap">
                    {safeStringify(session.error_detail.upstream_errors)}
                  </pre>
                </details>
              )}
          </div>
        </Section>
      )}

      {/* Résultat */}
      {session.result && (
        <Section title="Résultat">
          <details>
            <summary className="text-on-surface-variant cursor-pointer text-xs">
              Voir le JSON complet
            </summary>
            <pre className="bg-surface-container-low text-on-surface mt-2 max-h-96 overflow-auto rounded-lg p-3 text-[11px] whitespace-pre-wrap">
              {safeStringify(session.result)}
            </pre>
          </details>
        </Section>
      )}

      {/* Logs liés */}
      <Section
        title={`Logs liés (${logs.length})`}
        hint="Filtrés par fenêtre temporelle de la session et actions du pipeline."
      >
        {logs.length === 0 ? (
          <p className="text-on-surface-variant text-xs">Aucun log lié trouvé.</p>
        ) : (
          <ul className="border-outline-variant divide-outline-variant max-h-72 divide-y overflow-y-auto rounded-lg border">
            {logs.map((log) => (
              <li key={log.id} className="p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{log.action}</span>
                  {log.status && (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[10px]',
                        log.status === 'ok' || log.status === 'success'
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-error-container text-on-error-container',
                      )}
                    >
                      {log.status}
                    </span>
                  )}
                  <span className="text-on-surface-variant ml-auto">{formatTime(log.ts)}</span>
                </div>
                {log.payload && Object.keys(log.payload).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-on-surface-variant cursor-pointer text-[11px]">
                      payload
                    </summary>
                    <pre className="bg-surface-container-low mt-1 max-h-40 overflow-auto rounded p-2 text-[10px] whitespace-pre-wrap">
                      {safeStringify(log.payload)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

// =============================================================================
// Sous-composants & helpers
// =============================================================================

function StatusBadge({ status }: { status: ResearchStatus }): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        STATUS_BADGE_CLASS[status],
      )}
    >
      {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      {status === 'completed' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
      {(status === 'failed' || status === 'timeout') && (
        <XCircle className="h-3 w-3" aria-hidden="true" />
      )}
      {status === 'pending' && <Clock className="h-3 w-3" aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

function StageRow({ stage }: { stage: ResearchTelemetryStage }): React.ReactElement {
  return (
    <li
      className={cn(
        'border-outline-variant flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
        stage.ok ? 'bg-surface-container-low' : 'border-error/40 bg-error-container/50',
      )}
    >
      {stage.ok ? (
        <CheckCircle2 className="text-primary h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="text-error h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="text-on-surface font-mono">{stage.name}</span>
      {typeof stage.duration_ms === 'number' && (
        <span className="text-on-surface-variant ml-auto font-mono tabular-nums">
          {formatDuration(stage.duration_ms)}
        </span>
      )}
    </li>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section>
      <h3 className="text-on-surface mb-2 text-xs font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {hint && <p className="text-on-surface-variant mb-2 text-[11px]">{hint}</p>}
      {children}
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <>
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-on-surface font-mono">{value}</dd>
    </>
  )
}

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
        Cette page est réservée aux administrateurs Kairos. Contactez votre référent si vous pensez
        avoir besoin d&apos;y accéder.
      </p>
      <Link to="/dashboard">
        <Button className="bg-primary text-on-primary hover:bg-primary-container mt-6 h-11 rounded-lg">
          Retour au dashboard
        </Button>
      </Link>
    </div>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return `${minutes} m ${rest.toString().padStart(2, '0')} s`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
