import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/database'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

type SettingsUpdate = Database['public']['Tables']['settings']['Update']

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation<void, Error, SettingsFormValues>({
    mutationFn: async (values) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      const payload = {
        model_scraping: values.model_scraping,
        model_scoring: values.model_scoring,
        model_monitoring: values.model_monitoring,
        prompt_scoring: values.prompt_scoring,
        reddit_subs: values.reddit_subs,
        arxiv_categories: values.arxiv_categories,
        x_queries: values.x_queries,
        branding: values.branding,
        source_priority: values.source_priority,
        apify_config: values.apify_config,
        daily_budget_usd: values.daily_budget_usd,
        active_rubric_id: values.active_rubric_id,
        language: values.language,
        model_digest: values.model_digest,
        score_concurrency: values.score_concurrency,
      } as unknown as SettingsUpdate
      const { error } = await supabase.from('settings').update(payload).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Paramètres sauvegardés')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error('Échec sauvegarde', { description: err.message.slice(0, 200) }),
  })
}
