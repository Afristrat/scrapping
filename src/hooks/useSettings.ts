import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { ApifyConfig, SourcePriority } from '@/lib/schemas/settings-schema'
import { DEFAULT_APIFY_CONFIG, DEFAULT_SOURCE_PRIORITY } from '@/lib/schemas/settings-schema'

export interface Branding {
  name: string
  primary: string
  logo_url: string | null
}

export interface Settings {
  user_id: string
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

/**
 * Fetches the current user's settings row scoped to the active org.
 *
 * Note Wave 6.1 : `settings` keeps its `user_id` PK (1 row per user) but a
 * new `org_id` column was added so the same user can have separate settings
 * per org in the future. For now, we filter by `org_id` to honour the
 * tenant boundary AND keep `.single()` semantics (RLS already enforces
 * org membership via `org_settings_select`).
 */
export function useSettings() {
  const orgId = useCurrentOrgId()
  return useQuery<Settings>({
    queryKey: ['settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('org_id', orgId ?? '')
        .single()
      if (error) throw error
      const raw = data as unknown as Settings
      return {
        ...raw,
        source_priority: raw.source_priority ?? DEFAULT_SOURCE_PRIORITY,
        apify_config: raw.apify_config ?? DEFAULT_APIFY_CONFIG,
        active_rubric_id: raw.active_rubric_id ?? null,
        language: raw.language ?? 'fr',
        score_concurrency: raw.score_concurrency ?? 20,
      }
    },
  })
}

export const DEFAULT_BRANDING: Branding = {
  name: 'Kairos',
  primary: '#3b82f6',
  logo_url: null,
}
