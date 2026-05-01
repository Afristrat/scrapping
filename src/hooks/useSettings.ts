import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApifyConfig, SourcePriority } from '@/lib/schemas/settings-schema'
import { DEFAULT_APIFY_CONFIG, DEFAULT_SOURCE_PRIORITY } from '@/lib/schemas/settings-schema'

export interface Branding {
  name: string
  primary: string
  logo_url: string | null
}

export interface Settings {
  user_id: string
  model_scraping: string
  model_scoring: string
  model_monitoring: string
  model_digest: string
  prompt_scoring: string
  language: 'fr' | 'en' | 'es'
  reddit_subs: string[]
  arxiv_categories: string[]
  x_queries: string[]
  topic_seeds: string[]
  model_config: {
    scoring?: { provider: string; model: string } | null
    scraping?: { provider: string; model: string } | null
    monitoring?: { provider: string; model: string } | null
    digest?: { provider: string; model: string } | null
  }
  branding: Branding
  daily_budget_usd: number
  active_rubric_id: string | null
  source_priority: SourcePriority
  apify_config: ApifyConfig
  score_concurrency: number
  updated_at: string
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single()
      if (error) throw error
      const raw = data as unknown as Settings
      return {
        ...raw,
        source_priority: raw.source_priority ?? DEFAULT_SOURCE_PRIORITY,
        apify_config: raw.apify_config ?? DEFAULT_APIFY_CONFIG,
        active_rubric_id: raw.active_rubric_id ?? null,
        language: raw.language ?? 'fr',
        model_digest: raw.model_digest ?? 'anthropic/claude-haiku-4.5',
        score_concurrency: raw.score_concurrency ?? 20,
      }
    },
  })
}

export const DEFAULT_BRANDING: Branding = {
  name: 'theresa-scrap',
  primary: '#3b82f6',
  logo_url: null,
}
