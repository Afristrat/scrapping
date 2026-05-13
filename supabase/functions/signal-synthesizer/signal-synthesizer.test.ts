/**
 * Unit tests for signal-synthesizer (K05).
 *
 * Covers :
 *   - request body validation
 *   - hallucination detection (signal_ids in supporting / conflicting / cross_topic)
 *   - brief length boundary (249=fail, 250=ok, 400=ok, 401=fail)
 *   - coverage_map exhaustiveness over research_strategy.subjects
 *   - devil_advocate forced presence + type coherence
 *   - mono-source provenance warning
 *   - lang_distribution computation
 *   - topics count bounds (3-8)
 *   - key_signals_supporting bounds (3-6)
 *   - prompt construction (system + user)
 */

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@0.226'
import {
  buildSystemPrompt,
  buildUserPrompt,
  computeLangDistribution,
  type ResearchStrategy,
  safeJsonParse,
  type ScoredSignal,
  validateRequestBody,
  validateSynthesizerOutput,
} from './index.ts'

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

function makeSignal(overrides: Partial<ScoredSignal> = {}): ScoredSignal {
  return {
    id: 'sig_001',
    title: 'Signal de test',
    url: 'https://example.com/1',
    source: 'rss',
    lang: 'fr',
    score: 75,
    excerpt: 'Court extrait du signal pour scoring downstream.',
    disqualified: false,
    applied_boosts: [],
    ...overrides,
  }
}

function makeStrategy(subjectIds: string[] = ['s_001', 's_002']): ResearchStrategy {
  return {
    domain: 'politique',
    geo_scope: 'MA',
    language_mix: ['fr', 'ar'],
    subjects: subjectIds.map((id, i) => ({
      id,
      title: `Sujet ${i + 1}`,
      angle: 'actors',
    })),
    tensions: [],
    blind_spots: [],
    recursion_budget: 1,
  }
}

function brief(len: number): string {
  // Use a deterministic latin-1 filler so .length === code-units === chars
  // (matches the spec "characters incl. spaces").
  return 'a'.repeat(len)
}

const VALID_IDS = new Set([
  'sig_001',
  'sig_002',
  'sig_003',
  'sig_004',
  'sig_005',
  'sig_006',
  'sig_007',
  'sig_008',
  'sig_009',
])

function makeTopic(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't_001',
    label: 'Topic standard pour tests',
    summary: 'Résumé court qui décrit le cluster en quelques mots français.',
    type: 'regular',
    dominant_angle: 'actors',
    key_signals_supporting: ['sig_001', 'sig_002', 'sig_003'],
    key_signals_conflicting: [],
    cross_topic_conflicts: [],
    internal_tension: null,
    brief_variants: [
      {
        framework_hint: 'policy',
        brief: brief(300),
        rationale: 'Frame policy adapté au sujet.',
      },
    ],
    provenance: {
      lang_distribution: { fr: 3 },
      source_diversity_score: 0.8,
      freshness_median_days: 4,
    },
    confidence: 0.7,
    warnings: [],
    ...over,
  }
}

function makeDevilTopic(over: Record<string, unknown> = {}): Record<string, unknown> {
  return makeTopic({
    id: 't_devil',
    label: "Devil's advocate scénario contraire",
    type: 'devil_advocate',
    key_signals_supporting: ['sig_004', 'sig_005', 'sig_006'],
    ...over,
  })
}

function makeValidOutput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topics: [makeTopic(), makeTopic({ id: 't_002' }), makeDevilTopic()],
    coverage_map: {
      s_001: { signals_count: 5, covered: true, topics: ['t_001'] },
      s_002: { signals_count: 3, covered: true, topics: ['t_002'] },
    },
    cultural_warnings: [],
    devil_advocate_topic_id: 't_devil',
    ...over,
  }
}

// --------------------------------------------------------------------------
// Tests : validateRequestBody
// --------------------------------------------------------------------------

Deno.test('validateRequestBody : body well-formed → ok', () => {
  const r = validateRequestBody({
    signals: [makeSignal()],
    research_strategy: makeStrategy(),
    lang: 'fr',
  })
  assertEquals(r.ok, true)
})

Deno.test('validateRequestBody : signals not array → reject', () => {
  const r = validateRequestBody({
    signals: 'oops',
    research_strategy: makeStrategy(),
    lang: 'fr',
  })
  assertEquals(r.ok, false)
})

Deno.test('validateRequestBody : invalid lang → reject', () => {
  const r = validateRequestBody({
    signals: [],
    research_strategy: makeStrategy(),
    lang: 'pt',
  })
  assertEquals(r.ok, false)
})

Deno.test('validateRequestBody : research_strategy.subjects empty → reject', () => {
  const r = validateRequestBody({
    signals: [],
    research_strategy: { subjects: [] },
    lang: 'fr',
  })
  assertEquals(r.ok, false)
})

// --------------------------------------------------------------------------
// Tests : hallucination detection
// --------------------------------------------------------------------------

Deno.test('validateSynthesizerOutput : detects hallucinated supporting signal_id', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        key_signals_supporting: ['sig_001', 'sig_FAKE', 'sig_003'],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  assertEquals(r.hallucinated_ids.includes('sig_FAKE'), true)
})

Deno.test('validateSynthesizerOutput : detects hallucinated conflicting signal_id', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        key_signals_conflicting: ['sig_GHOST'],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  assertEquals(r.hallucinated_ids.includes('sig_GHOST'), true)
})

Deno.test('validateSynthesizerOutput : detects hallucinated cross_topic_conflict signal_id', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        cross_topic_conflicts: [
          {
            topic_id: 't_002',
            signal_id: 'sig_PHANTOM',
          },
        ],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  assertEquals(r.hallucinated_ids.includes('sig_PHANTOM'), true)
})

// --------------------------------------------------------------------------
// Tests : brief length boundaries (250-400 strict)
// --------------------------------------------------------------------------

Deno.test('brief 249 chars → fails', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        brief_variants: [
          {
            framework_hint: 'policy',
            brief: brief(249),
            rationale: 'x',
          },
        ],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const lengthErr = r.errors.find((e) => e.includes('brief_length'))
  assertEquals(typeof lengthErr, 'string')
})

Deno.test('brief 250 chars → ok', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        brief_variants: [
          {
            framework_hint: 'policy',
            brief: brief(250),
            rationale: 'x',
          },
        ],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, true)
})

Deno.test('brief 400 chars → ok', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        brief_variants: [
          {
            framework_hint: 'policy',
            brief: brief(400),
            rationale: 'x',
          },
        ],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, true)
})

Deno.test('brief 401 chars → fails', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        brief_variants: [
          {
            framework_hint: 'policy',
            brief: brief(401),
            rationale: 'x',
          },
        ],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
})

// --------------------------------------------------------------------------
// Tests : coverage_map exhaustiveness
// --------------------------------------------------------------------------

Deno.test('coverage_map : missing subject entry → fails', () => {
  const out = makeValidOutput({
    coverage_map: {
      s_001: { signals_count: 5, covered: true, topics: ['t_001'] },
      // s_002 missing on purpose
    },
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const missing = r.errors.find((e) => e.includes('coverage_map.missing_subject:s_002'))
  assertEquals(typeof missing, 'string')
})

Deno.test('coverage_map : entry for every subject (incl. uncovered=true count=0) → ok', () => {
  const out = makeValidOutput({
    coverage_map: {
      s_001: { signals_count: 5, covered: true, topics: ['t_001'] },
      s_002: { signals_count: 0, covered: false, topics: [] },
      s_003: { signals_count: 2, covered: true, topics: ['t_002'] },
    },
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002', 's_003'])
  assertEquals(r.ok, true)
})

// --------------------------------------------------------------------------
// Tests : devil_advocate forced + type coherent
// --------------------------------------------------------------------------

Deno.test('devil_advocate : missing topic with type=devil_advocate → fails', () => {
  const out = makeValidOutput({
    topics: [makeTopic(), makeTopic({ id: 't_002' }), makeTopic({ id: 't_003' })],
    devil_advocate_topic_id: 't_003',
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const dvErr = r.errors.find((e) => e.includes('no_devil_advocate_topic'))
  assertEquals(typeof dvErr, 'string')
})

Deno.test('devil_advocate : id points a regular topic → fails (type_mismatch)', () => {
  const out = makeValidOutput({
    topics: [makeTopic(), makeTopic({ id: 't_002' }), makeDevilTopic({ id: 't_devil' })],
    devil_advocate_topic_id: 't_001',
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const tErr = r.errors.find((e) => e.includes('type_mismatch'))
  assertEquals(typeof tErr, 'string')
})

Deno.test('devil_advocate : id unknown → fails', () => {
  const out = makeValidOutput({
    devil_advocate_topic_id: 't_doesnotexist',
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const uErr = r.errors.find((e) => e.includes('devil_advocate_topic_id_unknown'))
  assertEquals(typeof uErr, 'string')
})

// --------------------------------------------------------------------------
// Tests : mono-source warning
// --------------------------------------------------------------------------

Deno.test('mono_source_warning : provenance.source_diversity_score < 0.2 → warning', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        provenance: {
          lang_distribution: { fr: 3 },
          source_diversity_score: 0.1,
          freshness_median_days: 1,
        },
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, true)
  const w = r.warnings.find((x) => x.includes('mono_source_warning'))
  assertEquals(typeof w, 'string')
})

// --------------------------------------------------------------------------
// Tests : lang_distribution computation
// --------------------------------------------------------------------------

Deno.test('computeLangDistribution : aggregates by lang across signal ids', () => {
  const sigs: ScoredSignal[] = [
    makeSignal({ id: 'sig_001', lang: 'fr' }),
    makeSignal({ id: 'sig_002', lang: 'ar' }),
    makeSignal({ id: 'sig_003', lang: 'fr' }),
    makeSignal({ id: 'sig_004', lang: 'en' }),
  ]
  const dist = computeLangDistribution(sigs, ['sig_001', 'sig_002', 'sig_003', 'sig_004'])
  assertEquals(dist.fr, 2)
  assertEquals(dist.ar, 1)
  assertEquals(dist.en, 1)
})

Deno.test('computeLangDistribution : ignores unknown ids gracefully', () => {
  const sigs: ScoredSignal[] = [makeSignal({ id: 'sig_001', lang: 'fr' })]
  const dist = computeLangDistribution(sigs, ['sig_001', 'sig_unknown'])
  assertEquals(dist.fr, 1)
  assertEquals(dist.en, undefined)
})

// --------------------------------------------------------------------------
// Tests : topics count bounds (3-8)
// --------------------------------------------------------------------------

Deno.test('topics count : 2 → fails', () => {
  const out = makeValidOutput({
    topics: [makeTopic(), makeDevilTopic()],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const cErr = r.errors.find((e) => e.includes('topics_count_out_of_range'))
  assertEquals(typeof cErr, 'string')
})

Deno.test('topics count : 9 → fails', () => {
  const topics = Array.from({ length: 9 }, (_, i) => makeTopic({ id: `t_${i}` }))
  topics[8] = makeDevilTopic({ id: 't_devil' })
  const out = makeValidOutput({
    topics,
    devil_advocate_topic_id: 't_devil',
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
  const cErr = r.errors.find((e) => e.includes('topics_count_out_of_range'))
  assertEquals(typeof cErr, 'string')
})

// --------------------------------------------------------------------------
// Tests : key_signals_supporting bounds (3-6)
// --------------------------------------------------------------------------

Deno.test('key_signals_supporting : 2 ids → fails', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({ key_signals_supporting: ['sig_001', 'sig_002'] }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
})

Deno.test('key_signals_supporting : 7 ids → fails', () => {
  const out = makeValidOutput({
    topics: [
      makeTopic({
        key_signals_supporting: [
          'sig_001',
          'sig_002',
          'sig_003',
          'sig_004',
          'sig_005',
          'sig_006',
          'sig_007',
        ],
      }),
      makeTopic({ id: 't_002' }),
      makeDevilTopic(),
    ],
  })
  const r = validateSynthesizerOutput(out, VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, false)
})

// --------------------------------------------------------------------------
// Tests : prompt construction
// --------------------------------------------------------------------------

Deno.test('buildSystemPrompt : FR includes accent rule', () => {
  const p = buildSystemPrompt('fr')
  assertStringIncludes(p, 'Accents majuscules obligatoires')
  assertStringIncludes(p, '250-400')
  assertStringIncludes(p, 'devil_advocate')
})

Deno.test('buildSystemPrompt : AR includes RTL note', () => {
  const p = buildSystemPrompt('ar')
  assertStringIncludes(p, 'RTL')
})

Deno.test('buildUserPrompt : embeds signals as JSON + subjects', () => {
  const sigs = [makeSignal({ id: 'sig_001' }), makeSignal({ id: 'sig_002', lang: 'ar' })]
  const rs = makeStrategy(['s_001', 's_002', 's_003'])
  const p = buildUserPrompt(sigs, rs, 'fr')
  assertStringIncludes(p, 'Output language: fr')
  assertStringIncludes(p, 'sig_001')
  assertStringIncludes(p, 's_001')
  assertStringIncludes(p, 's_003')
})

// --------------------------------------------------------------------------
// Test : happy path validation
// --------------------------------------------------------------------------

Deno.test('validateSynthesizerOutput : full valid output → ok with no errors', () => {
  const r = validateSynthesizerOutput(makeValidOutput(), VALID_IDS, ['s_001', 's_002'])
  assertEquals(r.ok, true)
  assertEquals(r.errors.length, 0)
  assertEquals(r.hallucinated_ids.length, 0)
})

// --------------------------------------------------------------------------
// Tests : safeJsonParse — tolerant parser for LLM outputs
//
// Origine du fix : session a904c698 (Bassira prod 2026-05-13) a planté avec
// `validation_failed_after_retry: Expected double-quoted property name in
// JSON at position 2471 (line 44 column 6)`. Le LLM (DeepSeek BYOK) avait
// produit un JSON quasi-valide que le parser strict refusait.
// --------------------------------------------------------------------------

Deno.test('safeJsonParse : strict JSON valide → ok sans réparation', () => {
  const r = safeJsonParse('{"hello": "world", "n": 42}')
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.repaired, false)
    assertEquals((r.value as { n: number }).n, 42)
  }
})

Deno.test('safeJsonParse : input vide → erreur', () => {
  const r = safeJsonParse('')
  assertEquals(r.ok, false)
  if (!r.ok) assertStringIncludes(r.error, 'empty')
})

Deno.test('safeJsonParse : non-string → erreur', () => {
  // deno-lint-ignore no-explicit-any
  const r = safeJsonParse(42 as any)
  assertEquals(r.ok, false)
  if (!r.ok) assertStringIncludes(r.error, 'not_a_string')
})

Deno.test('safeJsonParse : strip markdown fence ```json → ok réparé', () => {
  const wrapped = '```json\n{"topics": [{"id": "t_001"}]}\n```'
  const r = safeJsonParse(wrapped)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.repaired, true)
    assertEquals((r.value as { topics: unknown[] }).topics.length, 1)
  }
})

Deno.test('safeJsonParse : strip fence ``` sans tag langue → ok réparé', () => {
  const wrapped = '```\n{"ok": true}\n```'
  const r = safeJsonParse(wrapped)
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.repaired, true)
})

Deno.test('safeJsonParse : préambule textuel avant { → slice + parse', () => {
  const raw = 'Voici le JSON demandé :\n\n{"topics": [], "coverage_map": {}}\n\nFin de réponse.'
  const r = safeJsonParse(raw)
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.repaired, true)
})

Deno.test('safeJsonParse : trailing comma dans object → réparé', () => {
  const raw = '{"a": 1, "b": 2,}'
  const r = safeJsonParse(raw)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.repaired, true)
    assertEquals((r.value as { b: number }).b, 2)
  }
})

Deno.test('safeJsonParse : trailing comma dans array → réparé', () => {
  const raw = '{"items": [1, 2, 3,]}'
  const r = safeJsonParse(raw)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.repaired, true)
    assertEquals((r.value as { items: number[] }).items.length, 3)
  }
})

Deno.test('safeJsonParse : combo fence + trailing comma + préambule → réparé', () => {
  const raw =
    'Sure, here is the JSON:\n```json\n{\n  "topics": [\n    { "id": "t_001", },\n  ],\n}\n```'
  const r = safeJsonParse(raw)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.repaired, true)
    const v = r.value as { topics: Array<{ id: string }> }
    assertEquals(v.topics[0].id, 't_001')
  }
})

Deno.test('safeJsonParse : JSON irréparable → erreur stable', () => {
  const r = safeJsonParse('{"key": value_unquoted}')
  assertEquals(r.ok, false)
  if (!r.ok) assertStringIncludes(r.error, 'parse_failed')
})

Deno.test('safeJsonParse : pas de { dans la string → erreur claire', () => {
  const r = safeJsonParse('just plain prose, no json here')
  assertEquals(r.ok, false)
  if (!r.ok) assertStringIncludes(r.error, 'no_json_object_found')
})
