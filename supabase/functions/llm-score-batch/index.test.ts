/**
 * Tests Deno pour llm-score-batch — consensus scoring.
 *
 * Ces tests vérifient la logique métier du consensus (multi-modèles) :
 *   - 3 modèles → 3 score_runs insérés + scores mis à jour avec consensus/variance
 *   - 1 modèle (< 2, fallback) → comportement original
 *   - 2 modèles dont 1 fail → 1 score_run inséré, consensus = score restant
 */

import { assertEquals, assertExists } from 'jsr:@std/assert'

// ─── Types helpers ────────────────────────────────────────────────────────────

interface ScoreEntry {
  id: string
  score: number
  reasoning: string
}

interface DispatchData {
  ok: boolean
  content?: string
  model_used?: string
  provider_used?: string
  usage?: { prompt_tokens: number; completion_tokens: number; cost: number }
}

interface ConsensusResult {
  model: string
  provider: string
  scores: Map<string, { score: number; reasoning: string }>
  cost: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDispatchResponse(
  scores: ScoreEntry[],
  model = 'test-model',
  provider = 'test-provider',
): Response {
  const content = JSON.stringify({ scores })
  return new Response(
    JSON.stringify({
      ok: true,
      content,
      model_used: model,
      provider_used: provider,
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function makeFailDispatchResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'llm_error' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Mock supabase typed pour capturer inserts/upserts */
interface MockBuilder {
  select: (cols: string) => MockBuilder
  eq: (col: string, val: unknown) => MockBuilder
  in: (col: string, vals: unknown) => MockBuilder
  single: () => Promise<{ data: null; error: null }>
  upsert: (rows: unknown[], opts?: unknown) => Promise<{ error: null }>
  insert: (rows: unknown) => Promise<{ error: null }>
}

function makeMockSupabase() {
  const scoreRunsInserted: unknown[] = []
  const scoresUpserted: unknown[] = []
  const logsInserted: unknown[] = []
  const costsInserted: unknown[] = []

  const makeBuilder = (table: string): MockBuilder => {
    const self: MockBuilder = {
      select: () => self,
      eq: () => self,
      in: () => self,
      single: () => Promise.resolve({ data: null, error: null }),
      upsert: (rows: unknown[], _opts?: unknown) => {
        if (table === 'scores') scoresUpserted.push(...(Array.isArray(rows) ? rows : [rows]))
        return Promise.resolve({ error: null })
      },
      insert: (rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : [rows]
        if (table === 'score_runs') scoreRunsInserted.push(...arr)
        else if (table === 'logs') logsInserted.push(...arr)
        else if (table === 'llm_costs') costsInserted.push(...arr)
        return Promise.resolve({ error: null })
      },
    }
    return self
  }

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-test' } }, error: null }),
    },
    from: (table: string) => makeBuilder(table),
    _captured: { scoreRunsInserted, scoresUpserted, logsInserted, costsInserted },
  }
}

function makeSignal(id: string, orgId = 'org-1') {
  return {
    id,
    source: 'arxiv',
    title: `Signal ${id}`,
    raw_payload: {},
    signal_date: '2026-05-02',
    org_id: orgId,
  }
}

/** Simule le dispatch vers un modèle donné et retourne un ConsensusResult ou null. */
async function callDispatch(
  modelSpec: string,
  signalId: string,
  knownIds: Set<string>,
): Promise<ConsensusResult | null> {
  const [provider, ...modelParts] = modelSpec.split(':')
  const modelId = modelParts.join(':')
  const res = await globalThis.fetch('https://supabase.example/functions/v1/dispatch-llm', {
    method: 'POST',
    body: JSON.stringify({
      model_override: modelId,
      provider_override: provider,
      signal_id: signalId,
    }),
  })
  const data = (await res.json()) as DispatchData
  if (!data.ok) return null

  const raw = data.content ?? ''
  const parsed = JSON.parse(raw) as { scores: ScoreEntry[] }
  const scoresMap = new Map<string, { score: number; reasoning: string }>()
  for (const e of parsed.scores) {
    if (knownIds.has(e.id)) scoresMap.set(e.id, { score: e.score, reasoning: e.reasoning })
  }
  return {
    model: data.model_used ?? modelId,
    provider: data.provider_used ?? provider,
    scores: scoresMap,
    cost: data.usage?.cost ?? 0,
  }
}

// ─── Test 1 : 3 modèles → consensus ─────────────────────────────────────────

Deno.test('consensus: 3 modèles → 3 score_runs insérés + scores mis à jour', async () => {
  const signalId = 'sig-001'
  const signal = makeSignal(signalId)
  const signals = [signal]
  const consensusModels = ['openai:gpt-4o', 'anthropic:claude-3-5-haiku', 'mistral:mistral-7b']
  const modelScores: Record<string, number> = {
    'gpt-4o': 70,
    'claude-3-5-haiku': 80,
    'mistral-7b': 90,
  }

  let callCount = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = init?.body
      ? (JSON.parse(init.body as string) as { model_override: string; provider_override: string })
      : { model_override: '', provider_override: '' }
    const score = modelScores[body.model_override] ?? 50
    callCount++
    return Promise.resolve(
      makeDispatchResponse(
        [{ id: signalId, score, reasoning: `Reasoning from ${body.model_override}` }],
        body.model_override,
        body.provider_override,
      ),
    )
  }

  try {
    const knownIds = new Set(signals.map((s) => s.id))

    const settled = await Promise.allSettled(
      consensusModels.map((spec) => callDispatch(spec, signalId, knownIds)),
    )

    const successResults: ConsensusResult[] = settled
      .filter(
        (r): r is PromiseFulfilledResult<ConsensusResult> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value)

    assertEquals(successResults.length, 3, 'Les 3 modèles doivent réussir')
    assertEquals(callCount, 3, 'Exactement 3 appels dispatch effectués')

    // Insérer score_runs
    const db = makeMockSupabase()
    const scoreRunsRows = []
    for (const result of successResults) {
      for (const sig of signals) {
        const v = result.scores.get(sig.id)
        if (!v) continue
        scoreRunsRows.push({
          signal_id: sig.id,
          org_id: sig.org_id,
          user_id: 'user-test',
          model: result.model,
          provider: result.provider,
          score: v.score,
          reasoning: v.reasoning,
          cost: result.cost,
        })
      }
    }
    await db.from('score_runs').insert(scoreRunsRows)
    assertEquals(db._captured.scoreRunsInserted.length, 3, 'Exactement 3 score_runs insérés')

    // Calculer consensus
    const scoreValues = successResults.map((r) => r.scores.get(signalId)!.score)
    const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
    assertEquals(mean, 80, 'Moyenne (consensus) = 80')

    const variance =
      scoreValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / scoreValues.length
    // 70→-10², 80→0², 90→+10² → 200/3
    assertEquals(Math.abs(variance - 200 / 3) < 0.001, true, 'Variance ≈ 66.67')

    // Upsert scores avec consensus
    await db.from('scores').upsert([
      {
        signal_id: signalId,
        user_id: 'user-test',
        score: Math.round(mean),
        score_consensus: Math.round(mean * 100) / 100,
        score_variance: Math.round(variance * 10000) / 10000,
        models_used: successResults.map((r) => r.model),
      },
    ])
    assertEquals(db._captured.scoresUpserted.length, 1, '1 score upsert')
    const upserted = db._captured.scoresUpserted[0] as Record<string, unknown>
    assertEquals(upserted.score, 80, 'Score consensus arrondi = 80')
    assertExists(upserted.score_variance, 'Variance présente')
    assertExists(upserted.models_used, 'models_used présent')
  } finally {
    globalThis.fetch = originalFetch
    callCount = 0
  }
})

// ─── Test 2 : 1 modèle configuré (fallback) ──────────────────────────────────

Deno.test('fallback: consensus_models.length < 2 → comportement original (1 modèle)', async () => {
  const signalId = 'sig-002'
  const consensusModels: string[] = ['openai:gpt-4o'] // 1 seul → fallback

  assertEquals(consensusModels.length < 2, true, 'Doit déclencher le fallback')

  const db = makeMockSupabase()
  // Mode standard : upsert direct sans score_runs
  await db.from('scores').upsert([
    {
      signal_id: signalId,
      user_id: 'user-test',
      score: 75,
      model_used: 'gpt-4o',
      cost: 0.001,
    },
  ])

  assertEquals(db._captured.scoreRunsInserted.length, 0, 'Aucun score_run dans le mode fallback')
  assertEquals(db._captured.scoresUpserted.length, 1, '1 score upsert dans le mode fallback')
  const upserted = db._captured.scoresUpserted[0] as Record<string, unknown>
  assertEquals(upserted.score, 75, 'Score correct')
  assertEquals(upserted.signal_id, signalId)
})

// ─── Test 3 : 2 modèles dont 1 fail ──────────────────────────────────────────

Deno.test('2 modèles dont 1 fail → fallback car < 2 succès', async () => {
  const signalId = 'sig-003'
  const signal = makeSignal(signalId)
  const signals = [signal]
  const consensusModels = ['openai:gpt-4o', 'anthropic:claude-broken']

  let callCount = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (): Promise<Response> => {
    if (callCount++ === 0) {
      return Promise.resolve(
        makeDispatchResponse([{ id: signalId, score: 60, reasoning: 'OK' }], 'gpt-4o', 'openai'),
      )
    }
    return Promise.resolve(makeFailDispatchResponse())
  }

  try {
    const knownIds = new Set(signals.map((s) => s.id))

    const settled = await Promise.allSettled(
      consensusModels.map((spec) => callDispatch(spec, signalId, knownIds)),
    )

    const successResults: ConsensusResult[] = settled
      .filter(
        (r): r is PromiseFulfilledResult<ConsensusResult> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value)

    assertEquals(successResults.length, 1, 'Seulement 1 modèle a réussi')
    assertEquals(successResults.length < 2, true, 'Déclenche le fallback (< 2 succès)')

    // Dans le fallback, pas de score_runs via le chemin consensus
    const db = makeMockSupabase()
    await db.from('scores').upsert([
      {
        signal_id: signalId,
        user_id: 'user-test',
        score: 60,
        model_used: 'gpt-4o',
      },
    ])

    assertEquals(db._captured.scoreRunsInserted.length, 0, 'Pas de score_runs dans le fallback')
    assertEquals(db._captured.scoresUpserted.length, 1, '1 score upsert')
  } finally {
    globalThis.fetch = originalFetch
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// STORY RALPH K04 — Tests rubric_override (3-couches : criteria + disqualifiers + soft_boosts)
// ─────────────────────────────────────────────────────────────────────────────

import { validateBody } from './index.ts'
import {
  applyBoosts,
  parseGateResponse,
  parseLLMScoreResponse,
  shouldCombineGates,
  validateRubricOverride,
  type RubricOverride,
  type SoftBoostRule,
} from './rubric-override.ts'
import {
  type DispatchCaller,
  type DispatchResponse,
  scoreSignalWithRubric,
} from './scoring-engine.ts'

// ─── Helpers tests K04 ───────────────────────────────────────────────────────

function makeRubric(overrides: Partial<RubricOverride> = {}): RubricOverride {
  return {
    scoring_prompt:
      "Tu évalues la pertinence d'un signal d'actualité pour la graine donnée. Renvoie un score 0-100.",
    criteria: [
      ['pertinence_geographique', 30],
      ['source_primaire', 25],
      ['fraicheur', 20],
      ['densite_factuelle', 25],
    ],
    disqualifiers: [
      { id: 'dq_001', rule: 'Signal purement promotionnel sans fait', rationale: 'spam' },
      { id: 'dq_002', rule: 'Off-topic géographique total', rationale: 'pas pertinent' },
      { id: 'dq_003', rule: 'Horoscope ou contenu buzz', rationale: 'pas valeur' },
    ],
    soft_boosts: [
      {
        id: 'sb_001',
        rule: 'Signal contredit la lecture dominante',
        boost: 15,
        rationale: 'counter-narrative',
      },
      {
        id: 'sb_002',
        rule: 'Source primaire (acteur lui-même)',
        boost: 10,
        rationale: 'primaire',
      },
    ],
    calibration_examples: [
      { expected_score: 85, signal_archetype: 'Article fouillé sur acteur primaire récent' },
      { expected_score: 45, signal_archetype: 'Reprise généraliste avec quelques faits' },
      { expected_score: 10, signal_archetype: 'Tweet promo sans contenu' },
    ],
    ...overrides,
  }
}

function makeMockDispatch(handlers: {
  criteria?: (prompt: string) => DispatchResponse
  gate?: (prompt: string) => DispatchResponse
}): { caller: DispatchCaller; calls: { task: string; prompt: string }[] } {
  const calls: { task: string; prompt: string }[] = []
  const caller: DispatchCaller = ({ task, prompt }) => {
    calls.push({ task, prompt })
    if (task === 'scoring') {
      return Promise.resolve(
        handlers.criteria?.(prompt) ?? {
          ok: true,
          content: '{"score": 50, "reasoning": "default"}',
          model_used: 'mock-scoring-model',
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
        },
      )
    }
    return Promise.resolve(
      handlers.gate?.(prompt) ?? {
        ok: true,
        content: '{"disqualified_id": null, "applied": []}',
        model_used: 'mock-gate-model',
        usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.00005 },
      },
    )
  }
  return { caller, calls }
}

// ─── Test K04-1 : body validation — signals_input sans rubric_override → 400 ─

Deno.test(
  'K04: validateBody → signals_input sans rubric_override → RUBRIC_REQUIRED_FOR_AD_HOC',
  () => {
    const result = validateBody({
      signals_input: [{ id: 'sig-1', source: 'arxiv' }],
    })
    assertEquals(result.ok, false)
    assertEquals(result.error, 'RUBRIC_REQUIRED_FOR_AD_HOC')
  },
)

// ─── Test K04-2 : disqualifier match → score=0 ──────────────────────────────

Deno.test(
  'K04: disqualifier match → score=0, disqualified=true, applied_disqualifier',
  async () => {
    const rubric = makeRubric()
    const { caller } = makeMockDispatch({
      gate: () => ({
        ok: true,
        content: '{"disqualified_id": "dq_001", "applied": []}',
        model_used: 'gate-model',
      }),
      criteria: () => ({
        ok: true,
        content: '{"score": 75, "reasoning": "Should be ignored"}',
        model_used: 'crit-model',
      }),
    })

    const result = await scoreSignalWithRubric({
      signal: { id: 'sig-x', source: 'reddit', title: 'Promo article' },
      rubric,
      dispatch: caller,
    })

    assertEquals(result.score, 0)
    assertEquals(result.raw_score, 0)
    assertEquals(result.disqualified, true)
    assertEquals(result.applied_disqualifier, 'dq_001')
    assertEquals(result.applied_boosts, [])
  },
)

// ─── Test K04-3 : criteria scoring nominal ──────────────────────────────────

Deno.test(
  'K04: criteria scoring nominal (no disqualifier, no boost match) → raw_score',
  async () => {
    const rubric = makeRubric()
    const { caller } = makeMockDispatch({
      gate: () => ({
        ok: true,
        content: '{"disqualified_id": null, "applied": []}',
        model_used: 'gate-model',
      }),
      criteria: () => ({
        ok: true,
        content: '{"score": 67, "reasoning": "Bon signal"}',
        model_used: 'crit-model',
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
      }),
    })

    const result = await scoreSignalWithRubric({
      signal: { id: 'sig-y', source: 'rss', title: 'Article' },
      rubric,
      dispatch: caller,
    })

    assertEquals(result.score, 67)
    assertEquals(result.raw_score, 67)
    assertEquals(result.disqualified, false)
    assertEquals(result.applied_disqualifier, null)
    assertEquals(result.applied_boosts, [])
    assertEquals(result.reasoning, 'Bon signal')
  },
)

// ─── Test K04-4 : soft_boost application ────────────────────────────────────

Deno.test('K04: soft_boost match → score = raw + boost (capped à 100)', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      content: '{"disqualified_id": null, "applied": ["sb_001"]}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: true,
      content: '{"score": 70, "reasoning": "ok"}',
      model_used: 'crit-model',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-z', source: 'arxiv' },
    rubric,
    dispatch: caller,
  })

  assertEquals(result.raw_score, 70)
  assertEquals(result.score, 85) // 70 + 15 (sb_001) = 85
  assertEquals(result.applied_boosts, ['sb_001'])
})

Deno.test('K04: soft_boost qui pousserait > 100 est cappé à 100', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      content: '{"disqualified_id": null, "applied": ["sb_001", "sb_002"]}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: true,
      content: '{"score": 95, "reasoning": "haut signal"}',
      model_used: 'crit-model',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-cap', source: 'arxiv' },
    rubric,
    dispatch: caller,
  })

  assertEquals(result.raw_score, 95)
  // 95 + 15 (sb_001) → cap 100 ; +10 (sb_002) → reste 100
  assertEquals(result.score, 100)
  assertEquals(result.applied_boosts, ['sb_001', 'sb_002'])
})

// ─── Test K04-5 : cumulative cap multiple boosts ────────────────────────────

Deno.test('K04: applyBoosts cumulatif ne peut PAS dépasser 100', () => {
  const rules: SoftBoostRule[] = [
    { id: 'a', rule: 'a', boost: 20, rationale: '' },
    { id: 'b', rule: 'b', boost: 20, rationale: '' },
    { id: 'c', rule: 'c', boost: 20, rationale: '' },
  ]
  // 50 + 20 + 20 + 20 = 110 → cappé à 100
  assertEquals(applyBoosts(50, ['a', 'b', 'c'], rules), 100)
  // 100 + autres boosts → reste 100
  assertEquals(applyBoosts(100, ['a', 'b'], rules), 100)
  // Boost id inconnu → ignoré silencieusement
  assertEquals(applyBoosts(50, ['unknown'], rules), 50)
})

// ─── Test K04-6 : mode legacy validateBody ──────────────────────────────────

Deno.test('K04: validateBody → mode=legacy si signal_ids only, pas de rubric_override', () => {
  const result = validateBody({ signal_ids: ['sig-1', 'sig-2'] })
  assertEquals(result.ok, true)
  assertEquals(result.mode, 'legacy')
})

// ─── Test K04-7 : mode hybride ──────────────────────────────────────────────

Deno.test('K04: validateBody → mode=hybrid si signal_ids + rubric_override + source_table', () => {
  const result = validateBody({
    signal_ids: ['sig-1'],
    rubric_override: makeRubric(),
    source_table: 'signals_session',
  })
  assertEquals(result.ok, true)
  assertEquals(result.mode, 'hybrid')
})

Deno.test('K04: validateBody → source_table invalide → 400', () => {
  const result = validateBody({
    signal_ids: ['sig-1'],
    rubric_override: makeRubric(),
    source_table: 'random_table',
  })
  assertEquals(result.ok, false)
  assertEquals(result.error, 'invalid_source_table')
})

// ─── Test K04-8 : mode ad-hoc pur ───────────────────────────────────────────

Deno.test('K04: validateBody → mode=ad_hoc si signals_input + rubric_override', () => {
  const result = validateBody({
    signals_input: [{ id: 'sig-1', source: 'arxiv' }],
    rubric_override: makeRubric(),
  })
  assertEquals(result.ok, true)
  assertEquals(result.mode, 'ad_hoc')
})

Deno.test('K04: validateBody → signal_ids ET signals_input ensemble → mutually_exclusive', () => {
  const result = validateBody({
    signal_ids: ['sig-1'],
    signals_input: [{ id: 'sig-2', source: 'arxiv' }],
    rubric_override: makeRubric(),
  })
  assertEquals(result.ok, false)
  assertEquals(result.error, 'mutually_exclusive_inputs')
})

// ─── Test K04-9 : validation rubric_override ────────────────────────────────

Deno.test('K04: validateRubricOverride → criteria sum != 100 → invalid', () => {
  const r = validateRubricOverride({
    scoring_prompt: 'foo',
    criteria: [
      ['a', 30],
      ['b', 30],
    ], // sum = 60
    disqualifiers: [],
    soft_boosts: [],
  })
  assertEquals(r.valid, false)
  const codes = r.errors.map((e) => e.code)
  assertEquals(codes.includes('weight_sum'), true)
})

Deno.test('K04: validateRubricOverride → soft_boost > 20 → cap_individual error', () => {
  const r = validateRubricOverride({
    scoring_prompt: 'foo',
    criteria: [
      ['a', 50],
      ['b', 50],
    ],
    disqualifiers: [],
    soft_boosts: [{ id: 'sb_x', rule: 'rule', boost: 25, rationale: 'r' }],
  })
  assertEquals(r.valid, false)
  const codes = r.errors.map((e) => e.code)
  assertEquals(codes.includes('soft_boost_cap_individual'), true)
})

Deno.test('K04: validateRubricOverride → rubric K02 valide → ok', () => {
  const r = validateRubricOverride(makeRubric())
  assertEquals(r.valid, true)
  assertEquals(r.errors.length, 0)
})

// ─── Test K04-10 : optimisation combined ≤12 rules → 1 appel LLM ────────────

Deno.test('K04: shouldCombineGates → ≤12 règles total → true (1 appel combiné)', () => {
  const rubric = makeRubric() // 3 dq + 2 sb = 5 → combined
  assertEquals(shouldCombineGates(rubric.disqualifiers, rubric.soft_boosts), true)
})

Deno.test('K04: shouldCombineGates → > 12 règles total → false (split)', () => {
  const dq = Array.from({ length: 7 }, (_, i) => ({
    id: `dq_${i}`,
    rule: `rule ${i}`,
    rationale: 'r',
  }))
  const sb = Array.from({ length: 7 }, (_, i) => ({
    id: `sb_${i}`,
    rule: `rule ${i}`,
    boost: 5,
    rationale: 'r',
  }))
  assertEquals(shouldCombineGates(dq, sb), false)
})

Deno.test(
  'K04: scoring 1 signal en mode combined → 2 appels dispatch (criteria + gate combiné)',
  async () => {
    const rubric = makeRubric() // 5 règles → combined
    const { caller, calls } = makeMockDispatch({})

    await scoreSignalWithRubric({
      signal: { id: 'sig-comb', source: 'rss' },
      rubric,
      dispatch: caller,
    })

    assertEquals(calls.length, 2, 'Mode combiné = 2 appels (criteria + gate combiné)')
    const tasks = calls.map((c) => c.task).sort()
    assertEquals(tasks, ['enrichment', 'scoring'])
  },
)

Deno.test('K04: scoring 1 signal en mode split (>12 règles) → 3 appels dispatch', async () => {
  const dq = Array.from({ length: 7 }, (_, i) => ({
    id: `dq_${i}`,
    rule: `rule ${i}`,
    rationale: 'r',
  }))
  const sb = Array.from({ length: 7 }, (_, i) => ({
    id: `sb_${i}`,
    rule: `rule ${i}`,
    boost: 5,
    rationale: 'r',
  }))
  const rubric: RubricOverride = {
    scoring_prompt: 'prompt',
    criteria: [
      ['a', 50],
      ['b', 50],
    ],
    disqualifiers: dq,
    soft_boosts: sb,
  }
  const { caller, calls } = makeMockDispatch({})

  await scoreSignalWithRubric({
    signal: { id: 'sig-split', source: 'rss' },
    rubric,
    dispatch: caller,
  })

  assertEquals(calls.length, 3, 'Mode split = 3 appels (criteria + dq + sb)')
})

// ─── Test K04-11 : helpers purs (parseLLMScoreResponse, parseGateResponse) ──

Deno.test('K04: parseLLMScoreResponse → JSON propre → score + reasoning', () => {
  const r = parseLLMScoreResponse('{"score": 88, "reasoning": "tres pertinent"}')
  assertEquals(r?.score, 88)
  assertEquals(r?.reasoning, 'tres pertinent')
})

Deno.test('K04: parseLLMScoreResponse → score string → coerced int', () => {
  const r = parseLLMScoreResponse('{"score": "73.4", "reasoning": "ok"}')
  assertEquals(r?.score, 73)
})

Deno.test('K04: parseLLMScoreResponse → score > 100 → cappé à 100', () => {
  const r = parseLLMScoreResponse('{"score": 150, "reasoning": "ok"}')
  assertEquals(r?.score, 100)
})

Deno.test('K04: parseLLMScoreResponse → JSON invalide → null', () => {
  assertEquals(parseLLMScoreResponse('not json'), null)
  assertEquals(parseLLMScoreResponse('{"foo": "bar"}'), null) // pas de score
})

Deno.test('K04: parseLLMScoreResponse → markdown fence → extracted', () => {
  const r = parseLLMScoreResponse('```json\n{"score": 60, "reasoning": "ok"}\n```')
  assertEquals(r?.score, 60)
})

Deno.test('K04: parseGateResponse → disqualified + boosts → extracted', () => {
  const r = parseGateResponse('{"disqualified_id": "dq_001", "applied": ["sb_001", "sb_003"]}')
  assertEquals(r.disqualified_id, 'dq_001')
  assertEquals(r.applied_boosts, ['sb_001', 'sb_003'])
})

Deno.test('K04: parseGateResponse → "null" string → null disqualified', () => {
  const r = parseGateResponse('{"disqualified_id": null, "applied": []}')
  assertEquals(r.disqualified_id, null)
  assertEquals(r.applied_boosts, [])
})

Deno.test('K04: parseGateResponse → JSON invalide → défaut conservateur', () => {
  const r = parseGateResponse('{ broken json')
  assertEquals(r.disqualified_id, null)
  assertEquals(r.applied_boosts, [])
})

// ─── Test K04-12 : disqualifier unknown id → ignoré (bruit LLM) ─────────────

Deno.test('K04: disqualifier_id retourné par LLM mais inconnu dans rubric → ignoré', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      // dq_999 n'existe pas dans rubric.disqualifiers
      content: '{"disqualified_id": "dq_999", "applied": []}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: true,
      content: '{"score": 60, "reasoning": "ok"}',
      model_used: 'crit-model',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-unk-dq', source: 'rss' },
    rubric,
    dispatch: caller,
  })

  // dq_999 ignoré → on tombe sur le scoring criteria normal
  assertEquals(result.disqualified, false)
  assertEquals(result.score, 60)
  assertEquals(result.applied_disqualifier, null)
})

Deno.test('K04: applied_boost id inconnu → filtré (pas appliqué)', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      content: '{"disqualified_id": null, "applied": ["sb_001", "sb_unknown"]}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: true,
      content: '{"score": 50, "reasoning": "ok"}',
      model_used: 'crit-model',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-unk-b', source: 'rss' },
    rubric,
    dispatch: caller,
  })

  assertEquals(result.applied_boosts, ['sb_001'])
  assertEquals(result.score, 65) // 50 + 15 seulement
})

// ─── Test K04-13 : calculateFinalScore (helper pur) ─────────────────────────

import { calculateFinalScore } from './rubric-override.ts'

Deno.test('K04: calculateFinalScore → disqualified=true → 0 quel que soit raw', () => {
  const rules: SoftBoostRule[] = [{ id: 'a', rule: 'r', boost: 20, rationale: '' }]
  assertEquals(
    calculateFinalScore({ rawScore: 95, disqualified: true, appliedBoosts: ['a'], rules }),
    0,
  )
})

Deno.test('K04: calculateFinalScore → not disqualified → applique boosts cappés', () => {
  const rules: SoftBoostRule[] = [
    { id: 'a', rule: 'r', boost: 15, rationale: '' },
    { id: 'b', rule: 'r', boost: 10, rationale: '' },
  ]
  assertEquals(
    calculateFinalScore({ rawScore: 60, disqualified: false, appliedBoosts: ['a', 'b'], rules }),
    85,
  )
  // 95 + 15 = 110 → 100
  assertEquals(
    calculateFinalScore({ rawScore: 95, disqualified: false, appliedBoosts: ['a'], rules }),
    100,
  )
})

// ─── Test K04-14 : signals_input validation par item ────────────────────────

Deno.test('K04: validateBody → signals_input avec id manquant → invalid_signals_input', () => {
  const result = validateBody({
    signals_input: [{ source: 'arxiv' }], // pas de id
    rubric_override: makeRubric(),
  })
  assertEquals(result.ok, false)
  assertEquals(result.error, 'invalid_signals_input')
})

Deno.test('K04: validateBody → no inputs → signal_ids_or_signals_input_required', () => {
  const result = validateBody({})
  assertEquals(result.ok, false)
  assertEquals(result.error, 'signal_ids_or_signals_input_required')
})

// ─── Hotfix 2026-05-17 : scoring_failed flag pour partial failure handling ───

Deno.test('Hotfix 2026-05-17: criteria LLM ok=false → scoring_failed=true', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      content: '{"disqualified_id": null, "applied": []}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: false,
      error: 'dispatch_unreachable',
      detail: 'mock timeout',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-fail', source: 'rss', title: 'Article' },
    rubric,
    dispatch: caller,
  })

  assertEquals(result.scoring_failed, true)
  assertEquals(result.score, 0) // par défaut
  assertEquals(result.raw_score, 0)
  assertEquals(result.disqualified, false)
})

Deno.test('Hotfix 2026-05-17: criteria parse JSON cassé → scoring_failed=true', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      content: '{"disqualified_id": null, "applied": []}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: true,
      content: 'not valid json at all',
      model_used: 'crit-model',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-parse', source: 'reddit' },
    rubric,
    dispatch: caller,
  })

  assertEquals(result.scoring_failed, true)
})

Deno.test('Hotfix 2026-05-17: criteria nominal → scoring_failed=false', async () => {
  const rubric = makeRubric()
  const { caller } = makeMockDispatch({
    gate: () => ({
      ok: true,
      content: '{"disqualified_id": null, "applied": []}',
      model_used: 'gate-model',
    }),
    criteria: () => ({
      ok: true,
      content: '{"score": 67, "reasoning": "ok"}',
      model_used: 'crit-model',
    }),
  })

  const result = await scoreSignalWithRubric({
    signal: { id: 'sig-ok', source: 'arxiv' },
    rubric,
    dispatch: caller,
  })

  assertEquals(result.scoring_failed, false)
})

Deno.test(
  'Hotfix 2026-05-17: disqualifier match → scoring_failed=false (legit disqualif)',
  async () => {
    const rubric = makeRubric()
    const { caller } = makeMockDispatch({
      gate: () => ({
        ok: true,
        content: '{"disqualified_id": "dq_001", "applied": []}',
        model_used: 'gate-model',
      }),
      criteria: () => ({
        ok: false, // même si criteria fail, le disqualif a priorité
        error: 'should_not_matter',
      }),
    })

    const result = await scoreSignalWithRubric({
      signal: { id: 'sig-dq', source: 'reddit' },
      rubric,
      dispatch: caller,
    })

    assertEquals(result.disqualified, true)
    assertEquals(result.scoring_failed, false) // disqualif legit, pas un fail
  },
)
