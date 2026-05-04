/**
 * Tests Deno pour les fonctions pures de compute-reputation.
 * Exécuter : deno test --allow-env supabase/functions/compute-reputation/reputation.test.ts
 */
import { assertEquals, assertAlmostEquals } from 'jsr:@std/assert@1'
import { computeReputationScore } from './reputation.ts'

// ─── 0 total → 0 ─────────────────────────────────────────────────────────────

Deno.test('computeReputationScore — 0 total retourne 0', () => {
  assertEquals(computeReputationScore(0, 0), 0)
})

Deno.test('computeReputationScore — 0 total, nHigh ignoré retourne 0', () => {
  assertEquals(computeReputationScore(0, 5), 0)
})

// ─── 10 total, 10 high → score élevé ─────────────────────────────────────────

Deno.test('computeReputationScore — 10 total, 10 high → score élevé (> 0.7)', () => {
  const score = computeReputationScore(10, 10)
  // ratio = 1.0, volume = log(11)/10 ≈ 0.2398
  // raw = 1.0 × 0.8 + 0.2398 × 0.2 = 0.8 + 0.04796 = 0.8479…
  // clamped = min(1, 0.8479) = 0.8479
  assertAlmostEquals(score, 0.847976, 1e-4)
})

// ─── 100 total, 0 high → score faible ────────────────────────────────────────

Deno.test('computeReputationScore — 100 total, 0 high → score faible (< 0.1)', () => {
  const score = computeReputationScore(100, 0)
  // ratio = 0, volume = log(101)/10 ≈ 0.4615
  // raw = 0 × 0.8 + 0.4615 × 0.2 = 0.09231…
  assertAlmostEquals(score, 0.09231, 1e-4)
})

// ─── Clamp [0, 1] ─────────────────────────────────────────────────────────────

Deno.test('computeReputationScore — résultat jamais supérieur à 1', () => {
  // Avec un très grand nombre de signaux tous high, le volume pousse au-delà de 1
  const score = computeReputationScore(100_000, 100_000)
  assertEquals(score, 1)
})

Deno.test('computeReputationScore — résultat jamais inférieur à 0', () => {
  const score = computeReputationScore(1, 0)
  // ratio = 0, volume = log(2)/10 ≈ 0.06931 → raw ≈ 0.01386 → ≥ 0
  assertEquals(score >= 0, true)
})

// ─── Cas intermédiaires ────────────────────────────────────────────────────────

Deno.test('computeReputationScore — 1 total, 1 high → score cohérent', () => {
  const score = computeReputationScore(1, 1)
  // ratio = 1, volume = log(2)/10 ≈ 0.06931
  // raw = 0.8 + 0.06931 × 0.2 = 0.8 + 0.01386 = 0.81386
  assertAlmostEquals(score, 0.813863, 1e-4)
})

Deno.test('computeReputationScore — 50 total, 25 high → score moyen', () => {
  const score = computeReputationScore(50, 25)
  // ratio = 0.5, volume = log(51)/10 ≈ 0.39318
  // raw = 0.5 × 0.8 + 0.39318 × 0.2 = 0.4 + 0.07864 = 0.47864
  assertAlmostEquals(score, 0.47864, 1e-3)
})
