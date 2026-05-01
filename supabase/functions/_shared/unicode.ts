/**
 * Unicode safety helpers for Postgres JSONB inserts.
 *
 * Why this exists: Postgres JSONB rejects unpaired UTF-16 surrogate code
 * units with `22P02 invalid input syntax for type json` ("Unicode low
 * surrogate must follow a high surrogate"). JavaScript strings tolerate
 * orphan halves, so any text from external scrapers (Twitter, Reddit)
 * may contain them — typically when an upstream service truncates a
 * tweet inside an emoji codepoint. Sanitize before insert.
 */

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Replace unpaired UTF-16 surrogates with U+FFFD. */
export function sanitizeUnicodeString(s: string): string {
  return s.replace(UNPAIRED_SURROGATE, '�')
}

/**
 * Slice a JS string at `end` code-units without leaving an orphan
 * high surrogate at the cut. If the cut would land between a surrogate
 * pair, step back by one so the pair is dropped cleanly rather than
 * breaking it (the trailing emoji is removed instead of becoming `?`).
 */
export function safeSliceString(s: string, end: number): string {
  if (s.length <= end) return s
  let cut = end
  const lastCode = s.charCodeAt(cut - 1)
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1
  return s.slice(0, cut)
}

/**
 * Deep-walk a JSON-shaped value and sanitize every string (keys & values).
 * Counter is mutated through the supplied state object so the caller can
 * log how many fixes were applied per request.
 */
export interface SanitizeStats {
  fixed: number
}

export function deepSanitizeJson<T>(value: T, stats: SanitizeStats = { fixed: 0 }): T {
  if (typeof value === 'string') {
    const cleaned = value.replace(UNPAIRED_SURROGATE, () => {
      stats.fixed += 1
      return '�'
    })
    return cleaned as unknown as T
  }
  if (Array.isArray(value)) return value.map((v) => deepSanitizeJson(v, stats)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const cleanKey = k.replace(UNPAIRED_SURROGATE, () => {
        stats.fixed += 1
        return '�'
      })
      out[cleanKey] = deepSanitizeJson(v, stats)
    }
    return out as unknown as T
  }
  return value
}
