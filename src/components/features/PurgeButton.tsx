import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePurge, type PurgeScope } from '@/hooks/usePurge'

export function PurgeButton() {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<PurgeScope>('signals')
  const purge = usePurge()

  const handleConfirm = () => {
    purge.mutate(
      { scope },
      {
        onSuccess: () => setOpen(false),
      },
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="default"
        onClick={() => setOpen(true)}
        className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 className="h-4 w-4" />
        Purger
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Purger les données
            </DialogTitle>
            <DialogDescription>
              Action irréversible. Choisis l'étendue de la suppression.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
              <input
                type="radio"
                name="scope"
                value="signals"
                checked={scope === 'signals'}
                onChange={() => setScope('signals')}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-slate-900">Signaux uniquement</p>
                <p className="text-xs text-slate-500">
                  Supprime tous les signaux scrapés et leurs scores. Garde les logs, coûts et
                  briefs.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-slate-900">Tout (reset complet)</p>
                <p className="text-xs text-slate-500">
                  Supprime signaux, scores, logs, coûts et briefs. Tes paramètres et clés API sont
                  conservés.
                </p>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={purge.isPending}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={purge.isPending}
              className="gap-2"
            >
              {purge.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {purge.isPending ? 'Suppression…' : 'Confirmer la purge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
