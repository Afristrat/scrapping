/**
 * Tests for quality-auditor pure logic helpers.
 *
 * Strategy : we test the deterministic checks + decision tree without
 * spinning a Deno.serve handler. The HTTP-level glue (req parsing,
 * dispatch-llm call, supabase logging) is intentionally skipped — it
 * is exercised in CI by the staging E2E test.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  AuditIssue,
  BRIEF_MAX,
  BRIEF_MIN,
  checkBriefFormat,
  checkCoverage,
  checkDevilAdvocate,
  checkHallucination,
  checkLinguistic,
  computeVerdict,
  CoverageMapEntry,
  deepeningTargetFromIssue,
  mergeIssues,
  parseLlmIssues,
  ResearchStrategy,
  smartTruncate,
  TopicShape,
} from "./auditor.ts";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeTopic(overrides: Partial<TopicShape> = {}): TopicShape {
  return {
    id: "t_001",
    label: "Topic test",
    type: "regular",
    key_signals_supporting: ["sig_a", "sig_b"],
    key_signals_conflicting: [],
    cross_topic_conflicts: [],
    brief_variants: [],
    internal_tension: null,
    provenance: { lang_distribution: { fr: 5 } },
    warnings: [],
    ...overrides,
  };
}

function makeStrategy(
  overrides: Partial<ResearchStrategy> = {},
): ResearchStrategy {
  return {
    language_mix: ["fr", "ar"],
    subjects: [
      { id: "s_001", title: "Sujet un" },
      { id: "s_002", title: "Sujet deux" },
      { id: "s_003", title: "Sujet trois" },
    ],
    blind_spots: [],
    ...overrides,
  };
}

function makeCoverage(
  entries: Record<string, Partial<CoverageMapEntry>>,
): Record<string, CoverageMapEntry> {
  const out: Record<string, CoverageMapEntry> = {};
  for (const [k, v] of Object.entries(entries)) {
    out[k] = {
      signals_count: v.signals_count ?? 0,
      covered: v.covered ?? false,
      topics: v.topics ?? [],
    };
  }
  return out;
}

// ─── 1. Hallucination ───────────────────────────────────────────────────────

Deno.test("hallucination : tous les signal_id existent → 0 issue", () => {
  const topics = [
    makeTopic({
      key_signals_supporting: ["sig_a", "sig_b"],
      key_signals_conflicting: ["sig_c"],
    }),
  ];
  const signals = [
    { id: "sig_a" },
    { id: "sig_b" },
    { id: "sig_c" },
  ];
  const issues = checkHallucination(topics, signals);
  assertEquals(issues.length, 0);
});

Deno.test("hallucination : signal_id inconnu → high severity issue", () => {
  const topics = [
    makeTopic({ key_signals_supporting: ["sig_a", "sig_ghost"] }),
  ];
  const signals = [{ id: "sig_a" }];
  const issues = checkHallucination(topics, signals);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].axis, "hallucination");
  assertEquals(issues[0].severity, "high");
  assertEquals(issues[0].fix_action, "none");
  assert(issues[0].description.includes("sig_ghost"));
});

Deno.test("hallucination : cross_topic_conflicts ghost id détecté", () => {
  const topics = [
    makeTopic({
      key_signals_supporting: ["sig_a"],
      cross_topic_conflicts: [{ topic_id: "t_002", signal_id: "sig_phantom" }],
    }),
  ];
  const issues = checkHallucination(topics, [{ id: "sig_a" }]);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].axis, "hallucination");
  assert(issues[0].location.includes("cross_topic_conflicts"));
});

// ─── 2. Coverage ────────────────────────────────────────────────────────────

Deno.test("coverage : 100 % couverts → 0 issue", () => {
  const cov = makeCoverage({
    s_001: { covered: true, signals_count: 5, topics: ["t_001"] },
    s_002: { covered: true, signals_count: 3, topics: ["t_002"] },
  });
  const r = checkCoverage(cov);
  assertEquals(r.ratio, 0);
  assertEquals(r.uncoveredSubjects.length, 0);
  assertEquals(r.issues.length, 0);
});

Deno.test("coverage : 1/4 non couvert (25 %) → medium warn", () => {
  const cov = makeCoverage({
    s_001: { covered: true, signals_count: 5 },
    s_002: { covered: true, signals_count: 3 },
    s_003: { covered: true, signals_count: 2 },
    s_004: { covered: false, signals_count: 0 },
  });
  const r = checkCoverage(cov);
  assertEquals(r.uncoveredSubjects, ["s_004"]);
  assertEquals(r.issues.length, 1);
  assertEquals(r.issues[0].severity, "medium");
});

Deno.test("coverage : 2/4 non couverts (50 % > 30 %) → high deepen", () => {
  const cov = makeCoverage({
    s_001: { covered: true, signals_count: 5 },
    s_002: { covered: false, signals_count: 0 },
    s_003: { covered: true, signals_count: 2 },
    s_004: { covered: false, signals_count: 0 },
  });
  const r = checkCoverage(cov);
  assertEquals(r.uncoveredSubjects.length, 2);
  assertEquals(r.issues.length, 1);
  assertEquals(r.issues[0].severity, "high");
  assertEquals(r.issues[0].fix_action, "trigger_deepening");
});

// ─── 3. Linguistic ──────────────────────────────────────────────────────────

Deno.test("linguistic : language_mix fr only → pas de check (single-lang)", () => {
  const topics = [makeTopic({ provenance: { lang_distribution: { fr: 10 } } })];
  const r = checkLinguistic({ language_mix: ["fr"] }, topics);
  assertEquals(r.issues.length, 0);
});

Deno.test("linguistic : fr=95 % alors que mix fr+ar attendu → high", () => {
  const topics = [
    makeTopic({ provenance: { lang_distribution: { fr: 19, ar: 1 } } }),
  ];
  const r = checkLinguistic({ language_mix: ["fr", "ar"] }, topics);
  assertEquals(r.issues.length, 1);
  assertEquals(r.issues[0].axis, "linguistic");
  assertEquals(r.issues[0].severity, "high");
  assert(r.dominantLang === "fr");
});

Deno.test("linguistic : fr=60 % ar=40 % avec mix fr+ar → 0 issue", () => {
  const topics = [
    makeTopic({ provenance: { lang_distribution: { fr: 6, ar: 4 } } }),
  ];
  const r = checkLinguistic({ language_mix: ["fr", "ar"] }, topics);
  assertEquals(r.issues.length, 0);
});

// ─── 4. Devil's advocate ────────────────────────────────────────────────────

Deno.test("devil_advocate : id pointe sur topic existant et type correct → 0 issue", () => {
  const topics = [
    makeTopic({ id: "t_001" }),
    makeTopic({ id: "t_007", type: "devil_advocate" }),
  ];
  const issues = checkDevilAdvocate(topics, "t_007");
  assertEquals(issues.length, 0);
});

Deno.test("devil_advocate : id absent → high deepen", () => {
  const topics = [makeTopic({ id: "t_001" })];
  const issues = checkDevilAdvocate(topics, null);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].severity, "high");
  assertEquals(issues[0].fix_action, "trigger_deepening");
});

Deno.test("devil_advocate : id pointe sur topic inexistant → high", () => {
  const topics = [makeTopic({ id: "t_001" })];
  const issues = checkDevilAdvocate(topics, "t_ghost");
  assertEquals(issues.length, 1);
  assertEquals(issues[0].severity, "high");
});

Deno.test("devil_advocate : id pointe sur topic type=regular → high", () => {
  const topics = [
    makeTopic({ id: "t_001" }),
    makeTopic({ id: "t_005", type: "regular" }),
  ];
  const issues = checkDevilAdvocate(topics, "t_005");
  assertEquals(issues.length, 1);
  assertEquals(issues[0].severity, "high");
  assert(issues[0].description.includes("regular"));
});

// ─── 5. Brief format ────────────────────────────────────────────────────────

Deno.test("brief_format : longueurs OK [250-400] → 0 issue", () => {
  const brief = "A".repeat(300);
  const topics = [
    makeTopic({
      brief_variants: [{ framework_hint: "market", brief, rationale: "r" }],
    }),
  ];
  const r = checkBriefFormat(topics);
  assertEquals(r.issues.length, 0);
  assertEquals(Object.keys(r.corrections).length, 0);
});

Deno.test("brief_format : brief trop long → tronqué intelligemment", () => {
  // Build brief > BRIEF_MAX with sentence boundaries
  const sentence = "Phrase de cadrage qui pose acteurs et horizons précis. ";
  const brief = sentence.repeat(20); // ~ 1100 chars
  const topics = [
    makeTopic({
      brief_variants: [{ framework_hint: "market", brief, rationale: "r" }],
    }),
  ];
  const r = checkBriefFormat(topics);
  assertEquals(r.issues.length, 1);
  assertEquals(r.issues[0].fix_action, "auto_correct");
  const loc = "topic.t_001.brief_variants[0]";
  assert(r.corrections[loc] !== undefined);
  assert(r.corrections[loc].length <= BRIEF_MAX);
  assert(r.corrections[loc].length >= 100);
});

Deno.test("brief_format : brief trop court avec rationale → étendu", () => {
  // brief ~ 200 chars, rationale a du contenu sémantique
  const brief =
    "Question simulable courte sur acteurs nommés et seuil concret 2026 "
      .repeat(3)
      .slice(0, 200);
  const rationale =
    "Frame market parce que la question primaire est le pricing et la part de marché.";
  const topics = [
    makeTopic({
      brief_variants: [{ framework_hint: "market", brief, rationale }],
    }),
  ];
  const r = checkBriefFormat(topics);
  assertEquals(r.issues.length, 1);
  // Auto-correct only if extended length lands in [BRIEF_MIN, BRIEF_MAX]
  const loc = "topic.t_001.brief_variants[0]";
  if (r.issues[0].fix_action === "auto_correct") {
    assert(r.corrections[loc].length >= BRIEF_MIN);
    assert(r.corrections[loc].length <= BRIEF_MAX);
  } else {
    assertEquals(r.issues[0].fix_action, "warn_user");
  }
});

Deno.test("brief_format : brief vide → medium warn sans correction", () => {
  const topics = [
    makeTopic({
      brief_variants: [{ framework_hint: "market", brief: "", rationale: "" }],
    }),
  ];
  const r = checkBriefFormat(topics);
  assertEquals(r.issues.length, 1);
  assertEquals(r.issues[0].severity, "medium");
  assertEquals(r.issues[0].fix_action, "warn_user");
});

Deno.test("smartTruncate : conserve <= max chars et coupe sur frontière de phrase", () => {
  const text =
    "Première phrase courte. Deuxième phrase un peu plus longue avec des détails. " +
    "Troisième phrase qui dépasse la limite et doit être coupée proprement par le truncate.";
  const truncated = smartTruncate(text, 100);
  assert(truncated.length <= 100);
  // Should end on '.' or '…'
  const last = truncated.slice(-1);
  assert(last === "." || last === "…" || last === "?" || last === "!");
});

// ─── 6. parseLlmIssues ──────────────────────────────────────────────────────

Deno.test("parseLlmIssues : JSON valide → tableau parsé", () => {
  const raw = JSON.stringify({
    issues: [
      {
        axis: "novelty",
        severity: "medium",
        location: "topic.t_001",
        description: "Le topic paraphrase la graine",
        fix_action: "warn_user",
        auto_correction: null,
      },
    ],
  });
  const parsed = parseLlmIssues(raw);
  assertEquals(parsed.length, 1);
  assertEquals(parsed[0].axis, "novelty");
});

Deno.test("parseLlmIssues : markdown fences strippés", () => {
  const raw = "```json\n" + JSON.stringify({
    issues: [
      {
        axis: "bias",
        severity: "low",
        location: "topic.t_002.brief_variants[0]",
        description: "Léger jugement de valeur",
        fix_action: "none",
        auto_correction: null,
      },
    ],
  }) + "\n```";
  const parsed = parseLlmIssues(raw);
  assertEquals(parsed.length, 1);
  assertEquals(parsed[0].axis, "bias");
});

Deno.test("parseLlmIssues : entrée malformée → drop silencieux", () => {
  const raw = JSON.stringify({
    issues: [
      {
        axis: "unknown_axis",
        severity: "high",
        location: "x",
        description: "y",
      },
      { axis: "bias" }, // missing required fields
      null,
      "string",
    ],
  });
  const parsed = parseLlmIssues(raw);
  assertEquals(parsed.length, 0);
});

Deno.test("parseLlmIssues : JSON cassé → tableau vide", () => {
  assertEquals(parseLlmIssues("not-json"), []);
  assertEquals(parseLlmIssues(""), []);
});

// ─── 7. Decision tree ──────────────────────────────────────────────────────

Deno.test("verdict pass : aucune issue", () => {
  const r = computeVerdict([], makeStrategy(), []);
  assertEquals(r.verdict, "pass");
  assertEquals(r.deepening_targets.length, 0);
});

Deno.test("verdict warn : issues medium uniquement", () => {
  const issues: AuditIssue[] = [
    {
      axis: "brief_format",
      severity: "medium",
      location: "topic.t_001.brief_variants[0]",
      description: "Brief tronqué",
      fix_action: "auto_correct",
      auto_correction: "foo",
    },
    {
      axis: "coverage",
      severity: "medium",
      location: "coverage_map",
      description: "1 subject manquant",
      fix_action: "warn_user",
      auto_correction: null,
    },
  ];
  const r = computeVerdict(issues, makeStrategy(), ["s_004"]);
  assertEquals(r.verdict, "warn");
  assertEquals(r.deepening_targets.length, 0);
});

Deno.test("verdict deepen : 1 high coverage avec uncovered subjects", () => {
  const issues: AuditIssue[] = [
    {
      axis: "coverage",
      severity: "high",
      location: "coverage_map",
      description: "50 % subjects sans signal",
      fix_action: "trigger_deepening",
      auto_correction: null,
    },
  ];
  const r = computeVerdict(issues, makeStrategy(), ["s_002", "s_003"]);
  assertEquals(r.verdict, "deepen");
  assertEquals(r.deepening_targets.length, 1);
  assertEquals(r.deepening_targets[0].type, "uncovered_subject");
  assert(r.deepening_targets[0].suggested_sub_seed.includes("Sujet deux"));
});

Deno.test("verdict deepen : 1 high devil_advocate manquant", () => {
  const issues: AuditIssue[] = [
    {
      axis: "devil_advocate",
      severity: "high",
      location: "devil_advocate_topic_id",
      description: "Aucun devil advocate",
      fix_action: "trigger_deepening",
      auto_correction: null,
    },
  ];
  const r = computeVerdict(issues, makeStrategy(), []);
  assertEquals(r.verdict, "deepen");
  assertEquals(r.deepening_targets.length, 1);
  assertEquals(r.deepening_targets[0].type, "cross_topic_conflict");
});

Deno.test("verdict fail : 1 high hallucination → fail (pas de deepen)", () => {
  const issues: AuditIssue[] = [
    {
      axis: "hallucination",
      severity: "high",
      location: "topic.t_001.key_signals_supporting",
      description: "sig_ghost inexistant",
      fix_action: "none",
      auto_correction: null,
    },
  ];
  const r = computeVerdict(issues, makeStrategy(), []);
  assertEquals(r.verdict, "fail");
  assertEquals(r.deepening_targets.length, 0);
});

Deno.test("verdict fail : hallucination + autre high → fail (hallucination prime)", () => {
  const issues: AuditIssue[] = [
    {
      axis: "hallucination",
      severity: "high",
      location: "topic.t_001",
      description: "ghost id",
      fix_action: "none",
      auto_correction: null,
    },
    {
      axis: "coverage",
      severity: "high",
      location: "coverage_map",
      description: "50 % uncovered",
      fix_action: "trigger_deepening",
      auto_correction: null,
    },
  ];
  const r = computeVerdict(issues, makeStrategy(), ["s_002", "s_003"]);
  assertEquals(r.verdict, "fail");
  assertEquals(r.deepening_targets.length, 0);
});

Deno.test("verdict deepen : 2 high deepenables (coverage + linguistic) → deepen avec 2 targets", () => {
  const issues: AuditIssue[] = [
    {
      axis: "coverage",
      severity: "high",
      location: "coverage_map",
      description: "50 % uncovered",
      fix_action: "trigger_deepening",
      auto_correction: null,
    },
    {
      axis: "linguistic",
      severity: "high",
      location: "topics.provenance.lang_distribution",
      description: "fr 95 %",
      fix_action: "trigger_deepening",
      auto_correction: null,
    },
  ];
  const r = computeVerdict(issues, makeStrategy(), ["s_001", "s_002"]);
  assertEquals(r.verdict, "deepen");
  assertEquals(r.deepening_targets.length, 2);
  const types = r.deepening_targets.map((t) => t.type).sort();
  assertEquals(types, ["cultural_blindspot", "uncovered_subject"]);
});

// ─── 8. mergeIssues ─────────────────────────────────────────────────────────

Deno.test("mergeIssues : déterministe + LLM, pas de doublon (axis + location)", () => {
  const det: AuditIssue[] = [
    {
      axis: "coverage",
      severity: "high",
      location: "coverage_map",
      description: "det",
      fix_action: "trigger_deepening",
      auto_correction: null,
    },
  ];
  const llm: AuditIssue[] = [
    {
      axis: "coverage",
      severity: "medium",
      location: "coverage_map",
      description: "llm dup",
      fix_action: "warn_user",
      auto_correction: null,
    },
    {
      axis: "novelty",
      severity: "medium",
      location: "topic.t_001",
      description: "paraphrase",
      fix_action: "warn_user",
      auto_correction: null,
    },
  ];
  const merged = mergeIssues(det, llm);
  assertEquals(merged.length, 2);
  // The deterministic entry must win on collision
  assertEquals(merged[0].description, "det");
});

// ─── 9. deepeningTargetFromIssue (axes branches) ────────────────────────────

Deno.test("deepeningTargetFromIssue : medium → null", () => {
  const issue: AuditIssue = {
    axis: "coverage",
    severity: "medium",
    location: "coverage_map",
    description: "x",
    fix_action: "warn_user",
    auto_correction: null,
  };
  assertEquals(
    deepeningTargetFromIssue(issue, makeStrategy(), ["s_001"]),
    null,
  );
});

Deno.test("deepeningTargetFromIssue : axe non-deepenable (bias) → null", () => {
  const issue: AuditIssue = {
    axis: "bias",
    severity: "high",
    location: "topic.t_001",
    description: "x",
    fix_action: "none",
    auto_correction: null,
  };
  assertEquals(deepeningTargetFromIssue(issue, makeStrategy(), []), null);
});

// ─── 10. Constantes exportées ───────────────────────────────────────────────

Deno.test("constantes : BRIEF_MIN=250 BRIEF_MAX=400", () => {
  assertEquals(BRIEF_MIN, 250);
  assertEquals(BRIEF_MAX, 400);
});
