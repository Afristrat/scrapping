import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, X } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePersonas, type PersonaRow, type PersonaKind } from '@/hooks/usePersonas'

/** Génère un slug depuis un nom */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const KIND_LABELS: Record<PersonaKind, string> = {
  inbox: 'Inbox',
  project: 'Projects',
  hat: 'Hats',
  resource: 'Resources',
}

const KIND_DESCRIPTIONS: Record<PersonaKind, string> = {
  inbox: 'Signaux entrants non encore triés',
  project: 'Projets actifs avec une date de début et de fin',
  hat: 'Chapeaux portés (rôles, angles de lecture)',
  resource: 'Ressources de référence et domaines de connaissance',
}

const ALL_KINDS: PersonaKind[] = ['inbox', 'project', 'hat', 'resource']

interface PersonaFormValues {
  name: string
  key: string
  context_md: string
  date_start: string
  date_end: string
  is_shared: boolean
}

const emptyForm = (): PersonaFormValues => ({
  name: '',
  key: '',
  context_md: '',
  date_start: '',
  date_end: '',
  is_shared: false,
})

export function PersonasEditor() {
  const [showArchived, setShowArchived] = useState(false)
  const {
    data: personas = [],
    isLoading,
    createPersona,
    updatePersona,
    archivePersona,
    deletePersona,
  } = usePersonas(showArchived)

  // État formulaire : { kind | null, isEdit: false } | { id, kind, isEdit: true }
  const [activeForm, setActiveForm] = useState<
    { kind: PersonaKind; isEdit: false } | { id: string; kind: PersonaKind; isEdit: true } | null
  >(null)
  const [form, setForm] = useState<PersonaFormValues>(emptyForm())
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false)

  if (isLoading) {
    return <div className="text-on-surface-variant text-sm">Chargement des personas…</div>
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const byKind = (kind: PersonaKind) => personas.filter((p) => p.kind === kind)

  const openCreateForm = (kind: PersonaKind) => {
    setActiveForm({ kind, isEdit: false })
    setForm(emptyForm())
    setKeyManuallyEdited(false)
  }

  const openEditForm = (persona: PersonaRow) => {
    setActiveForm({ id: persona.id, kind: persona.kind, isEdit: true })
    setForm({
      name: persona.name,
      key: persona.key,
      context_md: persona.context_md ?? '',
      date_start: persona.date_start ?? '',
      date_end: persona.date_end ?? '',
      is_shared: persona.user_id === null,
    })
    setKeyManuallyEdited(true)
  }

  const closeForm = () => {
    setActiveForm(null)
    setForm(emptyForm())
    setKeyManuallyEdited(false)
  }

  const handleNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      name: value,
      key: keyManuallyEdited ? f.key : toSlug(value),
    }))
  }

  const handleKeyChange = (value: string) => {
    setKeyManuallyEdited(true)
    setForm((f) => ({ ...f, key: value }))
  }

  const handleSubmit = () => {
    if (!activeForm) return
    const { name, key, context_md, date_start, date_end, is_shared } = form
    if (!name.trim() || !key.trim()) return

    if (activeForm.isEdit) {
      updatePersona.mutate(
        {
          id: activeForm.id,
          name: name.trim(),
          key: key.trim(),
          context_md: context_md.trim() || null,
          date_start: activeForm.kind === 'project' ? date_start || null : null,
          date_end: activeForm.kind === 'project' ? date_end || null : null,
          is_shared,
        },
        { onSuccess: closeForm },
      )
    } else {
      createPersona.mutate(
        {
          kind: activeForm.kind,
          name: name.trim(),
          key: key.trim(),
          context_md: context_md.trim() || null,
          date_start: activeForm.kind === 'project' ? date_start || null : null,
          date_end: activeForm.kind === 'project' ? date_end || null : null,
          is_shared,
        },
        { onSuccess: closeForm },
      )
    }
  }

  /* ── Rendu d'une section ─────────────────────────────────────────────── */
  const renderSection = (kind: PersonaKind) => {
    const list = byKind(kind)
    const isFormOpen = activeForm?.kind === kind
    const isMutating =
      (createPersona.isPending || updatePersona.isPending) && activeForm?.kind === kind

    return (
      <section key={kind} className="space-y-3">
        {/* En-tête section */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-on-surface text-base font-semibold">{KIND_LABELS[kind]}</h3>
            <p className="text-on-surface-variant mt-0.5 text-xs">{KIND_DESCRIPTIONS[kind]}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => (isFormOpen && !activeForm?.isEdit ? closeForm() : openCreateForm(kind))}
            className="shrink-0 gap-1.5"
          >
            {isFormOpen && !activeForm?.isEdit ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {isFormOpen && !activeForm?.isEdit ? 'Fermer' : 'Nouvelle entrée'}
          </Button>
        </div>

        {/* Formulaire inline */}
        {isFormOpen && (
          <PersonaForm
            kind={kind}
            form={form}
            isMutating={isMutating}
            isEdit={activeForm?.isEdit ?? false}
            onNameChange={handleNameChange}
            onKeyChange={handleKeyChange}
            onFieldChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        )}

        {/* Liste des personas */}
        {list.length === 0 && !isFormOpen ? (
          <div className="border-outline-variant rounded-lg border border-dashed py-6 text-center">
            <p className="text-on-surface-variant text-sm">Aucune entrée dans cette section.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {list.map((persona) => {
              const isEditingThis = activeForm?.isEdit && activeForm.id === persona.id
              return (
                <div
                  key={persona.id}
                  className={[
                    'border-outline-variant group flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors',
                    persona.is_archived ? 'opacity-60' : 'hover:bg-surface-container-low',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface flex-1 text-sm font-medium">
                      {persona.name}
                    </span>

                    {/* Badges */}
                    <span className="text-on-surface-variant hidden text-xs tabular-nums sm:inline">
                      {persona.key}
                    </span>
                    {persona.user_id === null && (
                      <Badge variant="outline" className="text-xs">
                        Partagée
                      </Badge>
                    )}
                    {persona.is_archived && (
                      <Badge variant="outline" className="text-on-surface-variant text-xs">
                        Archivée
                      </Badge>
                    )}

                    {/* Actions */}
                    {!isEditingThis && (
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => openEditForm(persona)}
                          aria-label={`Modifier ${persona.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() =>
                            archivePersona.mutate({
                              id: persona.id,
                              archived: !persona.is_archived,
                            })
                          }
                          aria-label={persona.is_archived ? 'Désarchiver' : 'Archiver'}
                        >
                          {persona.is_archived ? (
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive h-7 w-7 p-0"
                              aria-label={`Supprimer ${persona.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer la persona</AlertDialogTitle>
                              <AlertDialogDescription>
                                Voulez-vous supprimer définitivement <strong>{persona.name}</strong>{' '}
                                ? Cette action est irréversible.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deletePersona.mutate({ id: persona.id })}
                              >
                                Supprimer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>

                  {/* context_md résumé */}
                  {persona.context_md && (
                    <p className="text-on-surface-variant line-clamp-2 text-xs leading-relaxed">
                      {persona.context_md}
                    </p>
                  )}

                  {/* Dates pour Projects */}
                  {kind === 'project' && (persona.date_start || persona.date_end) && (
                    <p className="text-on-surface-variant text-xs">
                      {persona.date_start ?? '?'} → {persona.date_end ?? '?'}
                    </p>
                  )}

                  {/* Formulaire d'édition inline */}
                  {isEditingThis && (
                    <div className="mt-2">
                      <PersonaForm
                        kind={kind}
                        form={form}
                        isMutating={isMutating}
                        isEdit={true}
                        onNameChange={handleNameChange}
                        onKeyChange={handleKeyChange}
                        onFieldChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
                        onSubmit={handleSubmit}
                        onCancel={closeForm}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  /* ── Rendu principal ─────────────────────────────────────────────────── */
  return (
    <div className="space-y-8">
      {/* Toggle affichage archivées */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-archived"
          checked={showArchived}
          onCheckedChange={(v) => setShowArchived(!!v)}
        />
        <Label htmlFor="show-archived" className="cursor-pointer text-sm">
          Afficher les personas archivées
        </Label>
      </div>

      {ALL_KINDS.map(renderSection)}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sous-composant : formulaire persona                                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface PersonaFormProps {
  kind: PersonaKind
  form: PersonaFormValues
  isMutating: boolean
  isEdit: boolean
  onNameChange: (v: string) => void
  onKeyChange: (v: string) => void
  onFieldChange: (field: keyof PersonaFormValues, value: string | boolean) => void
  onSubmit: () => void
  onCancel: () => void
}

function PersonaForm({
  kind,
  form,
  isMutating,
  isEdit,
  onNameChange,
  onKeyChange,
  onFieldChange,
  onSubmit,
  onCancel,
}: PersonaFormProps) {
  return (
    <div className="border-outline-variant bg-surface-container-low space-y-3 rounded-lg border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Nom */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold tracking-wide uppercase">Nom *</Label>
          <Input
            value={form.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="ex : Analyse concurrentielle"
          />
        </div>

        {/* Clé */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold tracking-wide uppercase">Clé *</Label>
          <Input
            value={form.key}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="ex : analyse-concurrentielle"
          />
        </div>
      </div>

      {/* Dates (uniquement pour Projects) */}
      {kind === 'project' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wide uppercase">Date de début</Label>
            <Input
              type="date"
              value={form.date_start}
              onChange={(e) => onFieldChange('date_start', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wide uppercase">Date de fin</Label>
            <Input
              type="date"
              value={form.date_end}
              onChange={(e) => onFieldChange('date_end', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Contexte */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold tracking-wide uppercase">Contexte (Markdown)</Label>
        <Textarea
          value={form.context_md}
          onChange={(e) => onFieldChange('context_md', e.target.value)}
          placeholder="Contexte, instructions ou notes sur cette persona…"
          rows={3}
        />
      </div>

      {/* Partagée org */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="persona-shared"
          checked={form.is_shared}
          onCheckedChange={(v) => onFieldChange('is_shared', !!v)}
        />
        <Label htmlFor="persona-shared" className="cursor-pointer text-sm">
          Partagée avec toute l'organisation
        </Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!form.name.trim() || !form.key.trim() || isMutating}
          onClick={onSubmit}
          className="bg-primary text-on-primary hover:bg-primary/90"
        >
          {isMutating ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer'}
        </Button>
      </div>
    </div>
  )
}
