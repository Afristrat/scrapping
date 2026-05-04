import { useState } from 'react'
import { ListChecks, RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useQueueStats,
  useFailedJobs,
  useRetryJob,
  useRetryAllFailed,
  type PassKind,
  type PassStats,
} from '@/hooks/usePendingEnrichments'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 10C — Story S-10C.6 — Page /admin/queue
// Monitoring de la queue d'enrichissement + retry failed jobs
// =============================================================================

const PASS_KIND_LABELS: Record<PassKind, string> = {
  entities: 'Entités',
  reputation: 'Réputation',
  clustering: 'Clustering',
  neo4j_push: 'Neo4j Push',
}

export default function QueueMonitor(): React.ReactElement {
  const statsQuery = useQueueStats()
  const failedQuery = useFailedJobs()
  const retryJob = useRetryJob()
  const retryAll = useRetryAllFailed()

  const [retryingId, setRetryingId] = useState<string | null>(null)

  // Calcul du total pending toutes passes confondues
  const totalPending = statsQuery.data
    ? Object.values(statsQuery.data).reduce((acc, s) => acc + s.pending, 0)
    : 0

  const failedJobs = failedQuery.data ?? []

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleRetryJob(id: string) {
    setRetryingId(id)
    retryJob.mutate(id, {
      onSettled: () => setRetryingId(null),
    })
  }

  function handleRetryAll() {
    retryAll.mutate()
  }

  return (
    <div className="mx-auto w-full max-w-[80rem] space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ListChecks className="text-primary h-6 w-6" aria-hidden="true" />
          <div>
            <h1 className="text-on-surface text-2xl font-semibold tracking-[-0.01em]">
              Queue d&apos;enrichissement
            </h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              Monitoring en temps réel · rafraîchissement toutes les 30 s
            </p>
          </div>
          {totalPending > 0 && (
            <Badge className="bg-primary text-on-primary ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {totalPending} en attente
            </Badge>
          )}
        </div>

        {failedJobs.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-error/40 text-error hover:bg-error-container gap-1.5"
                disabled={retryAll.isPending}
              >
                {retryAll.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Réessayer tous les échecs ({failedJobs.length})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Réessayer tous les jobs échoués ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action va remettre{' '}
                  <strong>
                    {failedJobs.length} job{failedJobs.length > 1 ? 's' : ''}
                  </strong>{' '}
                  en statut <em>pending</em> avec un compteur d&apos;essais remis à zéro. Ils seront
                  retraités lors du prochain cycle d&apos;enrichissement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-error text-on-error hover:bg-error/90"
                  onClick={handleRetryAll}
                >
                  Confirmer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </header>

      {/* KPI Cards — 4 pass_kinds */}
      {statsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : statsQuery.isError ? (
        <div className="border-error/40 bg-error-container text-on-error-container flex items-center gap-3 rounded-xl border p-4 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Erreur lors du chargement des statistiques : {statsQuery.error.message}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {(Object.keys(PASS_KIND_LABELS) as PassKind[]).map((kind) => {
            const stats = statsQuery.data?.[kind] ?? {
              pending: 0,
              in_progress: 0,
              completed: 0,
              failed: 0,
            }
            return <PassKindCard key={kind} kind={kind} stats={stats} />
          })}
        </div>
      )}

      {/* Table des jobs échoués */}
      <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-on-surface text-base font-semibold">
            Jobs échoués
            {failedJobs.length > 0 && (
              <span className="text-error ml-2 text-sm font-normal">({failedJobs.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {failedQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : failedQuery.isError ? (
            <p className="text-on-surface-variant text-sm">Erreur : {failedQuery.error.message}</p>
          ) : failedJobs.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm">
              <CheckCircle2 className="text-primary h-5 w-5" aria-hidden="true" />
              <p className="text-on-surface-variant">Aucun job en échec. Tout est sain.</p>
            </div>
          ) : (
            <div className="border-outline-variant overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold tracking-[0.05em] uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Signal ID</th>
                    <th className="px-3 py-2.5">Pass</th>
                    <th className="px-3 py-2.5 text-right">Essais</th>
                    <th className="px-3 py-2.5">Dernière erreur</th>
                    <th className="px-3 py-2.5">Planifié</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-outline-variant divide-y">
                  {failedJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-surface-container-low transition-colors">
                      {/* Signal ID — lien relatif vers explorer */}
                      <td className="px-3 py-2">
                        <a
                          href={`/explorer?signal=${job.signal_id}`}
                          className="text-primary font-mono text-xs hover:underline"
                          title={job.signal_id}
                        >
                          {job.signal_id.slice(0, 8)}&hellip;
                        </a>
                      </td>

                      {/* pass_kind */}
                      <td className="px-3 py-2">
                        <span className="bg-surface-container text-on-surface-variant rounded px-1.5 py-0.5 text-xs font-medium">
                          {PASS_KIND_LABELS[job.pass_kind as PassKind] ?? job.pass_kind}
                        </span>
                      </td>

                      {/* attempts */}
                      <td className="text-error px-3 py-2 text-right font-mono text-xs font-semibold">
                        {job.attempts}
                      </td>

                      {/* last_error tronqué à 80 chars */}
                      <td
                        className="text-on-surface-variant max-w-xs truncate px-3 py-2 text-xs"
                        title={job.last_error ?? '—'}
                      >
                        {job.last_error
                          ? job.last_error.length > 80
                            ? job.last_error.slice(0, 80) + '…'
                            : job.last_error
                          : '—'}
                      </td>

                      {/* scheduled_at */}
                      <td className="text-on-surface-variant px-3 py-2 text-xs">
                        {new Date(job.scheduled_at).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      {/* Bouton retry */}
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-outline-variant text-on-surface gap-1.5 text-xs"
                          disabled={retryingId === job.id || retryJob.isPending}
                          onClick={() => handleRetryJob(job.id)}
                          aria-label={`Réessayer le job ${job.id.slice(0, 8)}`}
                        >
                          {retryingId === job.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          )}
                          Réessayer
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// Sub-composant : carte KPI d'une pass_kind
// =============================================================================

interface PassKindCardProps {
  kind: PassKind
  stats: PassStats
}

function PassKindCard({ kind, stats }: PassKindCardProps): React.ReactElement {
  const hasFailed = stats.failed > 0

  return (
    <Card
      className={cn(
        'border-outline-variant rounded-xl border shadow-md',
        hasFailed ? 'bg-error-container/30 border-error/30' : 'bg-surface-container-lowest',
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-on-surface text-sm font-semibold">
          {PASS_KIND_LABELS[kind]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <StatRow
          icon={<Clock className="h-3.5 w-3.5" />}
          label="En attente"
          value={stats.pending}
          className="text-on-surface-variant"
        />
        <StatRow
          icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
          label="En cours"
          value={stats.in_progress}
          className="text-primary"
        />
        <StatRow
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Terminés"
          value={stats.completed}
          className="text-primary"
        />
        <StatRow
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="Échecs"
          value={stats.failed}
          className={hasFailed ? 'text-error font-bold' : 'text-on-surface-variant'}
        />
      </CardContent>
    </Card>
  )
}

interface StatRowProps {
  icon: React.ReactNode
  label: string
  value: number
  className?: string
}

function StatRow({ icon, label, value, className }: StatRowProps): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-between text-xs', className)}>
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  )
}
