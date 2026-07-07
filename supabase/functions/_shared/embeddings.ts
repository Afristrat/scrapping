/**
 * embeddings.ts — Embeddings + similarité cosinus (module partagé).
 *
 * Consommateurs : cluster-signals (clustering), topic-classifier et
 * enrich-signal (classification déterministe vers les topics connus —
 * le LLM est réservé à la proposition de NOUVEAUX topics).
 *
 * Coût : les appels /embeddings ne passent pas par dispatch-llm et ne sont
 * pas tracés dans llm_costs (précédent cluster-signals ; ~50-100× moins cher
 * qu'un appel génératif équivalent).
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getUserApiKey } from './api-keys.ts'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMS = 256

/** Taille max d'un chunk envoyé à l'API embeddings (limite OpenAI : 2048 inputs). */
const EMBEDDING_CHUNK_SIZE = 500

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>
  usage?: { prompt_tokens?: number; total_tokens?: number }
}

export interface EmbeddingKeys {
  openRouterKey: string | null
  openAiKey: string | null
}

/**
 * Calcule la similarité cosinus entre deux vecteurs de même dimension.
 * Retourne 0 si l'un des vecteurs est nul (norme zéro) ou si les dimensions divergent.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) return 0

  return dot / (normA * normB)
}

/** Détermine si deux vecteurs sont considérés similaires selon le seuil donné. */
export function isSimilar(similarity: number, threshold: number): boolean {
  return similarity > threshold
}

export interface SimilarityMatch {
  key: string
  similarity: number
}

/**
 * Classe les candidats par similarité cosinus décroissante avec la cible,
 * filtre sous le seuil, et retourne au plus `limit` correspondances.
 * Les candidats sans embedding (échec API partiel) sont ignorés.
 */
export function rankBySimilarity(
  target: number[] | undefined,
  candidates: Array<{ key: string; embedding: number[] | undefined }>,
  opts: { threshold: number; limit: number },
): SimilarityMatch[] {
  if (!target || target.length === 0) return []

  const matches: SimilarityMatch[] = []
  for (const candidate of candidates) {
    if (!candidate.embedding) continue
    const similarity = cosineSimilarity(target, candidate.embedding)
    if (isSimilar(similarity, opts.threshold)) {
      matches.push({ key: candidate.key, similarity })
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity)
  return matches.slice(0, opts.limit)
}

/**
 * Résout les clés utilisables pour l'API embeddings :
 * clé user (BYOK) si userId fourni, sinon fallback env (Maison).
 */
export async function resolveEmbeddingKeys(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<EmbeddingKeys> {
  const openRouterKey = userId
    ? await getUserApiKey(supabase, userId, 'openrouter')
    : (Deno.env.get('OPENROUTER_API_KEY') ?? null)

  const openAiKey = userId
    ? await getUserApiKey(supabase, userId, 'openai')
    : (Deno.env.get('OPENAI_API_KEY') ?? null)

  return { openRouterKey, openAiKey }
}

/**
 * Génère les embeddings pour un batch de textes via l'API OpenAI (ou OpenRouter comme proxy).
 * Retourne un tableau d'embeddings dans le même ordre que `texts`.
 * Les positions en échec valent `undefined` (jamais de throw).
 */
export async function fetchEmbeddingsBatch(
  texts: string[],
  openRouterKey: string | null,
  openAiKey: string | null,
): Promise<(number[] | undefined)[]> {
  if (texts.length === 0) return []

  // Préférer OpenAI directement pour les embeddings (OpenRouter les proxifie aussi)
  const apiKey = openAiKey ?? openRouterKey
  if (!apiKey) return texts.map(() => undefined)

  const baseUrl = openAiKey ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'

  const results: (number[] | undefined)[] = []
  for (let i = 0; i < texts.length; i += EMBEDDING_CHUNK_SIZE) {
    const chunk = texts.slice(i, i + EMBEDDING_CHUNK_SIZE)
    try {
      const resp = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: chunk,
          dimensions: EMBEDDING_DIMS,
          encoding_format: 'float',
        }),
      })

      if (!resp.ok) {
        console.error(`[embeddings] API error: ${resp.status} ${resp.statusText}`)
        results.push(...chunk.map(() => undefined))
        continue
      }

      const body = (await resp.json()) as EmbeddingResponse
      // L'API retourne data[] dans l'ordre de l'input (garanti par OpenAI)
      results.push(...body.data.map((d) => d.embedding))
    } catch (err) {
      console.error(`[embeddings] fetch exception:`, err)
      results.push(...chunk.map(() => undefined))
    }
  }
  return results
}
