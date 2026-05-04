/**
 * Tests Deno pour les fonctions pures de cluster-signals.
 * Exécuter : deno test --allow-env supabase/functions/cluster-signals/cluster.test.ts
 */
import { assertEquals, assertAlmostEquals } from 'jsr:@std/assert@1'
import { cosineSimilarity, isSimilar } from './cluster.ts'

// ─── cosineSimilarity ────────────────────────────────────────────────────────

Deno.test('cosineSimilarity — vecteurs identiques → 1.0', () => {
  const v = [1.0, 0.5, 0.8, 0.3]
  assertAlmostEquals(cosineSimilarity(v, v), 1.0, 1e-9)
})

Deno.test('cosineSimilarity — vecteurs orthogonaux → 0.0', () => {
  const a = [1.0, 0.0]
  const b = [0.0, 1.0]
  assertAlmostEquals(cosineSimilarity(a, b), 0.0, 1e-9)
})

Deno.test('cosineSimilarity — vecteurs opposés → -1.0', () => {
  const a = [1.0, 0.0]
  const b = [-1.0, 0.0]
  assertAlmostEquals(cosineSimilarity(a, b), -1.0, 1e-9)
})

Deno.test('cosineSimilarity — vecteur nul retourne 0', () => {
  const a = [0.0, 0.0, 0.0]
  const b = [1.0, 2.0, 3.0]
  assertEquals(cosineSimilarity(a, b), 0)
})

Deno.test('cosineSimilarity — vecteurs vides retourne 0', () => {
  assertEquals(cosineSimilarity([], []), 0)
})

Deno.test('cosineSimilarity — dimensions différentes retourne 0', () => {
  const a = [1.0, 0.5]
  const b = [1.0, 0.5, 0.8]
  assertEquals(cosineSimilarity(a, b), 0)
})

Deno.test('cosineSimilarity — valeur intermédiaire correcte', () => {
  // cos(45°) = √2/2 ≈ 0.7071
  const a = [1.0, 0.0]
  const b = [1.0, 1.0]
  assertAlmostEquals(cosineSimilarity(a, b), Math.SQRT2 / 2, 1e-9)
})

// ─── isSimilar ───────────────────────────────────────────────────────────────

Deno.test('isSimilar — sim=0.85, threshold=0.80 → true', () => {
  assertEquals(isSimilar(0.85, 0.8), true)
})

Deno.test('isSimilar — sim=0.80, threshold=0.80 → false (seuil strict)', () => {
  assertEquals(isSimilar(0.8, 0.8), false)
})

Deno.test('isSimilar — sim=0.79, threshold=0.80 → false', () => {
  assertEquals(isSimilar(0.79, 0.8), false)
})

Deno.test('isSimilar — sim=0.81, threshold=0.80 → true', () => {
  assertEquals(isSimilar(0.81, 0.8), true)
})

Deno.test('isSimilar — sim=1.0, threshold=0.80 → true (identique)', () => {
  assertEquals(isSimilar(1.0, 0.8), true)
})

Deno.test('isSimilar — sim=0.0, threshold=0.80 → false', () => {
  assertEquals(isSimilar(0.0, 0.8), false)
})
