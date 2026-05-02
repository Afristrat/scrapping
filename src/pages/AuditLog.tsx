import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Download, ChevronRight, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuditLog, type AuditLogEntry, type AuditSeverity } from '@/hooks/useAuditLog'
import { useAuditAction } from '@/hooks/useAuditAction'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 6 — S6-AuditLog
// Page /settings/audit : journal d'audit append-only avec filtres + export CSV.
//
// Architecture :
// - useAuditLog (TanStack Query) avec params (action, severity, dates, limit)
// - Pagination simple (incremental "limit") — pas de cursor-based pour Wave 6.A.
//   Suffisant tant que volume < quelques milliers de lignes par org. Migrer
//   vers cursor-based si l'audit log devient lourd (50k+ entrées).
// - Export CSV : génération côté client pur, BOM UTF-8 pour Excel FR, qui
//   logge AUSSI sa propre exécution via `audit.export` (méta-traçabilité).
// =============================================================================

const ACTIONS_LIST = [
  { value: 'all', label: 'Toutes les actions' },
  { value: 'settings.update', label: 'Paramètres modifiés' },
  { value: 'rubric.create', label: 'Rubrique créée' },
  { value: 'rubric.update', label: 'Rubrique modifiée' },
  { value: 'rubric.delete', label: 'Rubrique supprimée' },
  { value: 'admin_prompt.create', label: 'Prompt admin créé' },
  { value: 'admin_prompt.update', label: 'Prompt admin modifié' },
  { value: 'admin_prompt.delete', label: 'Prompt admin supprimé' },
  { value: 'admin_prompt.run', label: 'Prompt admin exécuté' },
  { value: 'api_key.create', label: 'Clé API ajoutée' },
  { value: 'api_key.update', label: 'Clé API mise à jour' },
  { value: 'api_key.delete', label: 'Clé API supprimée' },
  { value: 'member.invite', label: 'Membre invité' },
  { value: 'member.accept', label: 'Invitation acceptée' },
  { value: 'member.remove', label: 'Membre retiré' },
  { value: 'member.role_change', label: 'Rôle changé' },
  { value: 'org.update', label: 'Organisation modifiée' },
  { value: 'org.billing_change', label: 'Changement de facturation' },
  { value: 'signal.delete', label: 'Signal supprimé' },
  { value: 'signal.bulk_delete', label: 'Suppression en masse' },
  { value: 'digest.export', label: 'Brief exporté' },
  { value: 'audit.export', label: 'Audit exporté' },
  { value: 'pipeline.run', label: 'Pipeline lancé' },
  { value: 'pipeline.purge', label: 'Pipeline purgé' },
] as const

const SEVERITY_OPTIONS: ReadonlyArray<{ value: 'all' | AuditSeverity; label: string }> = [
  { value: 'all', label: 'Toutes les sévérités' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Avertissement' },
  { value: 'critical', label: 'Critique' },
]

const SEVERITY_BADGE: Record<AuditSeverity, string> = {
  info: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  warning: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  critical: 'bg-red-100 text-red-800 hover:bg-red-100',
}

const SEVERITY_ICON: Record<AuditSeverity, typeof ShieldCheck> = {
  info: ShieldCheck,
  warning: ShieldAlert,
  critical: ShieldX,
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * Génère un CSV avec BOM UTF-8  pour qu'Excel FR détecte
 * correctement l'encodage et préserve les accents.
 */
function exportToCSV(entries: AuditLogEntry[]): void {
  const headers = [
    'Date (ISO)',
    'Acteur (user_id)',
    'Action',
    'Sévérité',
    'Type d entité',
    'ID entité',
    'Description',
    'Adresse IP',
    'User-Agent',
  ]
  const rows = entries.map((e) => [
    e.created_at,
    e.user_id ?? '',
    e.action,
    e.severity,
    e.entity_type ?? '',
    e.entity_id ?? '',
    e.description ?? '',
    e.ip_address ?? '',
    e.user_agent ?? '',
  ])
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
  // BOM UTF-8  pour qu'Excel FR détecte correctement les accents
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kairos-audit-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}

export default function AuditLog() {
  const orgId = useCurrentOrgId()
  const auditAction = useAuditAction()

  const [actionFilter, setActionFilter] = useState<string>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | AuditSeverity>('all')
  const [userIdFilter, setUserIdFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [limit, setLimit] = useState<number>(200)

  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)

  const queryParams = useMemo(
    () => ({
      orgId,
      action: actionFilter === 'all' ? undefined : actionFilter,
      severity: severityFilter === 'all' ? undefined : severityFilter,
      userId: userIdFilter.trim() || undefined,
      fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
      // Borner toDate à fin-de-journée pour inclure toute la journée sélectionnée
      toDate: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
      limit,
    }),
    [orgId, actionFilter, severityFilter, userIdFilter, fromDate, toDate, limit],
  )

  const { data, isLoading, isFetching } = useAuditLog(queryParams)

  const entries = data ?? []
  const hasMore = entries.length === limit

  const handleExport = (): void => {
    if (entries.length === 0) return
    exportToCSV(entries)
    // Méta-traçabilité : on logge l'export lui-même. Best-effort, ne bloque pas.
    auditAction.mutate({
      action: 'audit.export',
      severity: 'info',
      description: `Export CSV de ${entries.length} entrée(s) du journal d'audit`,
      metadata: {
        exported_count: entries.length,
        filters: {
          action: actionFilter,
          severity: severityFilter,
          fromDate: fromDate || null,
          toDate: toDate || null,
        },
      },
    })
  }

  const resetFilters = (): void => {
    setActionFilter('all')
    setSeverityFilter('all')
    setUserIdFilter('')
    setFromDate('')
    setToDate('')
    setLimit(200)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Journal d'audit</h1>
          <p className="mt-1 text-sm text-slate-500">
            Traçabilité des actions sensibles de votre organisation. Append-only, conforme RGPD
            article 30.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={entries.length === 0 || isLoading}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exporter CSV
        </Button>
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">
              Action
            </label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS_LIST.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">
              Sévérité
            </label>
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v as 'all' | AuditSeverity)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">
              Acteur (user id)
            </label>
            <Input
              type="text"
              placeholder="UUID utilisateur"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">
              Du
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">
              Au
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {isFetching
              ? 'Chargement…'
              : `${entries.length} entrée${entries.length > 1 ? 's' : ''} affichée${entries.length > 1 ? 's' : ''}`}
          </p>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
            Réinitialiser les filtres
          </Button>
        </div>
      </Card>

      {/* Table */}
      {!orgId ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Sélectionnez une organisation pour consulter son journal d'audit.
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-slate-500">
          Aucun audit log dans cette période.
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-32 px-4 py-2.5">Date</th>
                <th className="w-48 px-4 py-2.5">Acteur</th>
                <th className="w-44 px-4 py-2.5">Action</th>
                <th className="w-44 px-4 py-2.5">Entité</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="w-32 px-4 py-2.5">IP</th>
                <th className="w-20 px-4 py-2.5 text-right">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => {
                const SeverityIcon = SEVERITY_ICON[e.severity]
                return (
                  <tr key={e.id} className="align-top hover:bg-slate-50/50">
                    <td
                      className="px-4 py-3 text-xs text-slate-500"
                      title={format(new Date(e.created_at), 'yyyy-MM-dd HH:mm:ss')}
                    >
                      {formatDistanceToNow(new Date(e.created_at), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs text-slate-600"
                      title={e.user_id ?? 'système'}
                    >
                      {e.user_id ? (
                        truncate(e.user_id, 16)
                      ) : (
                        <span className="italic">système</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn('gap-1 font-normal', SEVERITY_BADGE[e.severity])}
                        title={`Sévérité : ${e.severity}`}
                      >
                        <SeverityIcon className="h-3 w-3" />
                        <span className="font-mono text-[11px]">{e.action}</span>
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {e.entity_type ? (
                        <span>
                          <span className="font-medium text-slate-700">{e.entity_type}</span>
                          {e.entity_id && (
                            <span className="ml-1 font-mono text-slate-400" title={e.entity_id}>
                              {truncate(e.entity_id, 12)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {e.description ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs text-slate-500"
                      title={e.user_agent ?? ''}
                    >
                      {e.ip_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEntry(e)}
                        className="h-7 px-2"
                        aria-label="Voir le détail"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination simple : « Plus » charge 200 lignes de plus */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((l) => l + 200)}
            disabled={isFetching}
          >
            {isFetching ? 'Chargement…' : 'Charger 200 entrées de plus'}
          </Button>
        </div>
      )}

      {/* Dialog détail */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-3xl">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge className={cn('font-normal', SEVERITY_BADGE[selectedEntry.severity])}>
                    {selectedEntry.severity}
                  </Badge>
                  <span className="font-mono text-base">{selectedEntry.action}</span>
                </DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedEntry.created_at), 'yyyy-MM-dd HH:mm:ss')}{' '}
                  {selectedEntry.user_id && (
                    <>
                      · acteur : <span className="font-mono">{selectedEntry.user_id}</span>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {selectedEntry.description && (
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Description
                    </h3>
                    <p className="text-slate-700">{selectedEntry.description}</p>
                  </div>
                )}

                {(selectedEntry.entity_type || selectedEntry.entity_id) && (
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Entité
                    </h3>
                    <p className="font-mono text-xs text-slate-600">
                      {selectedEntry.entity_type ?? '?'}
                      {selectedEntry.entity_id ? ` :: ${selectedEntry.entity_id}` : ''}
                    </p>
                  </div>
                )}

                {selectedEntry.diff && (
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Différentiel
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Avant</p>
                        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">
                          {selectedEntry.diff.before === undefined ||
                          selectedEntry.diff.before === null
                            ? '(aucun)'
                            : JSON.stringify(selectedEntry.diff.before, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Après</p>
                        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">
                          {selectedEntry.diff.after === undefined ||
                          selectedEntry.diff.after === null
                            ? '(aucun)'
                            : JSON.stringify(selectedEntry.diff.after, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {selectedEntry.metadata && (
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Métadonnées
                    </h3>
                    <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
                      {JSON.stringify(selectedEntry.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 md:grid-cols-2">
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Adresse IP
                    </h3>
                    <p className="font-mono text-xs text-slate-600">
                      {selectedEntry.ip_address ?? '—'}
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      User-Agent
                    </h3>
                    <p className="font-mono text-xs break-all text-slate-600">
                      {selectedEntry.user_agent ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
