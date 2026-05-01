/**
 * parse-score — Robust parser for LLM scoring responses.
 *
 * Why this exists
 * ---------------
 * The previous parser used `JSON.parse(raw)` then fell back to an empty
 * object on failure, which silently coerced missing/invalid signals to
 * `score = 0`. That created false-positive zeros in the dashboard:
 *   - LLM wrapped JSON in a markdown ```json fence
 *   - LLM emitted leading prose ("Voici les scores : { ... }")
 *   - Number(s.score) returned NaN (e.g. "n/a", "?") and `|| 0` kicked in
 *   - Item missing from the response → fallback row inserted with score=0
 *
 * Strategy
 * --------
 * 1. Strip markdown fences (```json ... ```), trim whitespace.
 * 2. JSON.parse the cleaned string.
 * 3. If that fails, find the first balanced `{ ... }` object and retry.
 * 4. Validate: must have `scores` array; each entry must have a string id
 *    AND a finite numeric score.
 * 5. Score is clamped to [0, 100]. Non-finite or unparseable scores are
 *    DROPPED (not coerced to 0) — caller decides what to do with the gap.
 * 6. Throw `ScoreParseError` if no valid entry could be extracted, so
 *    callers can log the raw output and skip the DB write entirely.
 */

export interface ParsedScore {
  id: string
  score: number
  reasoning: string
}

export class ScoreParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message)
    this.name = 'ScoreParseError'
  }
}

const MARKDOWN_FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i

/**
 * Strip ```json ... ``` fences from a string. Returns the inner content
 * if a fence is detected, otherwise the input unchanged. Trims whitespace.
 */
export function stripMarkdownFence(input: string): string {
  const trimmed = input.trim()
  const m = trimmed.match(MARKDOWN_FENCE_RE)
  return (m ? m[1] : trimmed).trim()
}

/**
 * Find the first balanced JSON object substring `{ ... }` ignoring braces
 * that appear inside strings. Returns null if no balanced object is found.
 *
 * This is a fallback when the LLM emits prose around the JSON.
 */
export function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < input.length; i++) {
    const ch = input[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return input.slice(start, i + 1)
    }
  }
  return null
}

interface RawShape {
  scores?: Array<{ id?: unknown; score?: unknown; reasoning?: unknown }>
}

/**
 * Coerce an unknown value into a [0, 100] integer score. Returns null if
 * the value cannot be safely interpreted as a finite numeric score.
 *
 * Critically, this does NOT fall back to 0 — that was the original bug.
 */
export function coerceScore(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return Math.max(0, Math.min(100, Math.round(raw)))
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '' || /^(n\/?a|null|undefined|nan)$/i.test(trimmed)) return null
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.min(100, Math.round(n)))
  }
  return null
}

/**
 * Parse a raw LLM response into a list of valid score entries.
 *
 * Throws `ScoreParseError` when:
 *   - the input is empty
 *   - no JSON object can be located
 *   - the JSON does not contain a non-empty `scores` array of usable rows
 *
 * Returns valid entries; entries with unparseable scores are silently
 * dropped from the array (caller checks for missing ids and acts).
 */
export function parseScoringResponse(raw: string): ParsedScore[] {
  if (!raw || raw.trim() === '') {
    throw new ScoreParseError('empty_response', raw)
  }

  const stripped = stripMarkdownFence(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const candidate = extractFirstJsonObject(stripped)
    if (!candidate) throw new ScoreParseError('no_json_object', raw)
    try {
      parsed = JSON.parse(candidate)
    } catch (err) {
      throw new ScoreParseError(
        `invalid_json: ${err instanceof Error ? err.message : 'unknown'}`,
        raw,
      )
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ScoreParseError('not_an_object', raw)
  }

  const shape = parsed as RawShape
  if (!Array.isArray(shape.scores)) {
    throw new ScoreParseError('missing_scores_array', raw)
  }

  const out: ParsedScore[] = []
  for (const entry of shape.scores) {
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue
    const score = coerceScore(entry.score)
    if (score === null) continue
    const reasoning = typeof entry.reasoning === 'string' ? entry.reasoning.slice(0, 1000) : ''
    out.push({ id: entry.id, score, reasoning })
  }

  if (out.length === 0) {
    throw new ScoreParseError('no_valid_entries', raw)
  }

  return out
}
