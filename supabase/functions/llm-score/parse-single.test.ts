// Tests Deno — llm-score/parse-single.ts
// Exec : deno test supabase/functions/llm-score/parse-single.test.ts
import { assertEquals } from 'jsr:@std/assert@1'
import { parseScoreResponse } from './parse-single.ts'

Deno.test('JSON pur valide → score coercé', () => {
  const r = parseScoreResponse('{"score": 87, "reasoning": "pertinent"}')
  assertEquals(r.score, 87)
  assertEquals(r.reasoning, 'pertinent')
})

Deno.test('score entouré de prose → extrait, pas 0', () => {
  const r = parseScoreResponse('Voici le score : {"score": 42, "reasoning": "ok"} merci')
  assertEquals(r.score, 42)
})

Deno.test('score dans une fence markdown → extrait', () => {
  const r = parseScoreResponse('```json\n{"score": 63, "reasoning": "x"}\n```')
  assertEquals(r.score, 63)
})

Deno.test('sortie non-JSON → score null (JAMAIS 0) — le bug historique', () => {
  assertEquals(parseScoreResponse('je ne peux pas scorer').score, null)
  assertEquals(parseScoreResponse('').score, null)
  assertEquals(parseScoreResponse('{ cassé').score, null)
})

Deno.test('score "n/a" ou non fini → null, pas 0', () => {
  assertEquals(parseScoreResponse('{"score": "n/a"}').score, null)
  assertEquals(parseScoreResponse('{"score": null}').score, null)
})

Deno.test('un vrai 0 du LLM reste 0 (distinct de illisible)', () => {
  assertEquals(parseScoreResponse('{"score": 0, "reasoning": "hors sujet"}').score, 0)
})

Deno.test('score > 100 clampé', () => {
  assertEquals(parseScoreResponse('{"score": 150}').score, 100)
})
