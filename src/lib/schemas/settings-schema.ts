import { z } from 'zod'

export const apifyConfigSchema = z.object({
  x_list_ids: z.array(z.string().min(1)),
  x_max_items: z.number().min(10).max(500),
  reddit_actor: z.string().min(1),
  reddit_sort: z.enum(['hot', 'new', 'top', 'rising', 'relevance']),
  reddit_time_filter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']),
  reddit_max_per_sub: z.number().min(1).max(100),
})

export type ApifyConfig = z.infer<typeof apifyConfigSchema>

export const sourcePrioritySchema = z.object({
  reddit: z.number().min(0).max(2),
  arxiv: z.number().min(0).max(2),
  x: z.number().min(0).max(2),
})

export type SourcePriority = z.infer<typeof sourcePrioritySchema>

export const DEFAULT_APIFY_CONFIG: ApifyConfig = {
  x_list_ids: ['2049788531178926529'],
  x_max_items: 100,
  reddit_actor: 'automation-lab/reddit-scraper',
  reddit_sort: 'top',
  reddit_time_filter: 'week',
  reddit_max_per_sub: 25,
}

export const DEFAULT_SOURCE_PRIORITY: SourcePriority = {
  reddit: 1,
  arxiv: 1,
  x: 1,
}

export const settingsSchema = z.object({
  model_scraping: z.string().min(1),
  model_scoring: z.string().min(1),
  model_monitoring: z.string().min(1),
  prompt_scoring: z.string().min(10).max(2000),
  reddit_subs: z.array(z.string().min(1).max(50)).max(50),
  arxiv_categories: z.array(z.string().min(1).max(20)).max(20),
  x_queries: z.array(z.string().min(1).max(100)).max(20),
  topic_seeds: z.array(z.string().min(1).max(80)).max(50),
  model_config: z
    .object({
      scoring: z.object({ provider: z.string(), model: z.string() }).nullable().optional(),
      scraping: z.object({ provider: z.string(), model: z.string() }).nullable().optional(),
      monitoring: z.object({ provider: z.string(), model: z.string() }).nullable().optional(),
      digest: z.object({ provider: z.string(), model: z.string() }).nullable().optional(),
    })
    .default({}),
  branding: z.object({
    name: z.string().min(1).max(50),
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo_url: z.string().url().nullable(),
  }),
  source_priority: sourcePrioritySchema,
  apify_config: apifyConfigSchema,
  daily_budget_usd: z.number().min(0).max(1000),
  active_rubric_id: z.string().uuid().nullable(),
  language: z.enum(['fr', 'en', 'es']),
  model_digest: z.string().min(1),
  score_concurrency: z.number().min(1).max(100),
})

export type SettingsFormValues = z.infer<typeof settingsSchema>
