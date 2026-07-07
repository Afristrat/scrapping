/**
 * embeddings.test.ts — Tests du classement par similarité (rankBySimilarity).
 * cosineSimilarity/isSimilar sont couverts par cluster-signals/cluster.test.ts
 * (qui teste les ré-exports, mêmes implémentations).
 */

import { assertEquals } from 'jsr:@std/assert@1'
import { rankBySimilarity } from './embeddings.ts'

Deno.test('rankBySimilarity — classe par similarité décroissante', () => {
  const target = [1, 0]
  const candidates = [
    { key: 'orthogonal', embedding: [0, 1] },
    { key: 'identique', embedding: [1, 0] },
    { key: 'proche', embedding: [0.9, 0.1] },
  ]
  const result = rankBySimilarity(target, candidates, { threshold: 0.5, limit: 3 })
  assertEquals(
    result.map((r) => r.key),
    ['identique', 'proche'],
  )
  assertEquals(result[0].similarity, 1)
})

Deno.test('rankBySimilarity — filtre sous le seuil', () => {
  const target = [1, 0]
  const candidates = [
    { key: 'faible', embedding: [0.3, 0.95] },
    { key: 'fort', embedding: [1, 0.01] },
  ]
  const result = rankBySimilarity(target, candidates, { threshold: 0.9, limit: 3 })
  assertEquals(
    result.map((r) => r.key),
    ['fort'],
  )
})

Deno.test('rankBySimilarity — respecte la limite', () => {
  const target = [1, 0]
  const candidates = [
    { key: 'a', embedding: [1, 0] },
    { key: 'b', embedding: [0.99, 0.01] },
    { key: 'c', embedding: [0.98, 0.02] },
  ]
  const result = rankBySimilarity(target, candidates, { threshold: 0.5, limit: 2 })
  assertEquals(result.length, 2)
  assertEquals(result[0].key, 'a')
})

Deno.test('rankBySimilarity — ignore les candidats sans embedding (échec API partiel)', () => {
  const target = [1, 0]
  const candidates = [
    { key: 'absent', embedding: undefined },
    { key: 'present', embedding: [1, 0] },
  ]
  const result = rankBySimilarity(target, candidates, { threshold: 0.5, limit: 3 })
  assertEquals(
    result.map((r) => r.key),
    ['present'],
  )
})

Deno.test('rankBySimilarity — cible absente ou vide → []', () => {
  const candidates = [{ key: 'a', embedding: [1, 0] }]
  assertEquals(rankBySimilarity(undefined, candidates, { threshold: 0.1, limit: 3 }), [])
  assertEquals(rankBySimilarity([], candidates, { threshold: 0.1, limit: 3 }), [])
})

Deno.test('rankBySimilarity — aucun candidat → []', () => {
  assertEquals(rankBySimilarity([1, 0], [], { threshold: 0.1, limit: 3 }), [])
})
