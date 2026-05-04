/**
 * cluster.ts — Fonctions pures pour le clustering de signaux.
 * Séparées de index.ts pour permettre les tests unitaires Deno.
 */

/**
 * Calcule la similarité cosinus entre deux vecteurs de même dimension.
 * Retourne 0 si l'un des vecteurs est nul (norme zéro).
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

/**
 * Détermine si deux signaux sont considérés similaires selon le seuil donné.
 */
export function isSimilar(similarity: number, threshold: number): boolean {
  return similarity > threshold
}
