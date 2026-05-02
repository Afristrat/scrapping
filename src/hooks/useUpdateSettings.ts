import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

type SettingsUpdate = Database['public']['Tables']['settings']['Update']

export function useUpdateSettings() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()
  return useMutation<void, Error, SettingsFormValues>({
    mutationFn: async (values) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const payload = {
        prompt_scoring: values.prompt_scoring,
        reddit_subs: values.reddit_subs,
        arxiv_categories: values.arxiv_categories,
        x_queries: values.x_queries,
        topic_seeds: values.topic_seeds,
        model_config: values.model_config,
        branding: values.branding,
        source_priority: values.source_priority,
        apify_config: values.apify_config,
        daily_budget_usd: values.daily_budget_usd,
        active_rubric_id: values.active_rubric_id,
        language: values.language,
        score_concurrency: values.score_concurrency,
      } as unknown as SettingsUpdate
      // Filter on (user_id, org_id) — settings PK is still user_id (1 row per
      // user), but we scope by org_id too so editing org A doesn't accidentally
      // touch a future per-org row attached to another org.
      const { error } = await supabase
        .from('settings')
        .update(payload)
        .eq('user_id', userId)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Paramètres sauvegardés')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error('Échec sauvegarde', { description: err.message.slice(0, 200) }),
  })
}
