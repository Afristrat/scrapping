/**
 * Tests Deno pour les fonctions pures de enrich-entities (NER).
 * Exécuter : deno test --allow-env supabase/functions/enrich-entities/ner.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { parseNerResponse } from './ner.ts'

// ─── parseNerResponse — JSON valide ─────────────────────────────────────────

Deno.test('parseNerResponse — JSON valide retourne entities', () => {
  const raw = JSON.stringify([
    { kind: 'person', canonical_name: 'Sam Altman', mention_text: 'Sam Altman' },
    { kind: 'organization', canonical_name: 'OpenAI', mention_text: 'OpenAI' },
    { kind: 'technology', canonical_name: 'GPT-4', mention_text: 'GPT-4' },
  ])
  const result = parseNerResponse(raw)
  assertEquals(result.length, 3)
  assertEquals(result[0].kind, 'person')
  assertEquals(result[0].canonical_name, 'Sam Altman')
  assertEquals(result[0].mention_text, 'Sam Altman')
})

// ─── parseNerResponse — Confidence par défaut ────────────────────────────────

Deno.test('parseNerResponse — confidence par défaut est 0.8', () => {
  const raw = JSON.stringify([
    { kind: 'product', canonical_name: 'Claude', mention_text: 'Claude' },
  ])
  const result = parseNerResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].confidence, 0.8)
})

// ─── parseNerResponse — JSON invalide → [] ──────────────────────────────────

Deno.test('parseNerResponse — JSON invalide retourne array vide', () => {
  const result = parseNerResponse('pas du JSON { invalide')
  assertEquals(result, [])
})

Deno.test('parseNerResponse — chaîne vide retourne array vide', () => {
  const result = parseNerResponse('')
  assertEquals(result, [])
})

// ─── parseNerResponse — Markdown fences stripped ────────────────────────────

Deno.test('parseNerResponse — markdown code fence stripped', () => {
  const raw =
    '```json\n[{ "kind": "organization", "canonical_name": "Anthropic", "mention_text": "Anthropic" }]\n```'
  const result = parseNerResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].canonical_name, 'Anthropic')
})

Deno.test('parseNerResponse — markdown fence sans json stripped', () => {
  const raw =
    '```\n[{ "kind": "technology", "canonical_name": "LangChain", "mention_text": "LangChain" }]\n```'
  const result = parseNerResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].kind, 'technology')
})

// ─── parseNerResponse — Filtres de validation ────────────────────────────────

Deno.test('parseNerResponse — kind invalide filtré', () => {
  const raw = JSON.stringify([
    { kind: 'unknown_kind', canonical_name: 'Foo', mention_text: 'Foo' },
    { kind: 'person', canonical_name: 'Valid Person', mention_text: 'Valid Person' },
  ])
  const result = parseNerResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].canonical_name, 'Valid Person')
})

Deno.test('parseNerResponse — canonical_name vide filtré', () => {
  const raw = JSON.stringify([
    { kind: 'person', canonical_name: '', mention_text: '' },
    { kind: 'organization', canonical_name: 'Kairos', mention_text: 'Kairos' },
  ])
  const result = parseNerResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].canonical_name, 'Kairos')
})

// ─── parseNerResponse — Déduplication ───────────────────────────────────────

Deno.test('parseNerResponse — déduplication par canonical_name case-insensitive', () => {
  const raw = JSON.stringify([
    { kind: 'organization', canonical_name: 'OpenAI', mention_text: 'OpenAI' },
    { kind: 'organization', canonical_name: 'openai', mention_text: 'openai' }, // doublon
    { kind: 'organization', canonical_name: 'OPENAI', mention_text: 'OPENAI' }, // doublon
    { kind: 'organization', canonical_name: 'Anthropic', mention_text: 'Anthropic' },
  ])
  const result = parseNerResponse(raw)
  assertEquals(result.length, 2)
  assertEquals(result[0].canonical_name, 'OpenAI')
  assertEquals(result[1].canonical_name, 'Anthropic')
})

// ─── parseNerResponse — Limite 8 entités ─────────────────────────────────────

Deno.test('parseNerResponse — max 8 entités respecté', () => {
  const entities = Array.from({ length: 12 }, (_, i) => ({
    kind: 'technology',
    canonical_name: `Tech-${i}`,
    mention_text: `Tech-${i}`,
  }))
  const raw = JSON.stringify(entities)
  const result = parseNerResponse(raw)
  assertEquals(result.length, 8)
})

// ─── parseNerResponse — mention_text fallback ────────────────────────────────

Deno.test('parseNerResponse — mention_text absent → fallback sur canonical_name', () => {
  const raw = JSON.stringify([{ kind: 'paper', canonical_name: 'Attention Is All You Need' }])
  const result = parseNerResponse(raw)
  assertEquals(result.length, 1)
  assertEquals(result[0].mention_text, 'Attention Is All You Need')
})
