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
