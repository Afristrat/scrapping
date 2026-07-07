/**
 * suggest.ts — Fonctions pures pour suggest-personas.
 * Exporté pour les tests unitaires Deno.
 */

import { parseLlmJson } from '../_shared/llm-json.ts'

export interface SuggestedHat {
  name: string
  key: string
  context_md: string
}

export interface SuggestedProject {
  name: string
  key: string
  context_md: string
  date_start: string
  date_end: string
}

export interface SuggestionsResult {
  hats: SuggestedHat[]
  projects: SuggestedProject[]
}

/**
 * Parse la réponse brute du LLM pour extraire les suggestions de personas.
 * Robuste aux markdown fences, aux champs manquants et aux JSON invalides.
 * Retourne { hats: [], projects: [] } en cas d'erreur.
 */
export function parseSuggestionsResponse(raw: string): SuggestionsResult {
  if (!raw || typeof raw !== 'string') return { hats: [], projects: [] }

  let parsed: unknown
  try {
    parsed = parseLlmJson(raw)
  } catch {
    return { hats: [], projects: [] }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { hats: [], projects: [] }
  }

  const obj = parsed as Record<string, unknown>

  const hats: SuggestedHat[] = []
  if (Array.isArray(obj.hats)) {
    for (const item of obj.hats) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).key === 'string'
      ) {
        const h = item as Record<string, unknown>
        hats.push({
          name: h.name as string,
          key: h.key as string,
          context_md: typeof h.context_md === 'string' ? h.context_md : '',
        })
      }
    }
  }

  const projects: SuggestedProject[] = []
  if (Array.isArray(obj.projects)) {
    for (const item of obj.projects) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).key === 'string'
      ) {
        const p = item as Record<string, unknown>
        projects.push({
          name: p.name as string,
          key: p.key as string,
          context_md: typeof p.context_md === 'string' ? p.context_md : '',
          date_start: typeof p.date_start === 'string' ? p.date_start : '',
          date_end: typeof p.date_end === 'string' ? p.date_end : '',
        })
      }
    }
  }

  return { hats, projects }
}
