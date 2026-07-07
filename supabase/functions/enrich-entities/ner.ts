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

/** Diacritiques combinants Unicode (après décomposition NFKD). */
const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * Canonicalisation d'un nom d'entité — MIROIR STRICT du trigger DB
 * entities_set_normalized_name() (migration 20260512000001) :
 * minuscules, accents décomposés puis retirés, [a-z0-9] uniquement.
 * Côté écriture c'est le trigger qui fait foi ; ce miroir ne sert
 * qu'à retrouver l'entité existante après un conflit d'upsert.
 */
export function canonicalizeEntityName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
