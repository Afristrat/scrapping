/**
 * _shared/embeddings.test.ts — Tests purs sur les helpers d'embeddings.
 *
 * Run : deno test --allow-env --node-modules-dir=auto \
 *         supabase/functions/_shared/embeddings.test.ts
 */

import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  EMBEDDING_DIMS,
  EMBEDDING_DIMS_FALLBACK,
  meanEmbedding,
  NoEmbeddingProviderError,
  toPgVector,
} from './embeddings.ts'

// =============================================================================
// Constants
// =============================================================================

Deno.test('EMBEDDING_DIMS = 1024 (sweet spot Qwen3 Matryoshka)', () => {
  assertEquals(EMBEDDING_DIMS, 1024)
})

Deno.test('EMBEDDING_DIMS_FALLBACK = 1024 (parité Qwen ↔ OpenAI)', () => {
  assertEquals(EMBEDDING_DIMS_FALLBACK, 1024)
})

// =============================================================================
// toPgVector
// =============================================================================

Deno.test('toPgVector: format pgvector text [v1,v2,v3]', () => {
  const out = toPgVector([0.1, 0.2, 0.3])
  assertEquals(out, '[0.1000000,0.2000000,0.3000000]')
})

Deno.test('toPgVector: precision 7 décimales', () => {
  const out = toPgVector([0.123456789, 1])
  assertEquals(out, '[0.1234568,1.0000000]')
})

Deno.test('toPgVector: array vide → []', () => {
  assertEquals(toPgVector([]), '[]')
})

// =============================================================================
// meanEmbedding
// =============================================================================

Deno.test('meanEmbedding: single embedding retourné tel quel', () => {
  const e = [0.1, 0.2, 0.3]
  assertEquals(meanEmbedding([e]), e)
})

Deno.test('meanEmbedding: empty input → throw', () => {
  assertThrows(() => meanEmbedding([]), Error, 'meanEmbedding_called_with_empty_input')
})

Deno.test('meanEmbedding: dim mismatch → throw', () => {
  assertThrows(
    () =>
      meanEmbedding([
        [1, 2, 3],
        [1, 2],
      ]),
    Error,
    'meanEmbedding_dim_mismatch',
  )
})

Deno.test('meanEmbedding: deux embeddings → moyenne L2-normalisée', () => {
  // [3, 4] et [3, 4] → mean = [3, 4], norm = 5, normalized = [0.6, 0.8]
  const out = meanEmbedding([
    [3, 4],
    [3, 4],
  ])
  assertEquals(out.length, 2)
  // Tolérance flottante
  const ok = Math.abs(out[0] - 0.6) < 1e-6 && Math.abs(out[1] - 0.8) < 1e-6
  assertEquals(ok, true)
})

Deno.test('meanEmbedding: trois embeddings orthogonaux → centroid normalisé', () => {
  const out = meanEmbedding([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ])
  // mean = [1/3, 1/3, 1/3], norm = sqrt(3)/3 = 1/sqrt(3)
  // normalized = [1/sqrt(3), 1/sqrt(3), 1/sqrt(3)] ≈ [0.5773, 0.5773, 0.5773]
  const expected = 1 / Math.sqrt(3)
  for (const v of out) {
    const ok = Math.abs(v - expected) < 1e-6
    assertEquals(ok, true)
  }
})

Deno.test('meanEmbedding: norm zéro → retourne sans crash', () => {
  // [0, 0] mean après normalisation → reste [0, 0] (edge case sans normalize)
  const out = meanEmbedding([
    [0, 0],
    [0, 0],
  ])
  assertEquals(out, [0, 0])
})

// =============================================================================
// NoEmbeddingProviderError sentinel
// =============================================================================

Deno.test('NoEmbeddingProviderError: instance + message stable', () => {
  const err = new NoEmbeddingProviderError()
  assertEquals(err instanceof Error, true)
  assertEquals(err instanceof NoEmbeddingProviderError, true)
  assertEquals(err.message, 'no_embedding_provider_available')
  assertEquals(err.name, 'NoEmbeddingProviderError')
})
