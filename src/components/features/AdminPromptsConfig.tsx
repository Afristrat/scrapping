import { useState } from 'react'
import { Pencil, Play, History, Trash2, Plus, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  useAdminPrompts,
  useAdminPromptRuns,
  useUpsertAdminPrompt,
  useDeleteAdminPrompt,
  useRunAdminPrompt,
  type AdminPrompt,
  type AdminPromptTaskKind,
} from '@/hooks/useAdminPrompts'
import { cn } from '@/lib/utils'

const TASK_BADGE: Record<AdminPromptTaskKind, { label: string; cls: string }> = {
  'moat:reddit': { label: 'Moat: Reddit', cls: 'bg-orange-100 text-orange-800' },
  'moat:arxiv': { label: 'Moat: arXiv', cls: 'bg-cyan-100 text-cyan-800' },
  'moat:x': { label: 'Moat: X', cls: 'bg-indigo-100 text-indigo-800' },
  'moat:synthesis': { label: 'Moat: Synthesis', cls: 'bg-emerald-100 text-emerald-800' },
  custom: { label: 'Custom', cls: 'bg-slate-100 text-slate-700' },
}

type RunningState = {
  prompt: AdminPrompt
  output: string | null
  status: 'pending' | 'done' | 'error'
  error?: string
}

export function AdminPromptsConfig() {
  const { data: prompts, isLoading } = useAdminPrompts()
  const [editing, setEditing] = useState<AdminPrompt | null>(null)
  const [creating, setCreating] = useState(false)
  const [running, setRunning] = useState<RunningState | null>(null)
  const [historyFor, setHistoryFor] = useState<AdminPrompt | null>(null)

  const runMutation = useRunAdminPrompt()
  const deleteMutation = useDeleteAdminPrompt()

  if (isLoading) return <div className="text-xs text-muted-foreground">Chargement…</div>

  const handleRun = async (p: AdminPrompt): Promise<void> => {
    setRunning({ prompt: p, output: null, status: 'pending' })
    try {
      const result = await runMutation.mutateAsync({ prompt_id: p.id })
      setRunning({
        prompt: p,
        output: result.content ?? '(pas de contenu)',
        status: 'done',
      })
    } catch (err) {
      setRunning({
        prompt: p,
        output: null,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleDelete = (p: AdminPrompt): void => {
    if (p.is_seed) return
    if (!confirm(`Supprimer le prompt "${p.name}" ?`)) return
    deleteMutation.mutate({ id: p.id })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Bibliothèque de prompts d'analyse Moat Hunter, exécutables sur ton corpus de signaux. 4
          seeds pré-installés + tes prompts custom.
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="h-3 w-3" /> Nouveau prompt
        </Button>
      </div>

      <div className="space-y-2">
        {(prompts ?? []).map((p) => {
          const badge = TASK_BADGE[p.task_kind]
          return (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded font-semibold',
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                    {p.is_seed && (
                      <span className="text-[10px] text-muted-foreground">seed</span>
                    )}
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(p)}
                    title="Éditer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      void handleRun(p)
                    }}
                    disabled={runMutation.isPending}
                    title="Exécuter"
                  >
                    {runMutation.isPending && running?.prompt.id === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHistoryFor(p)}
                    title="Historique"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  {!p.is_seed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(p)}
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Edit Dialog */}
      {editing && <EditDialog prompt={editing} onClose={() => setEditing(null)} />}
      {creating && <EditDialog prompt={null} onClose={() => setCreating(false)} />}

      {/* Run Output Dialog */}
      {running && (
        <Dialog open onOpenChange={() => setRunning(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Exécution : {running.prompt.name}</DialogTitle>
            </DialogHeader>
            {running.status === 'pending' && (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> En cours…
              </div>
            )}
            {running.status === 'done' && running.output && (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{running.output}</ReactMarkdown>
              </div>
            )}
            {running.status === 'error' && (
              <div className="text-sm text-red-600">Erreur : {running.error}</div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* History Dialog */}
      {historyFor && (
        <HistoryDialog prompt={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}

function EditDialog({
  prompt,
  onClose,
}: {
  prompt: AdminPrompt | null
  onClose: () => void
}) {
  const upsert = useUpsertAdminPrompt()
  const [name, setName] = useState(prompt?.name ?? '')
  const [description, setDescription] = useState(prompt?.description ?? '')
  const [taskKind, setTaskKind] = useState<AdminPromptTaskKind>(prompt?.task_kind ?? 'custom')
  const [systemPrompt, setSystemPrompt] = useState(prompt?.system_prompt ?? '')
  const [userTemplate, setUserTemplate] = useState(prompt?.user_prompt_template ?? '')
  const [filterJson, setFilterJson] = useState(
    JSON.stringify(prompt?.source_filter ?? {}, null, 2),
  )

  const handleSave = async (): Promise<void> => {
    let filter: Record<string, unknown>
    try {
      filter = JSON.parse(filterJson) as Record<string, unknown>
    } catch {
      alert('source_filter doit être du JSON valide')
      return
    }
    await upsert.mutateAsync({
      id: prompt?.id,
      name,
      description: description || null,
      task_kind: taskKind,
      system_prompt: systemPrompt,
      user_prompt_template: userTemplate,
      source_filter: filter,
      display_order: prompt?.display_order,
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Éditer' : 'Nouveau'} prompt admin</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ap-name" className="text-xs">
                Nom
              </Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ap-kind" className="text-xs">
                Task kind
              </Label>
              <select
                id="ap-kind"
                className="w-full rounded-md border px-3 py-1.5 text-sm"
                value={taskKind}
                onChange={(e) => setTaskKind(e.target.value as AdminPromptTaskKind)}
              >
                <option value="moat:reddit">moat:reddit</option>
                <option value="moat:arxiv">moat:arxiv</option>
                <option value="moat:x">moat:x</option>
                <option value="moat:synthesis">moat:synthesis</option>
                <option value="custom">custom</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="ap-desc" className="text-xs">
              Description
            </Label>
            <Input
              id="ap-desc"
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ap-sys" className="text-xs">
              System prompt
            </Label>
            <Textarea
              id="ap-sys"
              rows={5}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ap-tpl" className="text-xs">
              User prompt template (variables :{' '}
              <code className="text-[10px]">
                {`{{signals_block}} {{language}} {{date}} {{topics_emerging}} {{rubric}} {{run:moat:reddit}}`}
              </code>
              )
            </Label>
            <Textarea
              id="ap-tpl"
              rows={10}
              value={userTemplate}
              onChange={(e) => setUserTemplate(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="ap-filter" className="text-xs">
              Source filter (JSON) — sources, min_score, window_hours, max_count
            </Label>
            <Textarea
              id="ap-filter"
              rows={4}
              value={filterJson}
              onChange={(e) => setFilterJson(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              void handleSave()
            }}
            disabled={
              upsert.isPending ||
              !name.trim() ||
              !systemPrompt.trim() ||
              !userTemplate.trim()
            }
          >
            {upsert.isPending ? 'Sauvegarde…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({
  prompt,
  onClose,
}: {
  prompt: AdminPrompt
  onClose: () => void
}) {
  const { data: runs, isLoading } = useAdminPromptRuns(prompt.id, 20)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRun = runs?.find((r) => r.id === selected)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique : {prompt.name}</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="text-xs text-muted-foreground">Chargement…</div>}
        {!isLoading && (runs ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">Aucune exécution enregistrée.</div>
        )}
        {!isLoading && runs && runs.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1 max-h-[60vh] overflow-y-auto">
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={cn(
                    'w-full text-left p-2 rounded text-xs',
                    selected === r.id ? 'bg-slate-200' : 'hover:bg-slate-100',
                    r.status === 'failed' && 'border-l-2 border-red-500',
                  )}
                >
                  <div className="font-mono text-[10px] text-slate-500">
                    {new Date(r.executed_at).toLocaleString('fr-FR')}
                  </div>
                  <div>
                    {r.model_used ?? '(unknown)'} · ${r.cost.toFixed(4)}
                  </div>
                </button>
              ))}
            </div>
            <div className="col-span-2 max-h-[60vh] overflow-y-auto">
              {selectedRun ? (
                selectedRun.status === 'success' && selectedRun.output_markdown ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{selectedRun.output_markdown}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-sm text-red-600">Erreur : {selectedRun.error}</div>
                )
              ) : (
                <div className="text-xs text-muted-foreground">Sélectionne un run à gauche.</div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
