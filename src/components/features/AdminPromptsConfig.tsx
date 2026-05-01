import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import {
  useAdminPrompts,
  useAdminPromptRuns,
  useAdminPromptRunsCount,
  useDeleteAdminPrompt,
  useRunAdminPrompt,
  useUpsertAdminPrompt,
  type AdminPrompt,
  type AdminPromptTaskKind,
  type ComposedChainEntry,
  type ComposedSource,
  type RunAdminPromptInput,
} from '@/hooks/useAdminPrompts'
import { formatCostUsd, useEstimateRunCost, type CostEstimate } from '@/hooks/useAdminPromptCost'
import { useSettings } from '@/hooks/useSettings'
import {
  detectVariables,
  renderPromptPreview,
  todayIso,
  type PromptLanguage,
} from '@/lib/promptPreview'
import { cn } from '@/lib/utils'

const TASK_BADGE: Record<AdminPromptTaskKind, { label: string; cls: string }> = {
  reddit: { label: 'Reddit', cls: 'bg-orange-100 text-orange-800' },
  arxiv: { label: 'arXiv', cls: 'bg-cyan-100 text-cyan-800' },
  x: { label: 'X', cls: 'bg-indigo-100 text-indigo-800' },
  synthesis: { label: 'Synthesis', cls: 'bg-emerald-100 text-emerald-800' },
  custom: { label: 'Custom', cls: 'bg-slate-100 text-slate-700' },
}

const DEFAULT_MAX_AGE_HOURS = 6
const MIN_MAX_AGE_HOURS = 1
const MAX_MAX_AGE_HOURS = 72

const COMPOSE_RUN_REGEX = /\{\{run:([a-z:_-]+)\}\}/g

const COMPOSED_SOURCE_BADGE: Record<ComposedSource, { label: string; cls: string }> = {
  cached: { label: 'cached', cls: 'bg-emerald-100 text-emerald-800' },
  cascade: { label: 'cascade', cls: 'bg-blue-100 text-blue-800' },
  missing: { label: 'manquant', cls: 'bg-orange-100 text-orange-800' },
  cycle: { label: 'cycle', cls: 'bg-orange-100 text-orange-800' },
  depth_limit: { label: 'profondeur max', cls: 'bg-orange-100 text-orange-800' },
}

/**
 * Détecte les task_kind référencés via `{{run:<kind>}}` dans system + user
 * template d'un prompt admin. Ordre stable (insertion) — utile pour afficher
 * « Sera composé : reddit, arxiv ».
 */
function detectComposedKinds(prompt: AdminPrompt): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const text of [prompt.system_prompt ?? '', prompt.user_prompt_template ?? '']) {
    const re = new RegExp(COMPOSE_RUN_REGEX.source, COMPOSE_RUN_REGEX.flags)
    let m: RegExpExecArray | null = re.exec(text)
    while (m !== null) {
      const kind = m[1]
      if (!seen.has(kind)) {
        seen.add(kind)
        out.push(kind)
      }
      m = re.exec(text)
    }
  }
  return out
}

type RunningState = {
  prompt: AdminPrompt
  output: string | null
  status: 'pending' | 'done' | 'error'
  error?: string
  composedChain?: ComposedChainEntry[]
  totalCost?: number
}

interface RunOptions {
  composeChain: boolean
  maxAgeHours: number
}

export function AdminPromptsConfig() {
  const { data: prompts, isLoading } = useAdminPrompts()
  const [editing, setEditing] = useState<AdminPrompt | null>(null)
  const [creating, setCreating] = useState(false)
  const [running, setRunning] = useState<RunningState | null>(null)
  const [historyFor, setHistoryFor] = useState<AdminPrompt | null>(null)
  const [pendingRun, setPendingRun] = useState<{
    prompt: AdminPrompt
    estimate: CostEstimate
  } | null>(null)
  const [pendingCompose, setPendingCompose] = useState<{
    prompt: AdminPrompt
    composedKinds: string[]
  } | null>(null)

  const runMutation = useRunAdminPrompt()
  const deleteMutation = useDeleteAdminPrompt()

  if (isLoading) return <div className="text-muted-foreground text-xs">Chargement…</div>

  const executeRun = async (p: AdminPrompt, options?: RunOptions): Promise<void> => {
    setRunning({ prompt: p, output: null, status: 'pending' })
    try {
      const payload: RunAdminPromptInput = { prompt_id: p.id }
      if (options?.composeChain) {
        payload.compose_chain = true
        payload.max_age_hours = options.maxAgeHours
      }
      const result = await runMutation.mutateAsync(payload)
      setRunning({
        prompt: p,
        output: result.content ?? '(pas de contenu)',
        status: 'done',
        composedChain: result.composed_chain,
        totalCost: result.total_cost ?? result.cost,
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

  /**
   * Pipeline de décision déclenché par le bouton « Run » :
   *   1. Cost Guard si le coût excède le budget (peut être forcé)
   *   2. Compose Options si le prompt référence des `{{run:<kind>}}`
   *   3. Exécution effective
   * Le Cost Guard reste prioritaire pour ne pas masquer un dépassement budget
   * même quand une cascade est possible.
   */
  const handleRunRequest = (p: AdminPrompt, estimate: CostEstimate | null): void => {
    if (estimate?.exceedsBudget) {
      setPendingRun({ prompt: p, estimate })
      return
    }
    const composedKinds = detectComposedKinds(p)
    if (composedKinds.length > 0) {
      setPendingCompose({ prompt: p, composedKinds })
      return
    }
    void executeRun(p)
  }

  const handleDelete = (p: AdminPrompt): void => {
    if (p.is_seed) return
    if (!confirm(`Supprimer le prompt "${p.name}" ?`)) return
    deleteMutation.mutate({ id: p.id })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Bibliothèque de prompts d'analyse stratégique, exécutables sur ton corpus de signaux. 4
          seeds pré-installés + tes prompts custom.
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="h-3 w-3" /> Nouveau prompt
        </Button>
      </div>

      <div className="space-y-2">
        {(prompts ?? []).map((p) => (
          <PromptRow
            key={p.id}
            prompt={p}
            isRunning={runMutation.isPending && running?.prompt.id === p.id}
            onEdit={() => setEditing(p)}
            onHistory={() => setHistoryFor(p)}
            onDelete={() => handleDelete(p)}
            onRunRequested={(estimate) => handleRunRequest(p, estimate)}
          />
        ))}
      </div>

      {/* Edit Dialog */}
      {editing && <EditDialog prompt={editing} onClose={() => setEditing(null)} />}
      {creating && <EditDialog prompt={null} onClose={() => setCreating(false)} />}

      {/* Run Output Dialog */}
      {running && (
        <Dialog open onOpenChange={() => setRunning(null)}>
          <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Exécution : {running.prompt.name}</DialogTitle>
            </DialogHeader>
            {running.status === 'pending' && (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin" /> En cours…
              </div>
            )}
            {running.status === 'done' && running.output && (
              <>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{running.output}</ReactMarkdown>
                </div>
                {running.composedChain && running.composedChain.length > 0 && (
                  <ComposedChainSummary
                    chain={running.composedChain}
                    totalCost={running.totalCost ?? 0}
                  />
                )}
              </>
            )}
            {running.status === 'error' && (
              <div className="text-sm text-red-600">Erreur : {running.error}</div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* History Dialog */}
      {historyFor && <HistoryDialog prompt={historyFor} onClose={() => setHistoryFor(null)} />}

      {/* Compose Options Dialog */}
      {pendingCompose && (
        <RunComposeOptionsDialog
          prompt={pendingCompose.prompt}
          composedKinds={pendingCompose.composedKinds}
          onCancel={() => setPendingCompose(null)}
          onConfirm={(options) => {
            const p = pendingCompose.prompt
            setPendingCompose(null)
            void executeRun(p, options)
          }}
        />
      )}

      {/* Cost Guard Dialog */}
      {pendingRun && (
        <BudgetGuardDialog
          prompt={pendingRun.prompt}
          estimate={pendingRun.estimate}
          onCancel={() => setPendingRun(null)}
          onForce={() => {
            const p = pendingRun.prompt
            const est = pendingRun.estimate
            setPendingRun(null)
            void logBudgetOverride(p, est)
            // Après forçage du budget, on enchaîne sur le compose dialog si
            // le prompt référence d'autres runs ; sinon exécution directe.
            const composedKinds = detectComposedKinds(p)
            if (composedKinds.length > 0) {
              setPendingCompose({ prompt: p, composedKinds })
            } else {
              void executeRun(p)
            }
          }}
        />
      )}
    </div>
  )
}

interface PromptRowProps {
  prompt: AdminPrompt
  isRunning: boolean
  onEdit: () => void
  onHistory: () => void
  onDelete: () => void
  onRunRequested: (estimate: CostEstimate | null) => void
}

function PromptRow({
  prompt: p,
  isRunning,
  onEdit,
  onHistory,
  onDelete,
  onRunRequested,
}: PromptRowProps) {
  const badge = TASK_BADGE[p.task_kind]
  const { data: runsCount } = useAdminPromptRunsCount(p.id)
  const estimate = useEstimateRunCost(p)

  const costLabel = estimate != null ? `Run (~${formatCostUsd(estimate.estimatedCost)})` : 'Run'

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold', badge.cls)}>
              {badge.label}
            </span>
            {p.is_seed && <span className="text-muted-foreground text-[10px]">seed</span>}
            <h3 className="text-sm font-semibold">{p.name}</h3>
          </div>
          {p.description && (
            <p className="text-muted-foreground line-clamp-2 text-xs">{p.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit} title="Éditer">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => onRunRequested(estimate)}
            disabled={isRunning}
            title={
              estimate?.modelUsed
                ? `Modèle : ${estimate.modelUsed} · prompt ~${estimate.promptTokens} tokens${
                    estimate.exceedsBudget ? ' · Budget dépassé !' : ''
                  }`
                : 'Exécuter'
            }
            className={cn('gap-1.5', estimate?.exceedsBudget && 'border border-red-500')}
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">{costLabel}</span>
            {estimate?.exceedsBudget && <AlertTriangle className="h-3.5 w-3.5 text-red-200" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onHistory}
            title="Historique des runs"
            className="gap-1.5"
          >
            <History className="h-3.5 w-3.5" />
            <span className="text-xs">History{runsCount != null ? ` (${runsCount})` : ''}</span>
          </Button>
          {!p.is_seed && (
            <Button size="sm" variant="ghost" onClick={onDelete} title="Supprimer">
              <Trash2 className="h-3.5 w-3.5 text-red-600" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

interface BudgetGuardDialogProps {
  prompt: AdminPrompt
  estimate: CostEstimate
  onCancel: () => void
  onForce: () => void
}

function BudgetGuardDialog({ prompt, estimate, onCancel, onForce }: BudgetGuardDialogProps) {
  const projected = estimate.todaySpent + estimate.estimatedCost
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" /> Budget journalier dépassé
          </DialogTitle>
          <DialogDescription>
            Exécuter « {prompt.name} » dépasserait ton budget journalier.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Budget journalier</span>
            <span className="font-mono">{formatCostUsd(estimate.dailyBudget)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Déjà dépensé aujourd'hui</span>
            <span className="font-mono">{formatCostUsd(estimate.todaySpent)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Coût estimé du run</span>
            <span className="font-mono">~{formatCostUsd(estimate.estimatedCost)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
            <span>Projection</span>
            <span className="font-mono text-red-700">{formatCostUsd(projected)}</span>
          </div>
          {!estimate.pricingFound && (
            <p className="pt-2 text-[11px] text-amber-700">
              Pricing exact du modèle « {estimate.modelUsed ?? 'inconnu'} » indisponible —
              estimation basée sur des tarifs prudents par défaut.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="default" onClick={onForce} className="bg-red-600 hover:bg-red-700">
            Forcer l'exécution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Log dans `logs` qu'un user a force un run au-dela de son budget. Best-effort :
 * on ne bloque pas l'execution si le log echoue.
 */
async function logBudgetOverride(prompt: AdminPrompt, estimate: CostEstimate): Promise<void> {
  try {
    await supabase.from('logs').insert({
      action: 'admin_prompt_budget_override',
      status: 'warning',
      payload: {
        prompt_id: prompt.id,
        prompt_name: prompt.name,
        estimated_cost: estimate.estimatedCost,
        today_spent: estimate.todaySpent,
        daily_budget: estimate.dailyBudget,
        model_used: estimate.modelUsed,
      },
    } as unknown as never)
  } catch {
    // best-effort — pas de toast pour ne pas masquer la confirmation utilisateur
  }
}

function EditDialog({ prompt, onClose }: { prompt: AdminPrompt | null; onClose: () => void }) {
  const upsert = useUpsertAdminPrompt()
  const { data: settings } = useSettings()
  const [name, setName] = useState(prompt?.name ?? '')
  const [description, setDescription] = useState(prompt?.description ?? '')
  const [taskKind, setTaskKind] = useState<AdminPromptTaskKind>(prompt?.task_kind ?? 'custom')
  const [systemPrompt, setSystemPrompt] = useState(prompt?.system_prompt ?? '')
  const [userTemplate, setUserTemplate] = useState(prompt?.user_prompt_template ?? '')
  const [filterJson, setFilterJson] = useState(JSON.stringify(prompt?.source_filter ?? {}, null, 2))
  const [previewVersion, setPreviewVersion] = useState(0)

  const language: PromptLanguage = settings?.language ?? 'fr'
  // previewVersion drives the memo refresh when "Refresh preview" is clicked.
  const detectedVars = useMemo(
    () => detectVariables(systemPrompt, userTemplate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systemPrompt, userTemplate, previewVersion],
  )
  const renderedSystem = useMemo(
    () =>
      renderPromptPreview(systemPrompt, {
        language,
        date: todayIso(),
        signalsCount: null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systemPrompt, language, previewVersion],
  )
  const renderedUser = useMemo(
    () =>
      renderPromptPreview(userTemplate, {
        language,
        date: todayIso(),
        signalsCount: null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userTemplate, language, previewVersion],
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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
                <option value="reddit">reddit</option>
                <option value="arxiv">arxiv</option>
                <option value="x">x</option>
                <option value="synthesis">synthesis</option>
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
                {`{{signals_block}} {{language}} {{date}} {{topics_emerging}} {{rubric}} {{run:reddit}}`}
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

          {/* Live preview du prompt rendu */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Aperçu du prompt rendu</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPreviewVersion((v) => v + 1)}
                title="Rafraîchir l'aperçu"
              >
                <RefreshCw className="h-3 w-3" /> Refresh preview
              </Button>
            </div>

            {detectedVars.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {detectedVars.map((v) => (
                  <span
                    key={v.name}
                    className={cn(
                      'rounded px-1.5 py-0.5 font-mono text-[10px]',
                      v.known ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                    )}
                    title={
                      v.known
                        ? "Variable reconnue par l'edge function"
                        : "Variable non utilisée par l'edge function (laissée telle quelle)"
                    }
                  >
                    {`{{${v.name}}}`} · {v.known ? 'détectée' : 'non utilisée'}
                  </span>
                ))}
              </div>
            )}

            <details className="rounded border bg-slate-50 p-2 text-xs" open>
              <summary className="cursor-pointer font-semibold">
                System prompt rendu ({renderedSystem.length} chars)
              </summary>
              <pre className="mt-2 font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                {renderedSystem || '(vide)'}
              </pre>
            </details>

            <details className="rounded border bg-slate-50 p-2 text-xs" open>
              <summary className="cursor-pointer font-semibold">
                User prompt rendu ({renderedUser.length} chars)
              </summary>
              <pre className="mt-2 font-mono text-[11px] whitespace-pre-wrap text-slate-700">
                {renderedUser || '(vide)'}
              </pre>
            </details>

            <p className="text-muted-foreground text-[10px]">
              Variables substituées côté front : <code>{`{{date}}`}</code>,{' '}
              <code>{`{{language}}`}</code>. Les autres affichent un placeholder explicite — leurs
              valeurs réelles sont injectées par l'edge function au moment du run.
            </p>
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
              upsert.isPending || !name.trim() || !systemPrompt.trim() || !userTemplate.trim()
            }
          >
            {upsert.isPending ? 'Sauvegarde…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({ prompt, onClose }: { prompt: AdminPrompt; onClose: () => void }) {
  const { data: runs, isLoading } = useAdminPromptRuns(prompt.id, 20)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRun = runs?.find((r) => r.id === selected)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique : {prompt.name}</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="text-muted-foreground text-xs">Chargement…</div>}
        {!isLoading && (runs ?? []).length === 0 && (
          <div className="text-muted-foreground text-sm">Aucune exécution enregistrée.</div>
        )}
        {!isLoading && runs && runs.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 max-h-[60vh] space-y-1 overflow-y-auto">
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={cn(
                    'w-full rounded p-2 text-left text-xs',
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
                <div className="text-muted-foreground text-xs">Sélectionne un run à gauche.</div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface RunComposeOptionsDialogProps {
  prompt: AdminPrompt
  composedKinds: string[]
  onCancel: () => void
  onConfirm: (options: RunOptions) => void
}

/**
 * S'intercale entre le clic « Run » et l'exécution réelle dès qu'un prompt
 * référence au moins un `{{run:<kind>}}`. L'utilisateur choisit explicitement
 * d'exécuter en cascade (et la fraîcheur tolérée), ou de ne pas composer
 * (placeholders « (aucun run précédent disponible) » comme avant).
 */
function RunComposeOptionsDialog({
  prompt,
  composedKinds,
  onCancel,
  onConfirm,
}: RunComposeOptionsDialogProps) {
  const [composeChain, setComposeChain] = useState(true)
  const [maxAgeHours, setMaxAgeHours] = useState<number>(DEFAULT_MAX_AGE_HOURS)

  const sanitizedAge = Math.max(
    MIN_MAX_AGE_HOURS,
    Math.min(MAX_MAX_AGE_HOURS, Math.floor(maxAgeHours)),
  )

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Composition de la chaîne — {prompt.name}</DialogTitle>
          <DialogDescription>
            Ce prompt référence d'autres runs via{' '}
            <code className="text-[11px]">{`{{run:<kind>}}`}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={composeChain}
              onChange={(e) => setComposeChain(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Composer la chaîne</span>
              <span className="text-muted-foreground block text-xs">
                Exécute automatiquement les prompts dépendants ({`{{run:<kind>}}`}) si leur dernier
                run est trop ancien.
              </span>
            </span>
          </label>

          <div className={cn(!composeChain && 'pointer-events-none opacity-50')}>
            <Label htmlFor="ap-max-age" className="text-xs">
              Fraîcheur max (heures)
            </Label>
            <Input
              id="ap-max-age"
              type="number"
              min={MIN_MAX_AGE_HOURS}
              max={MAX_MAX_AGE_HOURS}
              value={maxAgeHours}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setMaxAgeHours(n)
              }}
              disabled={!composeChain}
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              Au-delà, le prompt parent sera ré-exécuté en cascade. Plage : {MIN_MAX_AGE_HOURS}-
              {MAX_MAX_AGE_HOURS} h.
            </p>
          </div>

          <div>
            <Label className="text-xs">Sera composé</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {composedKinds.map((k) => (
                <span
                  key={k}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>

          {composeChain && (
            <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Cela peut multiplier le coût par N (jusqu'à {composedKinds.length + 1} runs si tous
                les prompts dépendants ne sont pas frais).
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                composeChain,
                maxAgeHours: composeChain ? sanitizedAge : DEFAULT_MAX_AGE_HOURS,
              })
            }
          >
            Exécuter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ComposedChainSummaryProps {
  chain: ComposedChainEntry[]
  totalCost: number
}

/**
 * Affichage post-run de la chaîne exécutée : un encart `<details>` ouvert par
 * défaut, listant chaque kind avec son badge de provenance, l'âge (si cached)
 * et le coût propre.
 */
function ComposedChainSummary({ chain, totalCost }: ComposedChainSummaryProps) {
  return (
    <details className="mt-4 rounded border bg-slate-50 p-3 text-xs" open>
      <summary className="cursor-pointer text-sm font-semibold">
        Chaîne exécutée ({chain.length} entrée{chain.length > 1 ? 's' : ''})
      </summary>
      <ul className="mt-2 space-y-1">
        {chain.map((entry, i) => {
          const badge = COMPOSED_SOURCE_BADGE[entry.source]
          const ageLabel =
            entry.source === 'cached' && entry.age_hours != null
              ? ` · il y a ${entry.age_hours.toFixed(1)} h`
              : ''
          return (
            <li
              key={`${entry.kind}-${i}`}
              className="flex items-center justify-between gap-2 border-b py-1 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[11px]">{entry.kind}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.cls)}>
                  {badge.label}
                </span>
                <span className="text-muted-foreground text-[10px]">{ageLabel}</span>
              </div>
              <span className="font-mono text-[11px]">${entry.cost.toFixed(4)}</span>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
        <span>Coût total</span>
        <span className="font-mono">${totalCost.toFixed(4)}</span>
      </div>
    </details>
  )
}
