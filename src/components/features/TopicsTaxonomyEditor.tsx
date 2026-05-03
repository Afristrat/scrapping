import { useState, useRef } from 'react'
import { ChevronRight, Pencil, Plus, Trash2, X, Check } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTopicsTaxonomy, type TopicRow } from '@/hooks/useTopicsTaxonomy'

/** Génère un slug depuis un nom (minuscules, tirets) */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface TopicFormValues {
  name: string
  slug: string
  description: string
  parent_id: string
}

const EMPTY_FORM: TopicFormValues = { name: '', slug: '', description: '', parent_id: '' }

export function TopicsTaxonomyEditor() {
  const {
    data: topics = [],
    isLoading,
    createTopic,
    updateTopic,
    deleteTopic,
  } = useTopicsTaxonomy()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TopicFormValues>(EMPTY_FORM)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  // Édition inline du nom
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  if (isLoading) {
    return <div className="text-on-surface-variant text-sm">Chargement des topics…</div>
  }

  /* ── Organisation hiérarchique ─────────────────────────────────────────── */
  const roots = topics.filter((t) => !t.parent_id)
  const children = (parentId: string) => topics.filter((t) => t.parent_id === parentId)

  /* ── Handlers formulaire création ─────────────────────────────────────── */
  const handleNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      name: value,
      slug: slugManuallyEdited ? f.slug : toSlug(value),
    }))
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    setForm((f) => ({ ...f, slug: value }))
  }

  const handleSubmit = () => {
    if (!form.name.trim() || !form.slug.trim()) return
    createTopic.mutate(
      {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        parent_id: form.parent_id || null,
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM)
          setSlugManuallyEdited(false)
          setShowForm(false)
        },
      },
    )
  }

  /* ── Handlers édition inline ───────────────────────────────────────────── */
  const startEditing = (topic: TopicRow) => {
    setEditingId(topic.id)
    setEditingName(topic.name)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const commitEditing = (topic: TopicRow) => {
    const trimmed = editingName.trim()
    if (trimmed && trimmed !== topic.name) {
      updateTopic.mutate({ id: topic.id, name: trimmed })
    }
    setEditingId(null)
  }

  const cancelEditing = () => setEditingId(null)

  /* ── Rendu d'un topic (récursif) ───────────────────────────────────────── */
  const renderTopic = (topic: TopicRow, depth = 0) => {
    const subs = children(topic.id)
    const isEditing = editingId === topic.id

    return (
      <div key={topic.id}>
        <div
          className="border-outline-variant hover:bg-surface-container-low group flex items-center gap-2 rounded-lg border bg-transparent px-3 py-2 transition-colors"
          style={{ marginLeft: depth * 20 }}
        >
          {subs.length > 0 && (
            <ChevronRight className="text-on-surface-variant h-3.5 w-3.5 shrink-0" />
          )}
          {subs.length === 0 && depth > 0 && <span className="w-3.5 shrink-0" />}

          {/* Nom — édition inline */}
          {isEditing ? (
            <div className="flex flex-1 items-center gap-2">
              <Input
                ref={editInputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEditing(topic)
                  if (e.key === 'Escape') cancelEditing()
                }}
                className="h-7 flex-1 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => commitEditing(topic)}
                aria-label="Valider"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={cancelEditing}
                aria-label="Annuler"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <span
              className="text-on-surface flex-1 cursor-pointer text-sm font-medium"
              onDoubleClick={() => startEditing(topic)}
              title="Double-cliquer pour renommer"
            >
              {topic.name}
            </span>
          )}

          {/* Slug */}
          {!isEditing && (
            <span className="text-on-surface-variant hidden text-xs tabular-nums sm:inline">
              {topic.slug}
            </span>
          )}

          {/* Badge Par défaut */}
          {topic.is_seeded && (
            <Badge variant="outline" className="text-xs">
              Par défaut
            </Badge>
          )}

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => startEditing(topic)}
                aria-label={`Renommer ${topic.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive h-7 w-7 p-0"
                    aria-label={`Supprimer ${topic.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer le topic</AlertDialogTitle>
                    <AlertDialogDescription>
                      Voulez-vous supprimer <strong>{topic.name}</strong> ? Cette action est
                      irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteTopic.mutate({ id: topic.id })}
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Sous-topics récursifs */}
        {subs.map((sub) => renderTopic(sub, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + bouton d'ajout */}
      <div className="flex items-center justify-between">
        <p className="text-on-surface-variant text-sm">
          {topics.length === 0
            ? 'Aucun topic configuré.'
            : `${topics.length} topic${topics.length > 1 ? 's' : ''}`}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Fermer' : 'Ajouter topic'}
        </Button>
      </div>

      {/* Formulaire inline de création */}
      {showForm && (
        <div className="border-outline-variant bg-surface-container-low space-y-3 rounded-lg border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Nom */}
            <div className="space-y-1.5">
              <Label htmlFor="topic-name" className="text-xs font-semibold tracking-wide uppercase">
                Nom *
              </Label>
              <Input
                id="topic-name"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex : Agents IA"
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <Label htmlFor="topic-slug" className="text-xs font-semibold tracking-wide uppercase">
                Slug *
              </Label>
              <Input
                id="topic-slug"
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="ex : agents-ia"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label
              htmlFor="topic-description"
              className="text-xs font-semibold tracking-wide uppercase"
            >
              Description
            </Label>
            <Textarea
              id="topic-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description optionnelle du topic…"
              rows={2}
            />
          </div>

          {/* Parent */}
          <div className="space-y-1.5">
            <Label htmlFor="topic-parent" className="text-xs font-semibold tracking-wide uppercase">
              Topic parent
            </Label>
            <Select
              value={form.parent_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, parent_id: v === '__none__' ? '' : v }))
              }
            >
              <SelectTrigger id="topic-parent" className="w-full">
                <SelectValue placeholder="Aucun (topic racine)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun (topic racine)</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setForm(EMPTY_FORM)
                setSlugManuallyEdited(false)
                setShowForm(false)
              }}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!form.name.trim() || !form.slug.trim() || createTopic.isPending}
              onClick={handleSubmit}
              className="bg-primary text-on-primary hover:bg-primary/90"
            >
              {createTopic.isPending ? 'Création…' : 'Créer le topic'}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {topics.length === 0 && !showForm && (
        <div className="border-outline-variant rounded-lg border border-dashed py-10 text-center">
          <p className="text-on-surface-variant text-sm">Aucun topic pour le moment.</p>
          <p className="text-on-surface-variant mt-1 text-xs">
            Cliquez sur « Ajouter topic » pour créer votre première entrée.
          </p>
        </div>
      )}

      {/* Arbre de topics */}
      {topics.length > 0 && (
        <div className="space-y-1">
          {roots.map((t) => renderTopic(t, 0))}
          {/* Topics orphelins (parent supprimé) */}
          {topics
            .filter((t) => t.parent_id && !topics.find((p) => p.id === t.parent_id))
            .map((t) => renderTopic(t, 0))}
        </div>
      )}
    </div>
  )
}
