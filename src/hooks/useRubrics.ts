import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { RubricFormValues, ScoringRubric } from '@/lib/schemas/rubric-schema'

/**
 * Wave 6.1 : `scoring_rubrics` rows are scoped to the org. All members
 * share the same set of rubrics (RLS enforces tenant boundary).
 */
export function useRubrics() {
  const orgId = useCurrentOrgId()
  return useQuery<ScoringRubric[]>({
    queryKey: ['rubrics', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scoring_rubrics')
        .select('*')
        .eq('org_id', orgId ?? '')
        .order('name')
      if (error) throw error
      return (data ?? []) as unknown as ScoringRubric[]
    },
  })
}

export function useCreateRubric() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()
  return useMutation<ScoringRubric, Error, RubricFormValues>({
    mutationFn: async (values) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const { data, error } = await supabase
        .from('scoring_rubrics')
        .insert({
          user_id: userId,
          org_id: orgId,
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
  const orgId = useCurrentOrgId()
  return useMutation<void, Error, { rubricId: string }>({
    mutationFn: async ({ rubricId }) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const { error } = await supabase
        .from('settings')
        .update({ active_rubric_id: rubricId })
        .eq('user_id', userId)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Grille active mise a jour')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error('Erreur', { description: err.message.slice(0, 200) }),
  })
}
