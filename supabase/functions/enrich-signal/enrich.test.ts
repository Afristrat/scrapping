/**
 * Tests Deno pour les fonctions pures de enrich-signal.
 * Exécuter : deno test --allow-env supabase/functions/enrich-signal/enrich.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { parseTopicsResponse, parsePersonasResponse } from './enrich.ts'

// ─── parseTopicsResponse ────────────────────────────────────────────────────

Deno.test('parseTopicsResponse — parse valide retourne topics filtrés', () => {
  const raw = JSON.stringify([
    { slug: 'llm-foundation', confidence: 0.9 },
    { slug: 'agent-frameworks', confidence: 0.7 },
    { slug: 'low-signal', confidence: 0.3 }, // sous le seuil 0.5 → filtré
  ])
  const result = parseTopicsResponse(raw)
  assertEquals(result.length, 2)
  assertEquals(result[0].slug, 'llm-foundation')
  assertEquals(result[0].confidence, 0.9)
  assertEquals(result[1].slug, 'agent-frameworks')
})

Deno.test('parseTopicsResponse — JSON invalide retourne array vide', () => {
  const result = parseTopicsResponse('pas du JSON { invalide')
  assertEquals(result, [])
})

Deno.test('parseTopicsResponse — filtre confidence <= 0.5 strictement', () => {
  const raw = JSON.stringify([
    { slug: 'topic-a', confidence: 0.5 }, // exactement 0.5 → filtré (seuil strict > 0.5)
    { slug: 'topic-b', confidence: 0.51 }, // au-dessus → gardé
    { slug: 'topic-c', confidence: 0.0 }, // zéro → filtré
  ])
  const result = parseTopicsResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].slug, 'topic-b')
})

Deno.test('parseTopicsResponse — markdown code fence stripped', () => {
  const raw = '```json\n[{ "slug": "ai-infra", "confidence": 0.8 }]\n```'
  const result = parseTopicsResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].slug, 'ai-infra')
})

// ─── parsePersonasResponse ───────────────────────────────────────────────────

Deno.test('parsePersonasResponse — parse valide retourne personas filtrées', () => {
  const raw = JSON.stringify([
    { persona_key: 'cto', relevance: 0.8, reasoning: 'Directement lié aux décisions infra.' },
    { persona_key: 'investor', relevance: 0.6, reasoning: 'Opportunité de marché.' },
    { persona_key: 'irrelevant', relevance: 0.2 }, // sous le seuil 0.4 → filtré
  ])
  const result = parsePersonasResponse(raw)
  assertEquals(result.length, 2)
  assertEquals(result[0].persona_key, 'cto')
  assertEquals(result[0].relevance, 0.8)
  assertEquals(result[0].reasoning, 'Directement lié aux décisions infra.')
})

Deno.test('parsePersonasResponse — relevance filter strict > 0.4', () => {
  const raw = JSON.stringify([
    { persona_key: 'p1', relevance: 0.4, reasoning: 'Limite' }, // exactement 0.4 → filtré
    { persona_key: 'p2', relevance: 0.41, reasoning: 'Juste au-dessus' }, // gardé
  ])
  const result = parsePersonasResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].persona_key, 'p2')
})
