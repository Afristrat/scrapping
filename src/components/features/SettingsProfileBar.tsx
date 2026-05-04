import { useState } from 'react'
import { Trash2, BookmarkPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  useSettingsProfiles,
  useSaveProfile,
  useApplyProfile,
  useDeleteProfile,
  type SettingsProfile,
} from '@/hooks/useSettingsProfiles'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

interface Props {
  /** Snapshot courant du formulaire, transmis lors d'une sauvegarde de profil. */
  currentSnapshot: SettingsFormValues
  /** Callback déclenché après application d'un profil — doit appeler form.reset(values). */
  onApply: (values: SettingsFormValues) => void
}

export function SettingsProfileBar({ currentSnapshot, onApply }: Props) {
  const { data: profiles = [] } = useSettingsProfiles()
  const saveMutation = useSaveProfile()
  const applyMutation = useApplyProfile()
  const deleteMutation = useDeleteProfile()

  const [selectedId, setSelectedId] = useState<string>('')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [profileName, setProfileName] = useState('')

  const selectedProfile: SettingsProfile | undefined = profiles.find((p) => p.id === selectedId)

  const handleSave = async () => {
    if (!profileName.trim()) return
    await saveMutation.mutateAsync({ name: profileName.trim(), snapshot: currentSnapshot })
    setSaveDialogOpen(false)
    setProfileName('')
  }

  const handleApplyConfirm = async () => {
    if (!selectedProfile) return
    const newValues = await applyMutation.mutateAsync(selectedProfile)
    onApply(newValues)
    setApplyDialogOpen(false)
  }

  const handleDelete = async () => {
    if (!selectedId) return
    await deleteMutation.mutateAsync(selectedId)
    setSelectedId('')
  }

  const handleSelectChange = (value: string) => {
    setSelectedId(value)
    if (value) {
      setApplyDialogOpen(true)
    }
  }

  return (
    <>
      <div className="bg-surface-container border-outline-variant mb-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
        <span className="text-on-surface-variant shrink-0 text-sm font-medium">Profil :</span>

        {profiles.length === 0 ? (
          <span className="text-on-surface-variant text-sm italic">Aucun profil sauvegardé</span>
        ) : (
          <>
            <Select value={selectedId} onValueChange={handleSelectChange}>
              <SelectTrigger className="h-8 w-52 text-sm">
                <SelectValue placeholder="Configuration actuelle" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedId || deleteMutation.isPending}
              onClick={handleDelete}
              className="h-8 gap-1.5 text-sm"
              aria-label="Supprimer le profil sélectionné"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8 gap-1.5 text-sm"
          onClick={() => setSaveDialogOpen(true)}
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Sauvegarder comme profil
        </Button>
      </div>

      {/* Dialog : sauvegarder un nouveau profil */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sauvegarder la configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="profile-name" className="text-on-surface-variant text-sm font-medium">
              Nom du profil
            </label>
            <Input
              id="profile-name"
              placeholder="ex : Veille IA prod, Mode recherche…"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
              maxLength={80}
              autoFocus
            />
            <p className="text-on-surface-variant text-xs">{profileName.length}/80 caractères</p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false)
                setProfileName('')
              }}
            >
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!profileName.trim() || saveMutation.isPending}
              onClick={() => void handleSave()}
              className="bg-primary text-on-primary hover:bg-primary/90"
            >
              {saveMutation.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog : confirmer l'application d'un profil */}
      <AlertDialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Appliquer le profil « {selectedProfile?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vos paramètres actuels seront remplacés par ceux du profil sélectionné. Cette action
              est immédiatement enregistrée en base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setApplyDialogOpen(false)
                setSelectedId('')
              }}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={applyMutation.isPending}
              onClick={() => void handleApplyConfirm()}
              className="bg-primary text-on-primary hover:bg-primary/90"
            >
              {applyMutation.isPending ? 'Application…' : 'Appliquer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
