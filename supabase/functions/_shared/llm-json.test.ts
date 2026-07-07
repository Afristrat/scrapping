// Tests Deno — llm-json.ts (parse tolérant des sorties LLM)
//
// Exécution : deno test --allow-env --node-modules-dir=auto supabase/functions/_shared/llm-json.test.ts

import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  extractBalancedJson,
  LlmJsonError,
  parseLlmJson,
  parseLlmJsonSafe,
  sanitizeLlmJson,
  stripControlChars,
  stripFences,
  stripInvisible,
  stripXmlNoise,
} from './llm-json.ts'

const NUL = String.fromCharCode(0)
const DEL = String.fromCharCode(127)
const BOM = String.fromCharCode(0xfeff)
const ZWSP = String.fromCharCode(0x200b)
const FENCE = String.fromCharCode(96, 96, 96)

// ─── stripXmlNoise ───────────────────────────────────────────────────────────

Deno.test('stripXmlNoise : bloc <thinking> avec contenu → purgé entièrement', () => {
  assertEquals(stripXmlNoise('<thinking>je réfléchis</thinking>{"a":1}'), '{"a":1}')
})

Deno.test('stripXmlNoise : balise orpheline non fermée → purgée', () => {
  assertEquals(stripXmlNoise('<tool_call>{"a":1}'), '{"a":1}')
  assertEquals(stripXmlNoise('</reasoning>{"a":1}'), '{"a":1}')
})

Deno.test('stripXmlNoise : texte sans balise → inchangé', () => {
  assertEquals(stripXmlNoise('{"a":"<b>gras</b>"}'), '{"a":"<b>gras</b>"}')
})

// ─── strip divers ────────────────────────────────────────────────────────────

Deno.test('stripControlChars : garde newline/tab/CR, retire NUL et DEL', () => {
  const input = 'a' + NUL + 'b' + DEL + 'c\nd\te\rf'
  assertEquals(stripControlChars(input), 'abc\nd\te\rf')
})

Deno.test('stripInvisible : BOM et zero-width retirés', () => {
  const input = BOM + '{"a":' + ZWSP + '1}'
  assertEquals(stripInvisible(input), '{"a":1}')
})

Deno.test('stripFences : fences json retirées', () => {
  assertEquals(stripFences(FENCE + 'json\n{"a":1}\n' + FENCE), '{"a":1}')
  assertEquals(stripFences(FENCE + '\n[1,2]\n' + FENCE), '[1,2]')
})

Deno.test('sanitizeLlmJson : pipeline complet (noise + BOM + fence)', () => {
  const raw = BOM + '<thinking>hmm</thinking>' + FENCE + 'json\n{"a": 1}\n' + FENCE
  assertEquals(sanitizeLlmJson(raw), '{"a": 1}')
})

// ─── extractBalancedJson ─────────────────────────────────────────────────────

Deno.test('extractBalancedJson : objet noyé dans du texte', () => {
  assertEquals(extractBalancedJson('Voici : {"a":{"b":2}} merci'), '{"a":{"b":2}}')
})

Deno.test('extractBalancedJson : array en premier → extrait le tableau', () => {
  assertEquals(extractBalancedJson('réponse [1,{"a":2}] fin'), '[1,{"a":2}]')
})

Deno.test('extractBalancedJson : accolades dans les strings ignorées', () => {
  assertEquals(extractBalancedJson('{"a":"}{"}'), '{"a":"}{"}')
})

Deno.test('extractBalancedJson : pas de JSON → null ; déséquilibré → null', () => {
  assertEquals(extractBalancedJson('aucun json ici'), null)
  assertEquals(extractBalancedJson('{"a": 1'), null)
})

// ─── parseLlmJson ────────────────────────────────────────────────────────────

Deno.test('parseLlmJson : JSON pur', () => {
  assertEquals(parseLlmJson('{"a":1}'), { a: 1 })
})

Deno.test('parseLlmJson : fence + CoT + préambule texte', () => {
  const raw =
    '<thinking>bon</thinking>Voici le résultat :\n' + FENCE + 'json\n{"score": 42}\n' + FENCE
  assertEquals(parseLlmJson(raw), { score: 42 })
})

Deno.test('parseLlmJson : array avec texte autour', () => {
  assertEquals(parseLlmJson('résultat : [{"k":"v"}] voilà'), [{ k: 'v' }])
})

Deno.test('parseLlmJson : erreurs typées', () => {
  assertThrows(() => parseLlmJson(''), LlmJsonError, 'empty_response')
  assertThrows(() => parseLlmJson('pas de json'), LlmJsonError, 'no_json')
  assertThrows(() => parseLlmJson('{"a": oops}'), LlmJsonError, 'invalid_json')
})

Deno.test('parseLlmJsonSafe : null sur échec, valeur sinon', () => {
  assertEquals(parseLlmJsonSafe('nope'), null)
  assertEquals(parseLlmJsonSafe('{"ok":true}'), { ok: true })
})
