import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { RubricFormValues, ScoringRubric } from '@/lib/schemas/rubric-schema'

export function useRubrics() {
  return useQuery<ScoringRubric[]>({
    queryKey: ['rubrics'],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_rubrics').select('*').order('name')
      if (error) throw error
      return (data ?? []) as unknown as ScoringRubric[]
    },
  })
}

export function useCreateRubric() {
  const qc = useQueryClient()
  return useMutation<ScoringRubric, Error, RubricFormValues>({
    mutationFn: async (values) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const { data, error } = await supabase
        .from('scoring_rubrics')
        .insert({
          user_id: userId,
          name: values.name,
          description: values.description || null,
          prompt: values.prompt,
          criteria: values.criteria,
          is_default: values.is_default,
        })
        .select()
        .single()
      if (error) throw error
      return data as unknown as ScoringRubric
    },
    onSuccess: () => {
      toast.success('Grille creee')
      qc.invalidateQueries({ queryKey: ['rubrics'] })
    },
    onError: (err) =>
      toast.error('Erreur creation grille', { description: err.message.slice(0, 200) }),
  })
}

export function useUpdateRubric() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; values: RubricFormValues }>({
    mutationFn: async ({ id, values }) => {
      const { error } = await supabase
        .from('scoring_rubrics')
        .update({
          name: values.name,
          description: values.description || null,
          prompt: values.prompt,
          criteria: values.criteria,
          is_default: values.is_default,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Grille mise a jour')
      qc.invalidateQueries({ queryKey: ['rubrics'] })
    },
    onError: (err) => toast.error('Erreur MAJ grille', { description: err.message.slice(0, 200) }),
  })
}

export function useDeleteRubric() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('scoring_rubrics').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Grille supprimee')
      qc.invalidateQueries({ queryKey: ['rubrics'] })
    },
    onError: (err) =>
      toast.error('Erreur suppression grille', { description: err.message.slice(0, 200) }),
  })
}

export function useSetActiveRubric() {
  const qc = useQueryClient()
  return useMutation<void, Error, { rubricId: string }>({
    mutationFn: async ({ rubricId }) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const { error } = await supabase
        .from('settings')
        .update({ active_rubric_id: rubricId })
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Grille active mise a jour')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error('Erreur', { description: err.message.slice(0, 200) }),
  })
}
