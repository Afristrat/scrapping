import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

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
  return useQuery<AdminPrompt[]>({
    queryKey: ['admin_prompts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_prompts')
        .select('*')
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as AdminPrompt[]
    },
  })
}

export function useAdminPromptRuns(promptId: string | null, limit = 20) {
  return useQuery<AdminPromptRun[]>({
    queryKey: ['admin_prompt_runs', promptId, limit],
    enabled: !!promptId,
    queryFn: async () => {
      if (!promptId) return []
      const { data, error } = await supabase
        .from('admin_prompt_runs')
        .select('*')
        .eq('prompt_id', promptId)
        .order('executed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as AdminPromptRun[]
    },
  })
}

export function useUpsertAdminPrompt() {
  const qc = useQueryClient()
  return useMutation<AdminPrompt, Error, AdminPromptUpsertInput>({
    mutationFn: async (input) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        user_id: userId,
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

export interface RunResult {
  ok: boolean
  run_id?: string
  content?: string
  model_used?: string
  provider_used?: string
  cost?: number
  error?: string
  detail?: string
}

export function useRunAdminPrompt() {
  const qc = useQueryClient()
  return useMutation<RunResult, Error, { prompt_id: string; override_filter?: Record<string, unknown> }>({
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
      toast.success(`Prompt exécuté avec ${result.model_used ?? 'le modèle configuré'}`)
      qc.invalidateQueries({ queryKey: ['admin_prompt_runs'] })
    },
    onError: (err) => toast.error('Échec exécution', { description: err.message.slice(0, 300) }),
  })
}
