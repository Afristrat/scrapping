import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronRight, Download, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
// Wave 7.5 — Refonte design Material You / Stitch Kairos.
// Logique conservée : filtres, export CSV, dialog détail JSON.
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
  info: 'bg-secondary-fixed text-on-secondary-fixed-variant hover:bg-secondary-fixed',
  warning: 'bg-tertiary-fixed text-on-tertiary-fixed-variant hover:bg-tertiary-fixed',
  critical: 'bg-error-container text-on-error-container hover:bg-error-container',
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
  // BOM UTF-8 pour qu'Excel FR détecte correctement les accents
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
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

export default function AuditLog(): React.ReactElement {
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-on-surface text-2xl font-semibold tracking-[-0.01em]">
            Journal d’audit
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Traçabilité des actions sensibles de votre organisation. Append-only, conforme RGPD
            article&nbsp;30.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={entries.length === 0 || isLoading}
          className="border-outline-variant text-on-surface h-10 gap-2 rounded-lg"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter CSV
        </Button>
      </header>

      {/* Filtres */}
      <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-on-surface-variant mb-1 block text-xs font-semibold tracking-[0.05em] uppercase">
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
              <label className="text-on-surface-variant mb-1 block text-xs font-semibold tracking-[0.05em] uppercase">
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
              <label className="text-on-surface-variant mb-1 block text-xs font-semibold tracking-[0.05em] uppercase">
                Acteur (user id)
              </label>
              <Input
                type="text"
                placeholder="UUID utilisateur"
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
                className="border-outline-variant bg-surface-container-lowest h-10 w-full rounded-lg"
              />
            </div>

            <div>
              <label className="text-on-surface-variant mb-1 block text-xs font-semibold tracking-[0.05em] uppercase">
                Du
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border-outline-variant bg-surface-container-lowest h-10 w-full rounded-lg"
              />
            </div>

            <div>
              <label className="text-on-surface-variant mb-1 block text-xs font-semibold tracking-[0.05em] uppercase">
                Au
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border-outline-variant bg-surface-container-lowest h-10 w-full rounded-lg"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-on-surface-variant text-xs">
              {isFetching
                ? 'Chargement…'
                : `${entries.length} entrée${entries.length > 1 ? 's' : ''} affichée${entries.length > 1 ? 's' : ''}`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-on-surface-variant text-xs"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {!orgId ? (
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border p-8 text-center shadow-md">
          <p className="text-on-surface-variant text-sm">
            Sélectionnez une organisation pour consulter son journal d’audit.
          </p>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border border-dashed p-8 text-center">
          <p className="text-on-surface-variant text-sm">Aucun audit log dans cette période.</p>
        </Card>
      ) : (
        <Card className="bg-surface-container-lowest border-outline-variant overflow-hidden rounded-xl border shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold tracking-[0.05em] uppercase">
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
              <tbody className="divide-outline-variant divide-y">
                {entries.map((e) => {
                  const SeverityIcon = SEVERITY_ICON[e.severity]
                  return (
                    <tr key={e.id} className="hover:bg-surface-container-low align-top">
                      <td
                        className="text-on-surface-variant px-4 py-3 text-xs"
                        title={format(new Date(e.created_at), 'yyyy-MM-dd HH:mm:ss')}
                      >
                        {formatDistanceToNow(new Date(e.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </td>
                      <td
                        className="text-on-surface-variant px-4 py-3 font-mono text-xs"
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
                          <SeverityIcon className="h-3 w-3" aria-hidden="true" />
                          <span className="font-mono text-[11px]">{e.action}</span>
                        </Badge>
                      </td>
                      <td className="text-on-surface-variant px-4 py-3 text-xs">
                        {e.entity_type ? (
                          <span>
                            <span className="text-on-surface font-medium">{e.entity_type}</span>
                            {e.entity_id && (
                              <span
                                className="text-on-surface-variant ml-1 font-mono"
                                title={e.entity_id}
                              >
                                {truncate(e.entity_id, 12)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="text-on-surface px-4 py-3 text-xs">
                        {e.description ?? <span className="text-on-surface-variant">—</span>}
                      </td>
                      <td
                        className="text-on-surface-variant px-4 py-3 font-mono text-xs"
                        title={e.user_agent ?? ''}
                      >
                        {e.ip_address ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEntry(e)}
                          className="text-on-surface-variant hover:text-on-surface h-7 px-2"
                          aria-label="Voir le détail"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination simple */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((l) => l + 200)}
            disabled={isFetching}
            className="border-outline-variant text-on-surface"
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
                    <h3 className="text-on-surface-variant mb-1 text-xs font-semibold tracking-[0.05em] uppercase">
                      Description
                    </h3>
                    <p className="text-on-surface">{selectedEntry.description}</p>
                  </div>
                )}

                {(selectedEntry.entity_type || selectedEntry.entity_id) && (
                  <div>
                    <h3 className="text-on-surface-variant mb-1 text-xs font-semibold tracking-[0.05em] uppercase">
                      Entité
                    </h3>
                    <p className="text-on-surface-variant font-mono text-xs">
                      {selectedEntry.entity_type ?? '?'}
                      {selectedEntry.entity_id ? ` :: ${selectedEntry.entity_id}` : ''}
                    </p>
                  </div>
                )}

                {selectedEntry.diff && (
                  <div>
                    <h3 className="text-on-surface-variant mb-1 text-xs font-semibold tracking-[0.05em] uppercase">
                      Différentiel
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-on-surface-variant mb-1 text-xs">Avant</p>
                        <pre className="bg-surface-container-low text-on-surface max-h-64 overflow-auto rounded p-2 text-xs">
                          {selectedEntry.diff.before === undefined ||
                          selectedEntry.diff.before === null
                            ? '(aucun)'
                            : JSON.stringify(selectedEntry.diff.before, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-on-surface-variant mb-1 text-xs">Après</p>
                        <pre className="bg-surface-container-low text-on-surface max-h-64 overflow-auto rounded p-2 text-xs">
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
                    <h3 className="text-on-surface-variant mb-1 text-xs font-semibold tracking-[0.05em] uppercase">
                      Métadonnées
                    </h3>
                    <pre className="bg-surface-container-low text-on-surface max-h-48 overflow-auto rounded p-2 text-xs">
                      {JSON.stringify(selectedEntry.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="border-outline-variant grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
                  <div>
                    <h3 className="text-on-surface-variant mb-1 text-xs font-semibold tracking-[0.05em] uppercase">
                      Adresse IP
                    </h3>
                    <p className="text-on-surface-variant font-mono text-xs">
                      {selectedEntry.ip_address ?? '—'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-on-surface-variant mb-1 text-xs font-semibold tracking-[0.05em] uppercase">
                      User-Agent
                    </h3>
                    <p className="text-on-surface-variant font-mono text-xs break-all">
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
