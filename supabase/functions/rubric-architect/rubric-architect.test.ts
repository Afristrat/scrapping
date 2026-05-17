// BYOK strict — no model imposed.
//
// Tests unitaires pour rubric-architect (Story Ralph K02).
// Couvre les helpers purs : validateRubricSchema, validateWeightSum,
// validateDisqualifiers, validateSoftBoosts, validateCalibrationExamples,
// validateScoringPrompt, sanitizeLlmOutput, buildCorrectionMessage,
// buildSystemPrompt.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@0.226'

import {
  buildCorrectionMessage,
  buildSystemPrompt,
  type CalibrationExample,
  type Disqualifier,
  normalizeCalibrationExamples,
  normalizeCriteriaCount,
  normalizeDisqualifiersCount,
  normalizeScoringPromptLength,
  normalizeSoftBoosts,
  type Rubric,
  sanitizeLlmOutput,
  type SoftBoost,
  validateCalibrationExamples,
  validateDisqualifiers,
  validateRubricSchema,
  validateScoringPrompt,
  validateSoftBoosts,
  validateWeightSum,
} from './index.ts'

// =============================================================================
// Fixture helpers
// =============================================================================

function fixtureScoringPrompt(): string {
  // ~250 mots — dans la fourchette 200-500.
  const segment =
    "Tu es un analyste qui évalue la pertinence d'un signal d'actualité par rapport à un sujet d'étude prospective. La rubric a TROIS couches. Premièrement, score continu de 0 à 100 sur les critères pondérés dont la somme fait 100. Deuxièmement, des DISQUALIFIERS qui mettent à 0 si le signal matche. Troisièmement, des SOFT_BOOSTS qui ajoutent jusqu'à 40 points après le score continu. Concentre-toi sur la pertinence concrète et observable. Un signal vague qui mentionne le sujet sans rapport vaut autour de 10. Un signal précis qui cite un acteur clé avec une donnée chiffrée vaut 80 ou plus. Un signal en langue minoritaire du dossier mérite un boost. Un signal qui contredit la lecture dominante mérite un boost. Privilégie les signaux datés de moins de six mois. Justifie en une à deux phrases ton score final, en mentionnant si un disqualifier ou un boost s'est appliqué. "
  return segment.repeat(2).trim()
}

function fixtureValidRubric(): Rubric {
  return {
    scoring_prompt: fixtureScoringPrompt(),
    criteria: [
      ['topical_match', 30],
      ['actor_relevance', 25],
      ['data_or_decision', 20],
      ['temporal_recency', 15],
      ['geographic_focus', 10],
    ],
    disqualifiers: [
      {
        id: 'dq_001',
        rule: 'Le signal est purement promotionnel sans aucune donnée factuelle.',
        rationale: 'Pollue le scoring sans valeur prospective.',
      },
      {
        id: 'dq_002',
        rule: 'Le signal traite un autre pays sans aucune mention/comparaison cible.',
        rationale: 'Hors scope géographique.',
      },
      {
        id: 'dq_003',
        rule: 'Le signal est un horoscope, divertissement, sport ou célébrité.',
        rationale: 'Bruit total.',
      },
    ],
    soft_boosts: [
      {
        id: 'sb_001',
        rule: 'Signal en langue minoritaire du dossier (acteur arabophone).',
        boost: 10,
        rationale: 'Compense le biais francophone.',
      },
      {
        id: 'sb_002',
        rule: 'Signal contredit la lecture dominante (point de vue divergent).',
        boost: 15,
        rationale: 'Counter-narrative = matière première.',
      },
      {
        id: 'sb_003',
        rule: 'Source primaire (acteur s exprime directement).',
        boost: 8,
        rationale: 'Authenticité supérieure.',
      },
    ],
    calibration_examples: [
      {
        expected_score: 90,
        signal_archetype: 'Tweet officiel d un syndicat avec chiffre HCP, datant de 2 jours.',
      },
      {
        expected_score: 45,
        signal_archetype: 'Article presse FR généraliste qui mentionne la réforme en passant.',
      },
      {
        expected_score: 5,
        signal_archetype: 'Article promotionnel d un cabinet RH vantant ses services.',
      },
    ],
  }
}

// =============================================================================
// Test 1 — criteria sum=100 valide
// =============================================================================

Deno.test('validateWeightSum: sum=100 with 5 criteria is valid', () => {
  const criteria: Array<[string, number]> = [
    ['topical_match', 30],
    ['actor_relevance', 25],
    ['data_or_decision', 20],
    ['temporal_recency', 15],
    ['geographic_focus', 10],
  ]
  const r = validateWeightSum(criteria)
  assertEquals(r.valid, true)
  assertEquals(r.errors.length, 0)
})

// =============================================================================
// Test 2 — criteria sum=99 fail
// =============================================================================

Deno.test('validateWeightSum: sum=99 fails with weight_sum error', () => {
  const criteria: Array<[string, number]> = [
    ['topical_match', 30],
    ['actor_relevance', 25],
    ['data_or_decision', 19],
    ['temporal_recency', 15],
    ['geographic_focus', 10],
  ]
  const r = validateWeightSum(criteria)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'weight_sum' && e.message.includes('99')))
})

// =============================================================================
// Test 3 — criteria sum=101 fail
// =============================================================================

Deno.test('validateWeightSum: sum=101 fails with weight_sum error', () => {
  const criteria: Array<[string, number]> = [
    ['topical_match', 31],
    ['actor_relevance', 25],
    ['data_or_decision', 20],
    ['temporal_recency', 15],
    ['geographic_focus', 10],
  ]
  const r = validateWeightSum(criteria)
  assertEquals(r.valid, false)
  const err = r.errors.find((e) => e.code === 'weight_sum')
  assert(err)
  assertStringIncludes(err!.message, '101')
})

// =============================================================================
// Test 4 — criteria length too short (3) fails
// =============================================================================

Deno.test('validateWeightSum: length=3 fails (must be 4-8)', () => {
  const criteria: Array<[string, number]> = [
    ['a', 50],
    ['b', 30],
    ['c', 20],
  ]
  const r = validateWeightSum(criteria)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'criteria_length'))
})

// =============================================================================
// Test 5 — disqualifiers length too short (2) fails
// =============================================================================

Deno.test('validateDisqualifiers: length=2 fails (must be 3-6)', () => {
  const dq: Disqualifier[] = [
    { id: 'dq_001', rule: 'rule one rule', rationale: 'because one' },
    { id: 'dq_002', rule: 'rule two rule', rationale: 'because two' },
  ]
  const r = validateDisqualifiers(dq)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'disqualifiers_length'))
})

// =============================================================================
// Test 6 — soft_boost individual cap exceeded (boost=21)
// =============================================================================

Deno.test('validateSoftBoosts: individual boost=21 fails (cap 20)', () => {
  const boosts: SoftBoost[] = [
    { id: 'sb_001', rule: 'rule alpha alpha', boost: 21, rationale: 'why' },
    { id: 'sb_002', rule: 'rule beta beta', boost: 10, rationale: 'why' },
  ]
  const r = validateSoftBoosts(boosts)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'soft_boost_cap_individual'))
})

// =============================================================================
// Test 7 — soft_boost total cap reached (sum=50 fails strict <50)
// =============================================================================

Deno.test('validateSoftBoosts: total=50 fails (must be strictly < 50)', () => {
  const boosts: SoftBoost[] = [
    { id: 'sb_001', rule: 'rule alpha alpha', boost: 20, rationale: 'why' },
    { id: 'sb_002', rule: 'rule beta beta', boost: 20, rationale: 'why' },
    { id: 'sb_003', rule: 'rule gamma gamma', boost: 10, rationale: 'why' },
  ]
  const r = validateSoftBoosts(boosts)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'soft_boost_cap_total'))
})

// =============================================================================
// Test 8 — calibration tier check fails when no high (max=60)
// =============================================================================

Deno.test('validateCalibrationExamples: max=60 fails high tier', () => {
  const examples: CalibrationExample[] = [
    { expected_score: 60, signal_archetype: 'archetype haut placeholder' },
    { expected_score: 40, signal_archetype: 'archetype moyen placeholder' },
    { expected_score: 10, signal_archetype: 'archetype bas placeholder' },
  ]
  const r = validateCalibrationExamples(examples)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'calibration_tier_high'))
})

// =============================================================================
// Test 9 — calibration_examples length=2 fails
// =============================================================================

Deno.test('validateCalibrationExamples: length=2 fails (must be 3)', () => {
  const examples: CalibrationExample[] = [
    { expected_score: 85, signal_archetype: 'archetype haut placeholder' },
    { expected_score: 10, signal_archetype: 'archetype bas placeholder' },
  ]
  const r = validateCalibrationExamples(examples)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'calibration_length'))
})

// =============================================================================
// Test 10 — sanitization purges <tool_call>, <thinking>, code fences
// =============================================================================

Deno.test('sanitizeLlmOutput: strips tool_call and thinking and fences', () => {
  const raw =
    '```json\n<thinking>let me think</thinking>{"a":1}<tool_call>do_thing</tool_call>\n```'
  const cleaned = sanitizeLlmOutput(raw)
  assertEquals(cleaned, '{"a":1}')
})

Deno.test('sanitizeLlmOutput: strips reflection and scratchpad tags', () => {
  const raw = '<scratchpad>x</scratchpad><reflection>y</reflection>{"ok":true}'
  const cleaned = sanitizeLlmOutput(raw)
  assertEquals(cleaned, '{"ok":true}')
})

// =============================================================================
// Test 11 — full schema validation OK on fixture
// =============================================================================

Deno.test('validateRubricSchema: fixture rubric is fully valid', () => {
  const r = validateRubricSchema(fixtureValidRubric())
  if (!r.valid) {
    console.error('fixture invalid:', r.errors)
  }
  assertEquals(r.valid, true)
  assertEquals(r.errors.length, 0)
})

// =============================================================================
// Test 12 — full schema validation FAIL when criteria sum off
// =============================================================================

// Hotfix 2026-05-14 : sum=99 est dans la marge [50,200] de normalizeCriteriaWeights
// → désormais auto-normalisée à 100, plus de hard fail. Test mis à jour pour
// vérifier l'auto-normalisation + capture du flag dans normalizations.
Deno.test('validateRubricSchema: fixture with sum=99 is auto-normalized to 100', () => {
  const rubric = fixtureValidRubric()
  rubric.criteria[0][1] = 29 // 30 -> 29, sum becomes 99
  const r = validateRubricSchema(rubric)
  assertEquals(r.valid, true, 'should auto-normalize sum 99 → 100')
  assertEquals(r.normalizations.criteria_weights_normalized, true)
  const sum = rubric.criteria.reduce((s, c) => s + c[1], 0)
  assertEquals(sum, 100)
})

// Hard fail confirmé lorsque la somme est hors [50, 200].
Deno.test('validateRubricSchema: fixture with sum=220 (out-of-range) fails hard', () => {
  const rubric = fixtureValidRubric()
  rubric.criteria[0][1] = 150 // 30 -> 150, sum becomes 220 → hors [50,200]
  const r = validateRubricSchema(rubric)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'weight_sum'))
})

// =============================================================================
// Test 13 — buildCorrectionMessage prioritizes weight_sum
// =============================================================================

Deno.test('buildCorrectionMessage: weight_sum mentioned first', () => {
  const errors = [
    {
      code: 'disqualifiers_length',
      message: 'disqualifiers length must be 3-6',
    },
    {
      code: 'weight_sum',
      message: 'Sum criteria weights MUST equal 100, was 97',
    },
  ]
  const msg = buildCorrectionMessage(errors)
  const lines = msg.split('\n')
  assertStringIncludes(lines[0], 'Sum criteria weights MUST equal 100')
})

// =============================================================================
// Test 14 — scoring_prompt too short fails
// =============================================================================

Deno.test('validateScoringPrompt: short prompt (<200 words) fails', () => {
  const r = validateScoringPrompt('Trop court pour passer le seuil de 200 mots.')
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'scoring_prompt_length'))
})

// =============================================================================
// Test 15 — buildSystemPrompt enforces FR accents directive
// =============================================================================

Deno.test('buildSystemPrompt: FR variant includes accent directive on majuscules', () => {
  const sys = buildSystemPrompt('fr')
  assertStringIncludes(sys, 'É, È, À, Ç')
  assertStringIncludes(sys, 'TROIS-COUCHES')
  assertStringIncludes(sys, 'SOMME DES weight DOIT FAIRE EXACTEMENT 100')
})

Deno.test('buildSystemPrompt: AR variant mentions RTL', () => {
  const sys = buildSystemPrompt('ar')
  assertStringIncludes(sys, 'RTL')
})

Deno.test('buildSystemPrompt: EN variant uses english output', () => {
  const sys = buildSystemPrompt('en')
  assertStringIncludes(sys, 'Output language: English')
})

// =============================================================================
// Test 16 — uniform weights detected only via length+sum, but uniform 25x4 still
// validates (spec asks LLM to avoid it but post-process can't always force it).
// We verify our validator at least catches sum mismatch when uniform 4x20=80.
// =============================================================================

Deno.test('validateWeightSum: uniform 4x20 sums to 80 and fails', () => {
  const criteria: Array<[string, number]> = [
    ['a', 20],
    ['b', 20],
    ['c', 20],
    ['d', 20],
  ]
  const r = validateWeightSum(criteria)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'weight_sum'))
})

// =============================================================================
// Test 17 — disqualifier missing rationale field fails
// =============================================================================

Deno.test('validateDisqualifiers: missing rationale fails', () => {
  const dq = [
    { id: 'dq_001', rule: 'rule alpha rule', rationale: 'ok ok' },
    { id: 'dq_002', rule: 'rule beta rule', rationale: '' },
    { id: 'dq_003', rule: 'rule gamma rule', rationale: 'ok ok' },
  ]
  const r = validateDisqualifiers(dq)
  assertEquals(r.valid, false)
  assert(r.errors.some((e) => e.code === 'disqualifier_rationale'))
})

// =============================================================================
// Hotfix 2026-05-17 — devil-advocate normalizers (defense in depth)
// =============================================================================

// ─── normalizeScoringPromptLength — pad if < 200, truncate if > 500 ─────────

Deno.test('normalizeScoringPromptLength: 28-word prompt is padded to ≥220 words', () => {
  const rubric: Partial<Rubric> = {
    scoring_prompt:
      'Tu évalues la pertinence des signaux par rapport au sujet stratégique étudié et au plan associé.',
    criteria: [
      ['topical_match', 30],
      ['actor_relevance', 25],
      ['data_or_decision', 20],
      ['temporal_recency', 15],
      ['geographic_focus', 10],
    ],
    disqualifiers: [
      { id: 'dq_1', rule: 'promotionnel pur sans donnée', rationale: 'bruit' },
      { id: 'dq_2', rule: 'horoscope ou divertissement', rationale: 'off-topic total' },
      { id: 'dq_3', rule: 'off-topic géographique total', rationale: 'hors scope' },
    ],
    soft_boosts: [
      {
        id: 'sb_1',
        rule: 'signal contredit la lecture dominante',
        boost: 12,
        rationale: 'counter-narrative',
      },
      { id: 'sb_2', rule: "source primaire de l'acteur cité", boost: 8, rationale: 'authenticité' },
    ],
    calibration_examples: [
      { expected_score: 85, signal_archetype: 'tweet officiel avec chiffre cité' },
      { expected_score: 45, signal_archetype: 'article presse généraliste passing mention' },
      { expected_score: 10, signal_archetype: 'blog promotionnel sans donnée' },
    ],
  }
  const mutated = normalizeScoringPromptLength(rubric)
  assertEquals(mutated, true)
  const wc = (rubric.scoring_prompt as string).split(/\s+/).filter((w) => w.length > 0).length
  assert(wc >= 220, `expected ≥220 words, got ${wc}`)
  assert(wc <= 500, `expected ≤500 words, got ${wc}`)
  // Le pad doit garder l'original au début
  assertStringIncludes(rubric.scoring_prompt as string, 'Tu évalues la pertinence')
})

Deno.test('normalizeScoringPromptLength: in-range (250 words) is unchanged', () => {
  const original = Array(250).fill('mot').join(' ')
  const rubric: Partial<Rubric> = { scoring_prompt: original }
  const mutated = normalizeScoringPromptLength(rubric)
  assertEquals(mutated, false)
  assertEquals(rubric.scoring_prompt, original)
})

Deno.test('normalizeScoringPromptLength: 600 words is truncated to 450', () => {
  const original = Array(600).fill('mot').join(' ')
  const rubric: Partial<Rubric> = { scoring_prompt: original }
  const mutated = normalizeScoringPromptLength(rubric)
  assertEquals(mutated, true)
  // 450 mots + ellipsis "…"
  const wc = (rubric.scoring_prompt as string)
    .replace(/…$/, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length
  assertEquals(wc, 450)
  assert((rubric.scoring_prompt as string).endsWith('…'))
})

Deno.test('normalizeScoringPromptLength: minimal rubric (no criteria) pads with filler', () => {
  const rubric: Partial<Rubric> = {
    scoring_prompt: 'Bref.',
  }
  const mutated = normalizeScoringPromptLength(rubric)
  assertEquals(mutated, true)
  const wc = (rubric.scoring_prompt as string).split(/\s+/).filter((w) => w.length > 0).length
  assert(wc >= 200, `expected ≥200 words, got ${wc}`)
})

Deno.test('normalizeScoringPromptLength: empty string is not modified', () => {
  const rubric: Partial<Rubric> = { scoring_prompt: '   ' }
  const mutated = normalizeScoringPromptLength(rubric)
  assertEquals(mutated, false)
})

Deno.test('normalizeScoringPromptLength: non-string is not modified', () => {
  const rubric: Partial<Rubric> = { scoring_prompt: undefined }
  const mutated = normalizeScoringPromptLength(rubric)
  assertEquals(mutated, false)
})

// ─── normalizeCriteriaCount — clip à 8 ───────────────────────────────────────

Deno.test('normalizeCriteriaCount: 10 criteria clipped to top 8 by weight', () => {
  const rubric: Partial<Rubric> = {
    criteria: [
      ['c1', 5],
      ['c2', 15],
      ['c3', 10],
      ['c4', 20],
      ['c5', 8],
      ['c6', 12],
      ['c7', 7],
      ['c8', 11],
      ['c9', 6],
      ['c10', 6],
    ],
  }
  const mutated = normalizeCriteriaCount(rubric)
  assertEquals(mutated, true)
  assertEquals(rubric.criteria!.length, 8)
  // Doit avoir gardé les 8 plus pondérés : [20, 15, 12, 11, 10, 8, 7, 6]
  const weights = (rubric.criteria as Array<[string, number]>)
    .map((c) => c[1])
    .sort((a, b) => b - a)
  assertEquals(weights[0], 20)
  assertEquals(weights[7], 6) // 8e = un des deux 6 (l'autre est dropped)
  // Le second 6 a été dropped (parmi les 2 ex æquo, on n'en garde qu'un).
  const sixes = weights.filter((w) => w === 6)
  assertEquals(sixes.length, 1)
})

Deno.test('normalizeCriteriaCount: 5 criteria untouched', () => {
  const rubric: Partial<Rubric> = {
    criteria: [
      ['c1', 30],
      ['c2', 25],
      ['c3', 20],
      ['c4', 15],
      ['c5', 10],
    ],
  }
  const mutated = normalizeCriteriaCount(rubric)
  assertEquals(mutated, false)
})

Deno.test('normalizeCriteriaCount: malformed entries filtered', () => {
  const rubric: Partial<Rubric> = {
    criteria: [
      ['c1', 30],
      ['c2', 0] as [string, number], // weight=0 invalide
      ['c3', 20],
      ['c4', 15],
      ['c5', 10],
      ['c6', 25],
    ],
  }
  const mutated = normalizeCriteriaCount(rubric)
  assertEquals(mutated, true)
  assertEquals(rubric.criteria!.length, 5)
})

// ─── normalizeDisqualifiersCount — clip à 6 ──────────────────────────────────

Deno.test('normalizeDisqualifiersCount: 8 disqualifiers clipped to 6', () => {
  const rubric: Partial<Rubric> = {
    disqualifiers: [
      { id: 'dq1', rule: 'rule one rule', rationale: 'rat' },
      { id: 'dq2', rule: 'rule two rule', rationale: 'rat' },
      { id: 'dq3', rule: 'rule thr rule', rationale: 'rat' },
      { id: 'dq4', rule: 'rule fou rule', rationale: 'rat' },
      { id: 'dq5', rule: 'rule fiv rule', rationale: 'rat' },
      { id: 'dq6', rule: 'rule six rule', rationale: 'rat' },
      { id: 'dq7', rule: 'rule sev rule', rationale: 'rat' },
      { id: 'dq8', rule: 'rule eig rule', rationale: 'rat' },
    ],
  }
  const mutated = normalizeDisqualifiersCount(rubric)
  assertEquals(mutated, true)
  assertEquals(rubric.disqualifiers!.length, 6)
})

// ─── normalizeSoftBoosts — cap individuel + total ───────────────────────────

Deno.test('normalizeSoftBoosts: individual boost=25 capped to 20', () => {
  const rubric: Partial<Rubric> = {
    soft_boosts: [
      { id: 'sb1', rule: 'rule one rule', boost: 25, rationale: 'rat' },
      { id: 'sb2', rule: 'rule two rule', boost: 10, rationale: 'rat' },
    ],
  }
  const mutated = normalizeSoftBoosts(rubric)
  assertEquals(mutated, true)
  const max = Math.max(...(rubric.soft_boosts as SoftBoost[]).map((b) => b.boost))
  assertEquals(max, 20)
})

Deno.test('normalizeSoftBoosts: total=60 scaled down < 50', () => {
  const rubric: Partial<Rubric> = {
    soft_boosts: [
      { id: 'sb1', rule: 'rule one rule', boost: 20, rationale: 'rat' },
      { id: 'sb2', rule: 'rule two rule', boost: 20, rationale: 'rat' },
      { id: 'sb3', rule: 'rule thr rule', boost: 20, rationale: 'rat' },
    ],
  }
  const mutated = normalizeSoftBoosts(rubric)
  assertEquals(mutated, true)
  const total = (rubric.soft_boosts as SoftBoost[]).reduce((s, b) => s + b.boost, 0)
  assert(total < 50, `expected total < 50, got ${total}`)
})

Deno.test('normalizeSoftBoosts: 7 boosts trimmed to 5 (top by impact)', () => {
  const rubric: Partial<Rubric> = {
    soft_boosts: [
      { id: 'sb1', rule: 'rule one rule', boost: 3, rationale: 'rat' },
      { id: 'sb2', rule: 'rule two rule', boost: 4, rationale: 'rat' },
      { id: 'sb3', rule: 'rule thr rule', boost: 5, rationale: 'rat' },
      { id: 'sb4', rule: 'rule fou rule', boost: 6, rationale: 'rat' },
      { id: 'sb5', rule: 'rule fiv rule', boost: 7, rationale: 'rat' },
      { id: 'sb6', rule: 'rule six rule', boost: 8, rationale: 'rat' },
      { id: 'sb7', rule: 'rule sev rule', boost: 9, rationale: 'rat' },
    ],
  }
  const mutated = normalizeSoftBoosts(rubric)
  assertEquals(mutated, true)
  assertEquals(rubric.soft_boosts!.length, 5)
  const ids = (rubric.soft_boosts as SoftBoost[]).map((b) => b.id)
  // top 5 par impact : sb3..sb7
  assert(ids.includes('sb7'))
  assert(ids.includes('sb6'))
  assert(!ids.includes('sb1'))
})

// ─── normalizeCalibrationExamples — clip + tier preservation ────────────────

Deno.test('normalizeCalibrationExamples: 5 examples reduced to min/median/max', () => {
  const rubric: Partial<Rubric> = {
    calibration_examples: [
      { expected_score: 80, signal_archetype: 'archetype a placeholder' },
      { expected_score: 50, signal_archetype: 'archetype b placeholder' },
      { expected_score: 20, signal_archetype: 'archetype c placeholder' },
      { expected_score: 95, signal_archetype: 'archetype d placeholder' },
      { expected_score: 5, signal_archetype: 'archetype e placeholder' },
    ],
  }
  const mutated = normalizeCalibrationExamples(rubric)
  assertEquals(mutated, true)
  assertEquals(rubric.calibration_examples!.length, 3)
  const scores = (rubric.calibration_examples as CalibrationExample[])
    .map((e) => e.expected_score)
    .sort((a, b) => a - b)
  assertEquals(scores[0], 5) // min
  assertEquals(scores[2], 95) // max
  assert(scores[1] >= 20 && scores[1] <= 80) // median dans la fourchette
})

// ─── validateRubricSchema avec normalizations end-to-end ─────────────────────

Deno.test(
  'validateRubricSchema: rubric with 28-word scoring_prompt + 10 criteria + over-cap boosts → fully fixed',
  () => {
    const broken: Partial<Rubric> = {
      scoring_prompt: 'Trop court vraiment trop court pour passer le seuil de deux cents mots.',
      criteria: [
        ['c1', 5],
        ['c2', 15],
        ['c3', 10],
        ['c4', 20],
        ['c5', 8],
        ['c6', 12],
        ['c7', 7],
        ['c8', 11],
        ['c9', 6],
        ['c10', 6],
      ],
      disqualifiers: [
        { id: 'dq1', rule: 'rule one rule', rationale: 'rat' },
        { id: 'dq2', rule: 'rule two rule', rationale: 'rat' },
        { id: 'dq3', rule: 'rule thr rule', rationale: 'rat' },
      ],
      soft_boosts: [
        { id: 'sb1', rule: 'rule one rule', boost: 25, rationale: 'rat' },
        { id: 'sb2', rule: 'rule two rule', boost: 10, rationale: 'rat' },
      ],
      calibration_examples: [
        { expected_score: 85, signal_archetype: 'archetype haut placeholder' },
        { expected_score: 45, signal_archetype: 'archetype moyen placeholder' },
        { expected_score: 10, signal_archetype: 'archetype bas placeholder' },
      ],
    }
    const r = validateRubricSchema(broken)
    if (!r.valid) console.error('normalize end-to-end failed:', r.errors)
    assertEquals(r.valid, true)
    assertEquals(r.normalizations.criteria_count_clipped, true)
    assertEquals(r.normalizations.scoring_prompt_length_normalized, true)
    assertEquals(r.normalizations.soft_boosts_normalized, true)
  },
)

Deno.test('validateRubricSchema: returns normalizations={} when no transforms applied', () => {
  // fixture est déjà valide donc pas de transforms
  const fixture: Rubric = {
    scoring_prompt: Array(250).fill('mot').join(' '),
    criteria: [
      ['topical_match', 30],
      ['actor_relevance', 25],
      ['data_or_decision', 20],
      ['temporal_recency', 15],
      ['geographic_focus', 10],
    ],
    disqualifiers: [
      { id: 'dq_001', rule: 'promotionnel pur sans donnée', rationale: 'bruit' },
      { id: 'dq_002', rule: 'horoscope ou divertissement', rationale: 'off-topic' },
      { id: 'dq_003', rule: 'off-topic géographique total', rationale: 'hors scope' },
    ],
    soft_boosts: [
      { id: 'sb_001', rule: 'signal en langue minoritaire', boost: 10, rationale: 'compense' },
      { id: 'sb_002', rule: 'signal contredit lecture dominante', boost: 15, rationale: 'counter' },
      { id: 'sb_003', rule: 'source primaire acteur', boost: 8, rationale: 'authenticité' },
    ],
    calibration_examples: [
      { expected_score: 90, signal_archetype: 'tweet officiel chiffre cite' },
      { expected_score: 45, signal_archetype: 'article presse FR mention' },
      { expected_score: 5, signal_archetype: 'blog promo sans donnée' },
    ],
  }
  const r = validateRubricSchema(fixture)
  assertEquals(r.valid, true)
  assertEquals(Object.keys(r.normalizations).length, 0)
})
