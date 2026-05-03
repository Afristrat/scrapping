import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import { useAuthStore } from '@/stores/auth'
import type { Tables, TablesUpdate, Enums } from '@/types/database'

export type PersonaRow = Tables<'personas'>
export type PersonaKind = Enums<'persona_kind'>

export interface CreatePersonaInput {
  kind: PersonaKind
  name: string
  key: string
  context_md?: string | null
  date_start?: string | null
  date_end?: string | null
  /** true → partagée org (user_id = null), false → personnelle */
  is_shared?: boolean
}

export interface UpdatePersonaInput {
  id: string
  name?: string
  key?: string
  context_md?: string | null
  date_start?: string | null
  date_end?: string | null
  is_shared?: boolean
}

/**
 * Retourne toutes les personas visibles pour l'org (personnelles + org-shared),
 * triées par kind puis nom.
 * Mutations : createPersona, updatePersona, archivePersona, deletePersona.
 */
export function usePersonas(showArchived = false) {
  const orgId = useCurrentOrgId()
  const qc = useQueryClient()

  const query = useQuery<PersonaRow[]>({
    queryKey: ['personas', orgId, showArchived],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from('personas')
        .select('*')
        .eq('org_id', orgId ?? '')
        .order('kind')
        .order('name')
      if (!showArchived) {
        q = q.eq('is_archived', false)
      }
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const createPersona = useMutation<PersonaRow, Error, CreatePersonaInput>({
    mutationFn: async (input) => {
      if (!orgId) throw new Error('no_org_selected')
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const { data, error } = await supabase
        .from('personas')
        .insert({
          org_id: orgId,
          user_id: input.is_shared ? null : userId,
          kind: input.kind,
          name: input.name,
          key: input.key,
          context_md: input.context_md ?? null,
          date_start: input.date_start ?? null,
          date_end: input.date_end ?? null,
          is_archived: false,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Persona créée')
      qc.invalidateQueries({ queryKey: ['personas', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur création persona', { description: err.message.slice(0, 200) }),
  })

  const updatePersona = useMutation<PersonaRow, Error, UpdatePersonaInput>({
    mutationFn: async ({ id, is_shared, ...updates }) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const payload: TablesUpdate<'personas'> = { ...updates }
      if (is_shared !== undefined) {
        payload.user_id = is_shared ? null : userId
      }
      const { data, error } = await supabase
        .from('personas')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Persona mise à jour')
      qc.invalidateQueries({ queryKey: ['personas', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur mise à jour persona', { description: err.message.slice(0, 200) }),
  })

  const archivePersona = useMutation<void, Error, { id: string; archived: boolean }>({
    mutationFn: async ({ id, archived }) => {
      const { error } = await supabase
        .from('personas')
        .update({ is_archived: archived })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { archived }) => {
      toast.success(archived ? 'Persona archivée' : 'Persona désarchivée')
      qc.invalidateQueries({ queryKey: ['personas', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur archivage persona', { description: err.message.slice(0, 200) }),
  })

  const deletePersona = useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('personas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Persona supprimée')
      qc.invalidateQueries({ queryKey: ['personas', orgId] })
    },
    onError: (err) =>
      toast.error('Erreur suppression persona', { description: err.message.slice(0, 200) }),
  })

  return { ...query, createPersona, updatePersona, archivePersona, deletePersona }
}
