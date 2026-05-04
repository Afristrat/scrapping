import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

export interface SettingsProfile {
  id: string
  user_id: string
  name: string
  config_snapshot: SettingsFormValues
  created_at: string
}

const QUERY_KEY = 'settings-profiles'

type SettingsUpdate = Database['public']['Tables']['settings']['Update']

/* ------------------------------------------------------------------ */
/* Lecture                                                              */
/* ------------------------------------------------------------------ */

/**
 * Liste tous les profils de configuration sauvegardés par l'utilisateur courant.
 * Triés par date de création décroissante (les plus récents en premier).
 */
export function useSettingsProfiles() {
  const user = useAuthStore((s) => s.user)
  return useQuery<SettingsProfile[]>({
    queryKey: [QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings_profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((row) => ({
        ...row,
        config_snapshot: row.config_snapshot as unknown as SettingsFormValues,
      }))
    },
  })
}

/* ------------------------------------------------------------------ */
/* Mutations                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sauvegarde un nouveau profil nommé avec le snapshot courant du formulaire.
 */
export function useSaveProfile() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  return useMutation<SettingsProfile, Error, { name: string; snapshot: SettingsFormValues }>({
    mutationFn: async ({ name, snapshot }) => {
      if (!user?.id) throw new Error('not_authenticated')
      const { data, error } = await supabase
        .from('settings_profiles')
        .insert({
          user_id: user.id,
          name: name.trim(),
          // config_snapshot est stocké en jsonb — le cast est nécessaire car
          // le type DB attend Json, mais notre snapshot est un objet Zod typé.
          config_snapshot:
            snapshot as unknown as Database['public']['Tables']['settings_profiles']['Insert']['config_snapshot'],
        })
        .select()
        .single()
      if (error) throw error
      return {
        ...data,
        config_snapshot: data.config_snapshot as unknown as SettingsFormValues,
      }
    },
    onSuccess: () => {
      toast.success('Profil sauvegardé')
      qc.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
    onError: (err) =>
      toast.error('Erreur lors de la sauvegarde', { description: err.message.slice(0, 200) }),
  })
}

/**
 * Applique un profil existant en écrasant les settings courants de l'utilisateur.
 * Invalide le cache settings après succès pour que le form recharge les valeurs.
 */
export function useApplyProfile() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()
  return useMutation<SettingsFormValues, Error, SettingsProfile>({
    mutationFn: async (profile) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const snapshot = profile.config_snapshot
      // Même pattern que useUpdateSettings pour le JSONB settings.
      const payload = {
        prompt_scoring: snapshot.prompt_scoring,
        reddit_subs: snapshot.reddit_subs,
        arxiv_categories: snapshot.arxiv_categories,
        x_queries: snapshot.x_queries,
        topic_seeds: snapshot.topic_seeds,
        model_config: snapshot.model_config,
        branding: snapshot.branding,
        source_priority: snapshot.source_priority,
        apify_config: snapshot.apify_config,
        daily_budget_usd: snapshot.daily_budget_usd,
        active_rubric_id: snapshot.active_rubric_id,
        language: snapshot.language,
        score_concurrency: snapshot.score_concurrency,
      } as unknown as SettingsUpdate
      const { error } = await supabase
        .from('settings')
        .update(payload)
        .eq('user_id', userId)
        .eq('org_id', orgId)
      if (error) throw error
      return snapshot
    },
    onSuccess: () => {
      toast.success('Profil appliqué')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) =>
      toast.error("Erreur lors de l'application du profil", {
        description: err.message.slice(0, 200),
      }),
  })
}

/**
 * Supprime un profil par son id.
 */
export function useDeleteProfile() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('settings_profiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Profil supprimé')
      qc.invalidateQueries({ queryKey: [QUERY_KEY, user?.id] })
    },
    onError: (err) =>
      toast.error('Erreur lors de la suppression', { description: err.message.slice(0, 200) }),
  })
}
