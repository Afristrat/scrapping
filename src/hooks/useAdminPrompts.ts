import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

export type AdminPromptTaskKind = 'reddit' | 'arxiv' | 'x' | 'synthesis' | 'custom'

export interface AdminPrompt {
  id: string
  user_id: string
  name: string
  description: string | null
  task_kind: AdminPromptTaskKind
  system_prompt: string
  user_prompt_template: string
  source_filter: Record<string, unknown>
  display_order: number
  is_seed: boolean
  created_at: string
  updated_at: string
}

export interface AdminPromptRun {
  id: string
  user_id: string
  prompt_id: string
  executed_at: string
  output_markdown: string | null
  model_used: string | null
  provider_used: string | null
  prompt_tokens: number
  completion_tokens: number
  cost: number
  status: 'success' | 'failed'
  error: string | null
}

export interface AdminPromptUpsertInput {
  id?: string
  name: string
  description?: string | null
  task_kind: AdminPromptTaskKind
  system_prompt: string
  user_prompt_template: string
  source_filter?: Record<string, unknown>
  display_order?: number
}

export function useAdminPrompts() {
  const orgId = useCurrentOrgId()
  return useQuery<AdminPrompt[]>({
    queryKey: ['admin_prompts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_prompts')
        .select('*')
        .eq('org_id', orgId ?? '')
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as AdminPrompt[]
    },
  })
}

export function useAdminPromptRuns(promptId: string | null, limit = 20) {
  const orgId = useCurrentOrgId()
  return useQuery<AdminPromptRun[]>({
    queryKey: ['admin_prompt_runs', orgId, promptId, limit],
    enabled: !!promptId && !!orgId,
    queryFn: async () => {
      if (!promptId) return []
      const { data, error } = await supabase
        .from('admin_prompt_runs')
        .select('*')
        .eq('org_id', orgId ?? '')
        .eq('prompt_id', promptId)
        .order('executed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as AdminPromptRun[]
    },
  })
}

/**
 * Compteur leger (HEAD count) du nombre de runs pour un prompt donne.
 * Utilise pour afficher "History (N)" sans charger les outputs.
 */
export function useAdminPromptRunsCount(promptId: string | null) {
  const orgId = useCurrentOrgId()
  return useQuery<number>({
    queryKey: ['admin_prompt_runs_count', orgId, promptId],
    enabled: !!promptId && !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!promptId) return 0
      const { count, error } = await supabase
        .from('admin_prompt_runs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId ?? '')
        .eq('prompt_id', promptId)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useUpsertAdminPrompt() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()
  return useMutation<AdminPrompt, Error, AdminPromptUpsertInput>({
    mutationFn: async (input) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        user_id: userId,
        org_id: orgId,
        name: input.name,
        description: input.description ?? null,
        task_kind: input.task_kind,
        system_prompt: input.system_prompt,
        user_prompt_template: input.user_prompt_template,
        source_filter: input.source_filter ?? {},
        display_order: input.display_order ?? 100,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('admin_prompts')
        .upsert(payload as unknown as never, { onConflict: 'id' })
        .select()
        .single()
      if (error) throw error
      return data as unknown as AdminPrompt
    },
    onSuccess: () => {
      toast.success('Prompt sauvegardé')
      qc.invalidateQueries({ queryKey: ['admin_prompts'] })
    },
    onError: (err) => toast.error('Échec sauvegarde', { description: err.message.slice(0, 200) }),
  })
}

export function useDeleteAdminPrompt() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('admin_prompts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Prompt supprimé')
      qc.invalidateQueries({ queryKey: ['admin_prompts'] })
    },
    onError: (err) => toast.error('Échec suppression', { description: err.message.slice(0, 200) }),
  })
}

export type ComposedSource = 'cached' | 'cascade' | 'missing' | 'cycle' | 'depth_limit'

export interface ComposedChainEntry {
  kind: string
  source: ComposedSource
  run_id: string | null
  age_hours: number | null
  cost: number
}

export interface RunResult {
  ok: boolean
  run_id?: string
  content?: string
  model_used?: string
  provider_used?: string
  cost?: number
  total_cost?: number
  composed_chain?: ComposedChainEntry[]
  error?: string
  detail?: string
}

export interface RunAdminPromptInput {
  prompt_id: string
  override_filter?: Record<string, unknown>
  compose_chain?: boolean
  max_age_hours?: number
}

export function useRunAdminPrompt() {
  const qc = useQueryClient()
  return useMutation<RunResult, Error, RunAdminPromptInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke('run-admin-prompt', { body: input })
      if (error) throw new Error(error.message)
      const result = data as RunResult
      if (!result.ok && result.error) {
        throw new Error(`${result.error}${result.detail ? `: ${result.detail}` : ''}`)
      }
      return result
    },
    onSuccess: (result) => {
      const model = result.model_used ?? 'le modèle configuré'
      const totalCost = result.total_cost ?? result.cost ?? 0
      const chain = result.composed_chain ?? []
      const message =
        chain.length > 0
          ? `Prompt exécuté avec ${model} · $${totalCost.toFixed(4)} (${chain.length} run(s) en cascade)`
          : `Prompt exécuté avec ${model}`
      toast.success(message)
      qc.invalidateQueries({ queryKey: ['admin_prompt_runs'] })
      qc.invalidateQueries({ queryKey: ['admin_prompt_runs_count'] })
    },
    onError: (err) => toast.error('Échec exécution', { description: err.message.slice(0, 300) }),
  })
}
