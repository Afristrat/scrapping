// llm-score/parse-single.ts
// Parseur single-score (une réponse LLM = un signal), réutilisant les
// primitives durcies de _shared/parse-score.ts. Extrait en module séparé pour
// être testable sans déclencher le Deno.serve de index.ts.
import { coerceScore, extractFirstJsonObject, stripMarkdownFence } from '../_shared/parse-score.ts'

/**
 * Retourne `score: null` si le score est illisible — JAMAIS 0 (c'était le bug
 * historique : faux zéros au dashboard + signal sorti de unscored_signals).
 * Le caller saute l'écriture DB quand score === null.
 */
export function parseScoreResponse(raw: string): { score: number | null; reasoning: string } {
  const stripped = stripMarkdownFence(raw ?? '')
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const candidate = extractFirstJsonObject(stripped)
    if (!candidate) return { score: null, reasoning: '(invalid LLM output)' }
    try {
      parsed = JSON.parse(candidate)
    } catch {
      return { score: null, reasoning: '(invalid LLM output)' }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { score: null, reasoning: '(invalid LLM output)' }
  }
  const obj = parsed as { score?: unknown; reasoning?: unknown }
  const score = coerceScore(obj.score)
  const reasoning =
    typeof obj.reasoning === 'string' ? obj.reasoning.slice(0, 1000) : '(no reasoning)'
  return { score, reasoning }
}
