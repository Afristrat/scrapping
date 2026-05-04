import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalsEnrichedFilters {
  topicSlugs?: string[]
  personaKeys?: string[]
  sources?: string[]
  minScore?: number
  windowHours?: number
  /** Pagination cursor : scraped_at du dernier élément de la page précédente */
  cursor?: string
  limit?: number
}

export interface EnrichedSignal {
  id: string
  org_id: string
  user_id: string
  source: string
  external_id: string
  url: string | null
  title: string | null
  raw_payload: Record<string, unknown>
  scraped_at: string
  enriched_at: string | null
  weight: number | null
  editorial_kind: string | null
  topic_slugs: string[]
  top_personas: string[]
  top_entities: string[]
  score: number | null
  reasoning: string | null
  model_used: string | null
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

/**
 * Récupère les signaux enrichis via la RPC `enriched_signals` avec filtres
 * multi-axes : topics, personas, sources, score minimum, fenêtre temporelle.
 *
 * Pagination cursor-based : passer `filters.cursor` (scraped_at du dernier
 * élément retourné) pour charger la page suivante.
 *
 * staleTime 60s — les données enrichies changent peu en live.
 */
export function useSignalsEnriched(filters: SignalsEnrichedFilters = {}) {
  const orgId = useCurrentOrgId()

  const { topicSlugs, personaKeys, sources, minScore, windowHours, cursor, limit = 50 } = filters

  return useQuery<EnrichedSignal[]>({
    queryKey: ['signals_enriched', orgId, filters],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('enriched_signals', {
        p_org_id: orgId ?? '',
        p_topic_slugs: topicSlugs,
        p_persona_keys: personaKeys,
        p_sources: sources,
        p_min_score: minScore,
        p_window_hours: windowHours,
        p_cursor: cursor,
        p_limit: limit,
      })

      if (error) throw new Error(error.message)

      return ((data ?? []) as EnrichedSignal[]).map((row) => ({
        id: row.id,
        org_id: row.org_id,
        user_id: row.user_id,
        source: row.source,
        external_id: row.external_id,
        url: row.url ?? null,
        title: row.title ?? null,
        raw_payload: (row.raw_payload as Record<string, unknown>) ?? {},
        scraped_at: row.scraped_at,
        enriched_at: row.enriched_at ?? null,
        weight: row.weight ?? null,
        editorial_kind: row.editorial_kind ?? null,
        topic_slugs: row.topic_slugs ?? [],
        top_personas: row.top_personas ?? [],
        top_entities: row.top_entities ?? [],
        score: row.score ?? null,
        reasoning: row.reasoning ?? null,
        model_used: row.model_used ?? null,
      }))
    },
  })
}
