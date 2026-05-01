import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  coerceScore,
  extractFirstJsonObject,
  parseScoringResponse,
  ScoreParseError,
  stripMarkdownFence,
} from '../_shared/parse-score.ts'

Deno.test('parseScoringResponse: clean JSON object', () => {
  const raw = JSON.stringify({
    scores: [{ id: 'a-1', score: 75, reasoning: 'Pertinent IA' }],
  })
  const out = parseScoringResponse(raw)
  assertEquals(out.length, 1)
  assertEquals(out[0].id, 'a-1')
  assertEquals(out[0].score, 75)
  assertEquals(out[0].reasoning, 'Pertinent IA')
})

Deno.test('parseScoringResponse: markdown ```json fence wrapper', () => {
  const raw = '```json\n{"scores":[{"id":"x","score":42,"reasoning":"meh"}]}\n```'
  const out = parseScoringResponse(raw)
  assertEquals(out.length, 1)
  assertEquals(out[0].score, 42)
})

Deno.test('parseScoringResponse: bare ``` fence (no json language tag)', () => {
  const raw = '```\n{"scores":[{"id":"x","score":10,"reasoning":""}]}\n```'
  const out = parseScoringResponse(raw)
  assertEquals(out[0].score, 10)
})

Deno.test('parseScoringResponse: leading prose before JSON', () => {
  const raw =
    'Voici les scores demandés : {"scores":[{"id":"abc","score":88,"reasoning":"très bon"}]} merci.'
  const out = parseScoringResponse(raw)
  assertEquals(out.length, 1)
  assertEquals(out[0].id, 'abc')
  assertEquals(out[0].score, 88)
})

Deno.test('parseScoringResponse: score as string is coerced', () => {
  const raw = '{"scores":[{"id":"a","score":"73","reasoning":"r"}]}'
  const out = parseScoringResponse(raw)
  assertEquals(out[0].score, 73)
})

Deno.test('parseScoringResponse: score out of range is clamped', () => {
  const high = '{"scores":[{"id":"a","score":150,"reasoning":""}]}'
  const low = '{"scores":[{"id":"b","score":-30,"reasoning":""}]}'
  assertEquals(parseScoringResponse(high)[0].score, 100)
  assertEquals(parseScoringResponse(low)[0].score, 0)
})

Deno.test('parseScoringResponse: NaN / non-numeric scores are DROPPED, not zeroed', () => {
  const raw =
    '{"scores":[{"id":"a","score":"n/a","reasoning":""},{"id":"b","score":"oops","reasoning":""},{"id":"c","score":50,"reasoning":""}]}'
  const out = parseScoringResponse(raw)
  assertEquals(out.length, 1)
  assertEquals(out[0].id, 'c')
})

Deno.test('parseScoringResponse: empty string throws ScoreParseError', () => {
  assertThrows(() => parseScoringResponse(''), ScoreParseError, 'empty_response')
})

Deno.test('parseScoringResponse: whitespace-only input throws', () => {
  assertThrows(() => parseScoringResponse('   \n\n  '), ScoreParseError, 'empty_response')
})

Deno.test('parseScoringResponse: pure prose without JSON throws', () => {
  assertThrows(
    () => parseScoringResponse('Désolé, je ne peux pas scorer ces signaux.'),
    ScoreParseError,
    'no_json_object',
  )
})

Deno.test('parseScoringResponse: missing scores array throws', () => {
  assertThrows(
    () => parseScoringResponse('{"results":[]}'),
    ScoreParseError,
    'missing_scores_array',
  )
})

Deno.test('parseScoringResponse: empty scores array throws (no valid entries)', () => {
  assertThrows(() => parseScoringResponse('{"scores":[]}'), ScoreParseError, 'no_valid_entries')
})

Deno.test('parseScoringResponse: all entries invalid throws (no valid entries)', () => {
  // Two entries, both unparseable scores → caller should NOT write a row
  assertThrows(
    () => parseScoringResponse('{"scores":[{"id":"a","score":"n/a"},{"id":"b","score":null}]}'),
    ScoreParseError,
    'no_valid_entries',
  )
})

Deno.test('parseScoringResponse: nested object with extra keys still parses', () => {
  const raw =
    '{"meta":{"model":"gpt-4"},"scores":[{"id":"a","score":60,"reasoning":"ok","extra":"junk"}]}'
  const out = parseScoringResponse(raw)
  assertEquals(out.length, 1)
  assertEquals(out[0].score, 60)
})

Deno.test('parseScoringResponse: reasoning truncated at 1000 chars', () => {
  const longReasoning = 'a'.repeat(2000)
  const raw = JSON.stringify({
    scores: [{ id: 'x', score: 50, reasoning: longReasoning }],
  })
  const out = parseScoringResponse(raw)
  assertEquals(out[0].reasoning.length, 1000)
})

Deno.test('parseScoringResponse: missing reasoning falls back to empty string', () => {
  const raw = '{"scores":[{"id":"a","score":50}]}'
  const out = parseScoringResponse(raw)
  assertEquals(out[0].reasoning, '')
})

Deno.test('parseScoringResponse: float scores are rounded', () => {
  const raw = '{"scores":[{"id":"a","score":72.6,"reasoning":""}]}'
  const out = parseScoringResponse(raw)
  assertEquals(out[0].score, 73)
})

Deno.test('stripMarkdownFence: ```json...``` wrapper', () => {
  assertEquals(stripMarkdownFence('```json\n{"a":1}\n```'), '{"a":1}')
})

Deno.test('stripMarkdownFence: ```...``` wrapper (no language)', () => {
  assertEquals(stripMarkdownFence('```\n{"a":1}\n```'), '{"a":1}')
})

Deno.test('stripMarkdownFence: no fence returns trimmed input', () => {
  assertEquals(stripMarkdownFence('  {"a":1}  '), '{"a":1}')
})

Deno.test('extractFirstJsonObject: ignores braces inside strings', () => {
  const input = 'prefix {"key":"has {fake} braces"} suffix'
  assertEquals(extractFirstJsonObject(input), '{"key":"has {fake} braces"}')
})

Deno.test('extractFirstJsonObject: handles nested objects', () => {
  const input = 'x {"a":{"b":1}} y'
  assertEquals(extractFirstJsonObject(input), '{"a":{"b":1}}')
})

Deno.test('extractFirstJsonObject: returns null when no object present', () => {
  assertEquals(extractFirstJsonObject('no object here'), null)
})

Deno.test('coerceScore: number → integer in [0,100]', () => {
  assertEquals(coerceScore(42), 42)
  assertEquals(coerceScore(42.7), 43)
  assertEquals(coerceScore(-5), 0)
  assertEquals(coerceScore(200), 100)
})

Deno.test('coerceScore: NaN/Infinity → null', () => {
  assertEquals(coerceScore(NaN), null)
  assertEquals(coerceScore(Infinity), null)
  assertEquals(coerceScore(-Infinity), null)
})

Deno.test('coerceScore: string sentinels → null', () => {
  assertEquals(coerceScore('n/a'), null)
  assertEquals(coerceScore('N/A'), null)
  assertEquals(coerceScore('null'), null)
  assertEquals(coerceScore('NaN'), null)
  assertEquals(coerceScore(''), null)
  assertEquals(coerceScore('   '), null)
})

Deno.test('coerceScore: numeric string → number', () => {
  assertEquals(coerceScore('75'), 75)
  assertEquals(coerceScore('  42  '), 42)
})

Deno.test('coerceScore: non-string non-number → null', () => {
  assertEquals(coerceScore(null), null)
  assertEquals(coerceScore(undefined), null)
  assertEquals(coerceScore({}), null)
  assertEquals(coerceScore([]), null)
  assertEquals(coerceScore(true), null)
})
