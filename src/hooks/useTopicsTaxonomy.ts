import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Tables } from '@/types/database'

export type TopicRow = Tables<'topics_taxonomy'>

export interface CreateTopicInput {
  name: string
  slug: string
  description?: string | null
  parent_id?: string | null
}

export interface UpdateTopicInput {
  id: string
  name?: string
  slug?: string
  description?: string | null
  parent_id?: string | null
}

/**
 * Retourne les topics de l'org courante triés par nom.
 * Mutations : createTopic, updateTopic, deleteTopic.
 */
export function useTopicsTaxonomy() {
  const orgId = useCurrentOrgId()
  const qc = useQueryClient()

  const query = useQuery<TopicRow[]>({
    queryKey: ['topics_taxonomy', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics_taxonomy')
        .select('*')
        .eq('org_id', orgId ?? '')
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const createTopic = useMutation<TopicRow, Error, CreateTopicInput>({
    mutationFn: async (input) => {
      if (!orgId) throw new Error('no_org_selected')
      const { data, error } = await supabase
        .from('topics_taxonomy')
        .insert({
          org_id: orgId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          parent_id: input.parent_id ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Topic créé')
      qc.invalidateQueries({ queryKey: ['topics_taxonomy', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur création topic', { description: err.message.slice(0, 200) }),
  })

  const updateTopic = useMutation<TopicRow, Error, UpdateTopicInput>({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from('topics_taxonomy')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Topic mis à jour')
      qc.invalidateQueries({ queryKey: ['topics_taxonomy', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur mise à jour topic', { description: err.message.slice(0, 200) }),
  })

  const deleteTopic = useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('topics_taxonomy').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Topic supprimé')
      qc.invalidateQueries({ queryKey: ['topics_taxonomy', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur suppression topic', { description: err.message.slice(0, 200) }),
  })

  return { ...query, createTopic, updateTopic, deleteTopic }
}
