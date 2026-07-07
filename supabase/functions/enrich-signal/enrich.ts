/**
 * enrich.ts — Pure logic helpers for enrich-signal edge function.
 * Exported for unit testing (enrich.test.ts).
 */

import { parseLlmJson } from '../_shared/llm-json.ts'

export interface TopicClassification {
  slug: string
  confidence: number
}

export interface PersonaRelevance {
  persona_key: string
  relevance: number
  reasoning: string
}

/**
 * Parse the raw LLM response for topic classification.
 * Returns [] on any parse error (error-resilient).
 * Filters out entries with confidence <= 0.5.
 */
export function parseTopicsResponse(raw: string): TopicClassification[] {
  if (!raw || typeof raw !== 'string') return []

  let parsed: unknown
  try {
    parsed = parseLlmJson(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const result: TopicClassification[] = []
  for (const item of parsed) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).slug === 'string' &&
      typeof (item as Record<string, unknown>).confidence === 'number'
    ) {
      const entry = item as { slug: string; confidence: number }
      if (entry.confidence > 0.5) {
        result.push({ slug: entry.slug, confidence: entry.confidence })
      }
    }
  }

  return result.slice(0, 3)
}

/**
 * Parse the raw LLM response for persona relevance.
 * Returns [] on any parse error (error-resilient).
 * Filters out entries with relevance <= 0.4.
 */
export function parsePersonasResponse(raw: string): PersonaRelevance[] {
  if (!raw || typeof raw !== 'string') return []

  let parsed: unknown
  try {
    parsed = parseLlmJson(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const result: PersonaRelevance[] = []
  for (const item of parsed) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).persona_key === 'string' &&
      typeof (item as Record<string, unknown>).relevance === 'number'
    ) {
      const entry = item as { persona_key: string; relevance: number; reasoning?: unknown }
      if (entry.relevance > 0.4) {
        result.push({
          persona_key: entry.persona_key,
          relevance: entry.relevance,
          reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
        })
      }
    }
  }

  return result.slice(0, 3)
}
