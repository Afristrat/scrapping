import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SettingsDiff } from '@/lib/settings-diff'

interface SettingsDiffDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  diff: SettingsDiff[]
}

export function SettingsDiffDialog({ open, onConfirm, onCancel, diff }: SettingsDiffDialogProps) {
  const hasChanges = diff.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel()
      }}
    >
      <DialogContent showCloseButton className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirmer les modifications</DialogTitle>
          <DialogDescription>
            {hasChanges
              ? 'Vérifiez les changements ci-dessous avant de sauvegarder.'
              : 'Aucun changement détecté par rapport aux paramètres actuels.'}
          </DialogDescription>
        </DialogHeader>

        {hasChanges ? (
          <div className="border-outline-variant overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant border-outline-variant border-b">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                    Champ
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                    Avant
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                    Après
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.map((item, idx) => (
                  <tr
                    key={item.field}
                    className={idx % 2 === 0 ? 'bg-surface' : 'bg-surface-container-lowest'}
                  >
                    <td className="text-on-surface px-4 py-3 font-medium whitespace-nowrap">
                      {item.label}
                    </td>
                    <td className="text-on-surface-variant max-w-[200px] px-4 py-3">
                      <span className="bg-error/10 text-error inline-block rounded px-1.5 py-0.5 font-mono text-xs break-all">
                        {item.before}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="bg-primary/10 text-primary inline-block rounded px-1.5 py-0.5 font-mono text-xs break-all">
                        {item.after}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-on-surface-variant py-4 text-center text-sm">
            Aucun changement détecté.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!hasChanges}
            onClick={onConfirm}
            className="bg-primary text-on-primary hover:bg-primary/90"
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
