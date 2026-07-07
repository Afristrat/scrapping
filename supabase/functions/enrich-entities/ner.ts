/**
 * ner.ts — Pure logic helpers for enrich-entities edge function.
 * Exported for unit testing (ner.test.ts).
 */

import { parseLlmJson } from '../_shared/llm-json.ts'

export type EntityKind = 'person' | 'organization' | 'technology' | 'paper' | 'product'

export interface NerEntity {
  kind: EntityKind
  canonical_name: string
  mention_text: string
  confidence: number
}

const VALID_KINDS: ReadonlySet<string> = new Set([
  'person',
  'organization',
  'technology',
  'paper',
  'product',
])

/**
 * Parse the raw LLM NER response into typed entities.
 * Returns [] on any parse error (error-resilient).
 * Strips markdown code fences if present.
 * Assigns default confidence 0.8 if not provided.
 * Filters out entries with invalid kind or missing canonical_name.
 * Deduplicates by canonical_name (case-insensitive).
 */
export function parseNerResponse(raw: string): NerEntity[] {
  if (!raw || typeof raw !== 'string') return []

  let parsed: unknown
  try {
    parsed = parseLlmJson(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const seen = new Set<string>()
  const result: NerEntity[] = []

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue

    const obj = item as Record<string, unknown>
    const kind = obj.kind
    const canonical_name = obj.canonical_name
    const mention_text = obj.mention_text

    // Validate required fields
    if (typeof kind !== 'string' || !VALID_KINDS.has(kind)) continue
    if (typeof canonical_name !== 'string' || canonical_name.trim() === '') continue

    const canonicalNormalized = canonical_name.trim()
    const dedupeKey = `${kind}:${canonicalNormalized.toLowerCase()}`

    // Skip duplicates
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    result.push({
      kind: kind as EntityKind,
      canonical_name: canonicalNormalized,
      mention_text: typeof mention_text === 'string' ? mention_text.trim() : canonicalNormalized,
      confidence: 0.8,
    })

    // Max 8 entities per spec
    if (result.length >= 8) break
  }

  return result
}
