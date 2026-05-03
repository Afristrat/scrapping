import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
} from '@/components/ui/alert-dialog'
import { ConsensusBadge } from '@/components/features/ConsensusBadge'
import { ScoreCell } from '@/components/features/ScoreCell'
import { SOURCE_META } from '@/lib/source-meta'
import { cn } from '@/lib/utils'
import { useDeleteSignal, useDeleteSignalsBulk, type SignalRow } from '@/hooks/useSignals'

interface Props {
  rows: SignalRow[] | undefined
  isLoading: boolean
  onRowClick: (row: SignalRow) => void
  /**
   * Nom de la rubrique de scoring active. Affichée dans le tooltip de
   * `<ScoreCell>`. Optionnel — si null, la ligne « Rubrique » est masquée.
   */
  activeRubricName?: string | null
  /**
   * Id du dernier signal re-scoré par un bouton bulk parent (e.g. Dashboard).
   * Quand cet id correspond à une row, sa cellule Score flashe ~1.5s.
   * Le set est passé pour permettre au flash de s'appliquer simultanément
   * à plusieurs lignes après un re-score bulk.
   */
  flashedSignalIds?: ReadonlySet<string>
}

export function SignalTable({
  rows,
  isLoading,
  onRowClick,
  activeRubricName,
  flashedSignalIds,
}: Props) {
  // --- Sélection multiple + suppression (S-DashDelete) ---
  const [rawSelected, setRawSelected] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const deleteOne = useDeleteSignal()
  const deleteBulk = useDeleteSignalsBulk()

  // Sélection effective = ids encore présents dans la liste courante.
  // Les ids qui ont disparu (filtre, refetch, suppression) sont auto-purgés.
  const visibleIds = useMemo(() => new Set((rows ?? []).map((r) => r.id)), [rows])
  const selected = useMemo(() => {
    const next = new Set<string>()
    for (const id of rawSelected) {
      if (visibleIds.has(id)) next.add(id)
    }
    return next
  }, [rawSelected, visibleIds])

  const allSelected = (rows?.length ?? 0) > 0 && selected.size === (rows?.length ?? 0)
  const someSelected = selected.size > 0 && !allSelected
  const headerCheckboxState: boolean | 'indeterminate' = allSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false

  const toggleAll = (checked: boolean | 'indeterminate'): void => {
    if (checked === true) {
      setRawSelected(new Set((rows ?? []).map((r) => r.id)))
    } else {
      setRawSelected(new Set())
    }
  }

  const toggleOne = (id: string, checked: boolean | 'indeterminate'): void => {
    setRawSelected((prev) => {
      const next = new Set(prev)
      if (checked === true) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const clearSelection = (): void => setRawSelected(new Set())

  const handleConfirmDeleteOne = (): void => {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    deleteOne.mutate(id, {
      onSuccess: () => {
        setRawSelected((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setConfirmDeleteId(null)
      },
      onError: () => setConfirmDeleteId(null),
    })
  }

  const handleConfirmBulkDelete = (): void => {
    const ids = Array.from(selected)
    if (ids.length === 0) {
      setConfirmBulkDelete(false)
      return
    }
    deleteBulk.mutate(ids, {
      onSuccess: () => {
        setRawSelected(new Set())
        setConfirmBulkDelete(false)
      },
      onError: () => setConfirmBulkDelete(false),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="border-outline-variant bg-surface-container-low flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-12 text-center">
        <p className="text-on-surface text-base font-medium">Aucun signal</p>
        <p className="text-on-surface-variant text-sm">
          Clique « Run pipeline » pour ingérer les sources.
        </p>
      </div>
    )
  }

  const selectionCount = selected.size

  return (
    <div className="space-y-2">
      {/* Barre d'actions bulk — sticky en haut quand sélection > 0 */}
      {selectionCount > 0 && (
        <div className="bg-inverse-surface text-inverse-on-surface sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm shadow-md">
          <span className="font-semibold">
            {selectionCount > 1
              ? `${selectionCount} signaux sélectionnés`
              : `${selectionCount} signal sélectionné`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              disabled={deleteBulk.isPending}
              className="border-outline text-inverse-on-surface hover:bg-outline/40 hover:text-inverse-on-surface bg-transparent"
            >
              Désélectionner tout
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={deleteBulk.isPending}
              className="bg-error-container text-on-error-container hover:bg-error-container/80 gap-1"
            >
              {deleteBulk.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Supprimer la sélection
            </Button>
          </div>
        </div>
      )}

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-surface-container text-on-surface-variant border-outline-variant border-b text-left text-xs font-semibold tracking-[0.05em] uppercase">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={headerCheckboxState}
                  onCheckedChange={toggleAll}
                  aria-label="Sélectionner tous les signaux"
                />
              </th>
              <th className="w-20 px-4 py-3">Score</th>
              <th className="w-24 px-4 py-3">Source</th>
              <th className="px-4 py-3">Titre</th>
              <th className="w-32 px-4 py-3">Date contenu</th>
              <th className="w-32 px-4 py-3">Scrapé</th>
              <th className="w-40 px-4 py-3">Modèle</th>
              <th className="w-12 px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-outline-variant/40 divide-y">
            {rows.map((r) => {
              const { label, badgeClass } = SOURCE_META[r.source]
              const isSelected = selected.has(r.id)
              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r)}
                  className={cn(
                    'group/row hover:bg-surface-container-high/60 even:bg-surface-container-low/40 cursor-pointer transition-colors',
                    isSelected && 'bg-primary-fixed/30',
                  )}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleOne(r.id, checked)}
                      aria-label={`Sélectionner le signal ${r.title ?? r.id}`}
                    />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-start gap-1">
                      <ScoreCell
                        signalId={r.id}
                        score={r.score}
                        reasoning={r.reasoning}
                        modelUsed={r.model_used}
                        scoredAt={r.scored_at}
                        rubricName={activeRubricName ?? null}
                        flashToken={flashedSignalIds?.has(r.id) ? flashedSignalIds : null}
                      />
                      <ConsensusBadge signalId={r.id} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        'rounded-full border-transparent px-2 py-0.5 text-xs font-medium',
                        badgeClass,
                      )}
                    >
                      {label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-on-surface line-clamp-2 font-medium">
                        {r.title ?? '(sans titre)'}
                      </span>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-on-surface-variant hover:text-primary shrink-0"
                          aria-label="Ouvrir la source"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="text-on-surface-variant px-4 py-3 text-xs">
                    {r.signal_date ? (
                      <span title={new Date(r.signal_date).toLocaleString('fr-FR')}>
                        {formatDistanceToNow(new Date(r.signal_date), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </span>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                  </td>
                  <td className="text-on-surface-variant px-4 py-3 text-xs">
                    {formatDistanceToNow(new Date(r.scraped_at), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </td>
                  <td className="text-on-surface-variant px-4 py-3 font-mono text-xs">
                    {r.model_used ?? <span className="text-outline">—</span>}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(r.id)}
                      aria-label="Supprimer ce signal"
                      className="text-error hover:bg-error-container hover:text-on-error-container h-7 w-7 p-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmation suppression unitaire */}
      <AlertDialog
        open={confirmDeleteId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce signal ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action irréversible. Le signal et son score associé seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOne.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDeleteOne()
              }}
              disabled={deleteOne.isPending}
              className={cn('bg-error text-on-error hover:bg-error/90 gap-1 shadow-sm')}
            >
              {deleteOne.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression bulk */}
      <AlertDialog
        open={confirmBulkDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmBulkDelete(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectionCount > 1
                ? `Supprimer ${selectionCount} signaux ?`
                : `Supprimer ${selectionCount} signal ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Action irréversible. Les signaux sélectionnés et leurs scores associés seront
              définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBulk.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmBulkDelete()
              }}
              disabled={deleteBulk.isPending}
              className={cn('bg-error text-on-error hover:bg-error/90 gap-1 shadow-sm')}
            >
              {deleteBulk.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
