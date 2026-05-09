// BYOK strict — no model imposed.
//
// Tests unitaires pour rubric-architect (Story Ralph K02).
// Couvre les helpers purs : validateRubricSchema, validateWeightSum,
// validateDisqualifiers, validateSoftBoosts, validateCalibrationExamples,
// validateScoringPrompt, sanitizeLlmOutput, buildCorrectionMessage,
// buildSystemPrompt.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@0.226";

import {
  buildCorrectionMessage,
  buildSystemPrompt,
  type CalibrationExample,
  type Disqualifier,
  type Rubric,
  sanitizeLlmOutput,
  type SoftBoost,
  validateCalibrationExamples,
  validateDisqualifiers,
  validateRubricSchema,
  validateScoringPrompt,
  validateSoftBoosts,
  validateWeightSum,
} from "./index.ts";

// =============================================================================
// Fixture helpers
// =============================================================================

function fixtureScoringPrompt(): string {
  // ~250 mots — dans la fourchette 200-500.
  const segment =
    "Tu es un analyste qui évalue la pertinence d'un signal d'actualité par rapport à un sujet d'étude prospective. La rubric a TROIS couches. Premièrement, score continu de 0 à 100 sur les critères pondérés dont la somme fait 100. Deuxièmement, des DISQUALIFIERS qui mettent à 0 si le signal matche. Troisièmement, des SOFT_BOOSTS qui ajoutent jusqu'à 40 points après le score continu. Concentre-toi sur la pertinence concrète et observable. Un signal vague qui mentionne le sujet sans rapport vaut autour de 10. Un signal précis qui cite un acteur clé avec une donnée chiffrée vaut 80 ou plus. Un signal en langue minoritaire du dossier mérite un boost. Un signal qui contredit la lecture dominante mérite un boost. Privilégie les signaux datés de moins de six mois. Justifie en une à deux phrases ton score final, en mentionnant si un disqualifier ou un boost s'est appliqué. ";
  return segment.repeat(2).trim();
}

function fixtureValidRubric(): Rubric {
  return {
    scoring_prompt: fixtureScoringPrompt(),
    criteria: [
      ["topical_match", 30],
      ["actor_relevance", 25],
      ["data_or_decision", 20],
      ["temporal_recency", 15],
      ["geographic_focus", 10],
    ],
    disqualifiers: [
      {
        id: "dq_001",
        rule:
          "Le signal est purement promotionnel sans aucune donnée factuelle.",
        rationale: "Pollue le scoring sans valeur prospective.",
      },
      {
        id: "dq_002",
        rule:
          "Le signal traite un autre pays sans aucune mention/comparaison cible.",
        rationale: "Hors scope géographique.",
      },
      {
        id: "dq_003",
        rule: "Le signal est un horoscope, divertissement, sport ou célébrité.",
        rationale: "Bruit total.",
      },
    ],
    soft_boosts: [
      {
        id: "sb_001",
        rule: "Signal en langue minoritaire du dossier (acteur arabophone).",
        boost: 10,
        rationale: "Compense le biais francophone.",
      },
      {
        id: "sb_002",
        rule: "Signal contredit la lecture dominante (point de vue divergent).",
        boost: 15,
        rationale: "Counter-narrative = matière première.",
      },
      {
        id: "sb_003",
        rule: "Source primaire (acteur s exprime directement).",
        boost: 8,
        rationale: "Authenticité supérieure.",
      },
    ],
    calibration_examples: [
      {
        expected_score: 90,
        signal_archetype:
          "Tweet officiel d un syndicat avec chiffre HCP, datant de 2 jours.",
      },
      {
        expected_score: 45,
        signal_archetype:
          "Article presse FR généraliste qui mentionne la réforme en passant.",
      },
      {
        expected_score: 5,
        signal_archetype:
          "Article promotionnel d un cabinet RH vantant ses services.",
      },
    ],
  };
}

// =============================================================================
// Test 1 — criteria sum=100 valide
// =============================================================================

Deno.test("validateWeightSum: sum=100 with 5 criteria is valid", () => {
  const criteria: Array<[string, number]> = [
    ["topical_match", 30],
    ["actor_relevance", 25],
    ["data_or_decision", 20],
    ["temporal_recency", 15],
    ["geographic_focus", 10],
  ];
  const r = validateWeightSum(criteria);
  assertEquals(r.valid, true);
  assertEquals(r.errors.length, 0);
});

// =============================================================================
// Test 2 — criteria sum=99 fail
// =============================================================================

Deno.test("validateWeightSum: sum=99 fails with weight_sum error", () => {
  const criteria: Array<[string, number]> = [
    ["topical_match", 30],
    ["actor_relevance", 25],
    ["data_or_decision", 19],
    ["temporal_recency", 15],
    ["geographic_focus", 10],
  ];
  const r = validateWeightSum(criteria);
  assertEquals(r.valid, false);
  assert(
    r.errors.some((e) => e.code === "weight_sum" && e.message.includes("99")),
  );
});

// =============================================================================
// Test 3 — criteria sum=101 fail
// =============================================================================

Deno.test("validateWeightSum: sum=101 fails with weight_sum error", () => {
  const criteria: Array<[string, number]> = [
    ["topical_match", 31],
    ["actor_relevance", 25],
    ["data_or_decision", 20],
    ["temporal_recency", 15],
    ["geographic_focus", 10],
  ];
  const r = validateWeightSum(criteria);
  assertEquals(r.valid, false);
  const err = r.errors.find((e) => e.code === "weight_sum");
  assert(err);
  assertStringIncludes(err!.message, "101");
});

// =============================================================================
// Test 4 — criteria length too short (3) fails
// =============================================================================

Deno.test("validateWeightSum: length=3 fails (must be 4-8)", () => {
  const criteria: Array<[string, number]> = [
    ["a", 50],
    ["b", 30],
    ["c", 20],
  ];
  const r = validateWeightSum(criteria);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "criteria_length"));
});

// =============================================================================
// Test 5 — disqualifiers length too short (2) fails
// =============================================================================

Deno.test("validateDisqualifiers: length=2 fails (must be 3-6)", () => {
  const dq: Disqualifier[] = [
    { id: "dq_001", rule: "rule one rule", rationale: "because one" },
    { id: "dq_002", rule: "rule two rule", rationale: "because two" },
  ];
  const r = validateDisqualifiers(dq);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "disqualifiers_length"));
});

// =============================================================================
// Test 6 — soft_boost individual cap exceeded (boost=21)
// =============================================================================

Deno.test("validateSoftBoosts: individual boost=21 fails (cap 20)", () => {
  const boosts: SoftBoost[] = [
    { id: "sb_001", rule: "rule alpha alpha", boost: 21, rationale: "why" },
    { id: "sb_002", rule: "rule beta beta", boost: 10, rationale: "why" },
  ];
  const r = validateSoftBoosts(boosts);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "soft_boost_cap_individual"));
});

// =============================================================================
// Test 7 — soft_boost total cap reached (sum=50 fails strict <50)
// =============================================================================

Deno.test("validateSoftBoosts: total=50 fails (must be strictly < 50)", () => {
  const boosts: SoftBoost[] = [
    { id: "sb_001", rule: "rule alpha alpha", boost: 20, rationale: "why" },
    { id: "sb_002", rule: "rule beta beta", boost: 20, rationale: "why" },
    { id: "sb_003", rule: "rule gamma gamma", boost: 10, rationale: "why" },
  ];
  const r = validateSoftBoosts(boosts);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "soft_boost_cap_total"));
});

// =============================================================================
// Test 8 — calibration tier check fails when no high (max=60)
// =============================================================================

Deno.test("validateCalibrationExamples: max=60 fails high tier", () => {
  const examples: CalibrationExample[] = [
    { expected_score: 60, signal_archetype: "archetype haut placeholder" },
    { expected_score: 40, signal_archetype: "archetype moyen placeholder" },
    { expected_score: 10, signal_archetype: "archetype bas placeholder" },
  ];
  const r = validateCalibrationExamples(examples);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "calibration_tier_high"));
});

// =============================================================================
// Test 9 — calibration_examples length=2 fails
// =============================================================================

Deno.test("validateCalibrationExamples: length=2 fails (must be 3)", () => {
  const examples: CalibrationExample[] = [
    { expected_score: 85, signal_archetype: "archetype haut placeholder" },
    { expected_score: 10, signal_archetype: "archetype bas placeholder" },
  ];
  const r = validateCalibrationExamples(examples);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "calibration_length"));
});

// =============================================================================
// Test 10 — sanitization purges <tool_call>, <thinking>, code fences
// =============================================================================

Deno.test("sanitizeLlmOutput: strips tool_call and thinking and fences", () => {
  const raw =
    '```json\n<thinking>let me think</thinking>{"a":1}<tool_call>do_thing</tool_call>\n```';
  const cleaned = sanitizeLlmOutput(raw);
  assertEquals(cleaned, '{"a":1}');
});

Deno.test("sanitizeLlmOutput: strips reflection and scratchpad tags", () => {
  const raw = '<scratchpad>x</scratchpad><reflection>y</reflection>{"ok":true}';
  const cleaned = sanitizeLlmOutput(raw);
  assertEquals(cleaned, '{"ok":true}');
});

// =============================================================================
// Test 11 — full schema validation OK on fixture
// =============================================================================

Deno.test("validateRubricSchema: fixture rubric is fully valid", () => {
  const r = validateRubricSchema(fixtureValidRubric());
  if (!r.valid) {
    console.error("fixture invalid:", r.errors);
  }
  assertEquals(r.valid, true);
  assertEquals(r.errors.length, 0);
});

// =============================================================================
// Test 12 — full schema validation FAIL when criteria sum off
// =============================================================================

Deno.test("validateRubricSchema: fixture with sum=99 fails", () => {
  const rubric = fixtureValidRubric();
  rubric.criteria[0][1] = 29; // 30 -> 29, sum becomes 99
  const r = validateRubricSchema(rubric);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "weight_sum"));
});

// =============================================================================
// Test 13 — buildCorrectionMessage prioritizes weight_sum
// =============================================================================

Deno.test("buildCorrectionMessage: weight_sum mentioned first", () => {
  const errors = [
    {
      code: "disqualifiers_length",
      message: "disqualifiers length must be 3-6",
    },
    {
      code: "weight_sum",
      message: "Sum criteria weights MUST equal 100, was 97",
    },
  ];
  const msg = buildCorrectionMessage(errors);
  const lines = msg.split("\n");
  assertStringIncludes(lines[0], "Sum criteria weights MUST equal 100");
});

// =============================================================================
// Test 14 — scoring_prompt too short fails
// =============================================================================

Deno.test("validateScoringPrompt: short prompt (<200 words) fails", () => {
  const r = validateScoringPrompt(
    "Trop court pour passer le seuil de 200 mots.",
  );
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "scoring_prompt_length"));
});

// =============================================================================
// Test 15 — buildSystemPrompt enforces FR accents directive
// =============================================================================

Deno.test("buildSystemPrompt: FR variant includes accent directive on majuscules", () => {
  const sys = buildSystemPrompt("fr");
  assertStringIncludes(sys, "É, È, À, Ç");
  assertStringIncludes(sys, "TROIS-COUCHES");
  assertStringIncludes(sys, "SOMME DES weight DOIT FAIRE EXACTEMENT 100");
});

Deno.test("buildSystemPrompt: AR variant mentions RTL", () => {
  const sys = buildSystemPrompt("ar");
  assertStringIncludes(sys, "RTL");
});

Deno.test("buildSystemPrompt: EN variant uses english output", () => {
  const sys = buildSystemPrompt("en");
  assertStringIncludes(sys, "Output language: English");
});

// =============================================================================
// Test 16 — uniform weights detected only via length+sum, but uniform 25x4 still
// validates (spec asks LLM to avoid it but post-process can't always force it).
// We verify our validator at least catches sum mismatch when uniform 4x20=80.
// =============================================================================

Deno.test("validateWeightSum: uniform 4x20 sums to 80 and fails", () => {
  const criteria: Array<[string, number]> = [
    ["a", 20],
    ["b", 20],
    ["c", 20],
    ["d", 20],
  ];
  const r = validateWeightSum(criteria);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "weight_sum"));
});

// =============================================================================
// Test 17 — disqualifier missing rationale field fails
// =============================================================================

Deno.test("validateDisqualifiers: missing rationale fails", () => {
  const dq = [
    { id: "dq_001", rule: "rule alpha rule", rationale: "ok ok" },
    { id: "dq_002", rule: "rule beta rule", rationale: "" },
    { id: "dq_003", rule: "rule gamma rule", rationale: "ok ok" },
  ];
  const r = validateDisqualifiers(dq);
  assertEquals(r.valid, false);
  assert(r.errors.some((e) => e.code === "disqualifier_rationale"));
});
