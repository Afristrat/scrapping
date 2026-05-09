/**
 * Tests Deno pour research-from-seed (Kairos K06).
 *
 * Couvre :
 *   - Body validation (seed length, lang, depth_hint)
 *   - hashApiKey + constantTimeEquals
 *   - validateApiKey (absent/invalide/inactif/scope manquant)
 *   - checkRateLimit (sliding window 60s)
 *   - callInternal (timeout, 4xx propagation)
 *   - buildScrapeJobs (multi-hints, sans-hints)
 *   - selectTopSignals (filtre disqualified, tri score desc, limit)
 *   - resolveCorsOrigin (whitelist)
 *   - Pipeline integration (mock fetch sur les 6 endpoints chaînés)
 *
 * Exécuter :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/research-from-seed/
 */

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import {
  buildCorsHeaders,
  buildScrapeJobs,
  callInternal,
  checkRateLimit,
  constantTimeEquals,
  hashApiKey,
  resolveCorsOrigin,
  selectTopSignals,
  validateApiKey,
  validateRequestBody,
} from './lib.ts'

// ============================================================================
// Helpers — mock SupabaseClient minimal pour les tests purs
// ============================================================================

interface MockOpResult {
  data?: unknown
  error?: unknown
  count?: number
}

interface MockBuilder {
  select: (cols?: string, opts?: unknown) => MockBuilder
  eq: (col: string, val: unknown) => MockBuilder
  gte: (col: string, val: unknown) => MockBuilder
  insert: (row: unknown) => Promise<MockOpResult>
  update: (row: unknown) => MockBuilder
  upsert: (rows: unknown) => Promise<MockOpResult>
  maybeSingle: () => Promise<MockOpResult>
  single: () => Promise<MockOpResult>
  then: <T>(resolve: (v: MockOpResult) => T) => Promise<T>
}

interface MockSupabaseConfig {
  apiKeyRow?: Record<string, unknown> | null
  apiKeyError?: unknown
  rateHitInsertError?: unknown
  rateHitCount?: number
  rateHitCountError?: unknown
}

function makeMockSupabase(cfg: MockSupabaseConfig = {}) {
  const inserts: Record<string, unknown[]> = {}
  const updates: Record<string, unknown[]> = {}

  function builder(table: string): MockBuilder {
    let _isCountQuery = false
    let _isMaybeSingle = false
    const self: MockBuilder = {
      select: (_cols?: string, opts?: unknown) => {
        if (opts && typeof opts === 'object' && (opts as Record<string, unknown>).count) {
          _isCountQuery = true
        }
        return self
      },
      eq: () => self,
      gte: () => self,
      insert: (row: unknown) => {
        inserts[table] ||= []
        inserts[table].push(row)
        if (table === 'public_api_rate_hits' && cfg.rateHitInsertError) {
          return Promise.resolve({ error: cfg.rateHitInsertError })
        }
        return Promise.resolve({ error: null })
      },
      update: (row: unknown) => {
        updates[table] ||= []
        updates[table].push(row)
        return self
      },
      upsert: () => Promise.resolve({ error: null }),
      maybeSingle: () => {
        _isMaybeSingle = true
        if (table === 'public_api_keys') {
          return Promise.resolve({
            data: cfg.apiKeyRow ?? null,
            error: cfg.apiKeyError ?? null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      },
      single: () => Promise.resolve({ data: null, error: null }),
      // .update().eq() chaining returns a thenable that resolves to {error: null}
      then: <T>(resolve: (v: MockOpResult) => T) => {
        if (table === 'public_api_rate_hits' && _isCountQuery) {
          return Promise.resolve(
            resolve({
              data: null,
              error: cfg.rateHitCountError ?? null,
              count: cfg.rateHitCount,
            }),
          )
        }
        return Promise.resolve(resolve({ data: null, error: null }))
      },
    }
    void _isMaybeSingle
    return self
  }

  return {
    from: (table: string) => builder(table),
    _captured: { inserts, updates },
  }
}

// ============================================================================
// validateRequestBody
// ============================================================================

const BODY_OK = {
  seed: 'Réforme du Code du travail au Maroc en 2026 : flexibilité CDD, droit de grève, conventions collectives, tension CGEM CDT UMT.',
  lang: 'fr',
}

Deno.test('validateRequestBody: rejette body null', () => {
  const r = validateRequestBody(null)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'invalid_body')
})

Deno.test('validateRequestBody: rejette seed < 50 chars', () => {
  const r = validateRequestBody({ seed: 'court', lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seed_too_short')
})

Deno.test('validateRequestBody: rejette seed > 3000 chars', () => {
  const r = validateRequestBody({ seed: 'a'.repeat(3001), lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seed_too_long')
})

Deno.test('validateRequestBody: rejette lang non supportée', () => {
  const r = validateRequestBody({ seed: BODY_OK.seed, lang: 'es' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'lang_unsupported')
})

Deno.test('validateRequestBody: accepte fr/en/ar', () => {
  for (const lang of ['fr', 'en', 'ar'] as const) {
    const r = validateRequestBody({ seed: BODY_OK.seed, lang })
    assert(r.ok)
    if (r.ok) assertEquals(r.body.lang, lang)
  }
})

Deno.test('validateRequestBody: depth_hint 0|1|2 accepté, autres rejetés', () => {
  for (const v of [0, 1, 2]) {
    const r = validateRequestBody({ ...BODY_OK, depth_hint: v })
    assert(r.ok)
  }
  for (const v of [-1, 3, 'x', 1.5]) {
    const r = validateRequestBody({ ...BODY_OK, depth_hint: v })
    assertEquals(r.ok, false)
  }
})

Deno.test('validateRequestBody: sector_hint optionnel + tronqué à 200 chars', () => {
  const longHint = 'x'.repeat(500)
  const r = validateRequestBody({ ...BODY_OK, sector_hint: longHint })
  assert(r.ok)
  if (r.ok) {
    assertEquals(r.body.sector_hint?.length, 200)
  }
})

// ============================================================================
// hashApiKey + constantTimeEquals
// ============================================================================

Deno.test('hashApiKey: produit un sha256 hex 64 chars stable', async () => {
  const h1 = await hashApiKey('bsr_test_12345678901234567890123456789012')
  const h2 = await hashApiKey('bsr_test_12345678901234567890123456789012')
  assertEquals(h1.length, 64)
  assertEquals(h1, h2)
  assert(/^[0-9a-f]+$/.test(h1))
})

Deno.test('hashApiKey: clés différentes → hash différents', async () => {
  const h1 = await hashApiKey('bsr_aaaaaaaa')
  const h2 = await hashApiKey('bsr_bbbbbbbb')
  assert(h1 !== h2)
})

Deno.test('constantTimeEquals: equals true / not-equals false', () => {
  assertEquals(constantTimeEquals('abc', 'abc'), true)
  assertEquals(constantTimeEquals('abc', 'abd'), false)
  assertEquals(constantTimeEquals('abc', 'abcd'), false)
  assertEquals(constantTimeEquals('', ''), true)
})

// ============================================================================
// validateApiKey
// ============================================================================

const VALID_KEY = 'bsr_test_12345678901234567890123456789012'

Deno.test('validateApiKey: clé trop courte → invalid_api_key', async () => {
  const supa = makeMockSupabase()
  const r = await validateApiKey(supa as never, 'short')
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.error, 'invalid_api_key')
    assertEquals(r.status, 401)
  }
})

Deno.test('validateApiKey: hash absent en DB → invalid_api_key', async () => {
  const supa = makeMockSupabase({ apiKeyRow: null })
  const r = await validateApiKey(supa as never, VALID_KEY)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'invalid_api_key')
})

Deno.test('validateApiKey: row trouvée mais inactive → inactive', async () => {
  const hash = await hashApiKey(VALID_KEY)
  const supa = makeMockSupabase({
    apiKeyRow: {
      id: 'k1',
      name: 'bassira-prod',
      key_hash: hash,
      key_prefix: 'bsr_test',
      scopes: ['research-only'],
      rate_limit_per_min: 60,
      daily_budget_usd: null,
      active: false,
    },
  })
  const r = await validateApiKey(supa as never, VALID_KEY)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'inactive')
})

Deno.test('validateApiKey: scope research-only manquant → scope_missing', async () => {
  const hash = await hashApiKey(VALID_KEY)
  const supa = makeMockSupabase({
    apiKeyRow: {
      id: 'k1',
      name: 'bassira-prod',
      key_hash: hash,
      key_prefix: 'bsr_test',
      scopes: ['admin-only'],
      rate_limit_per_min: 60,
      daily_budget_usd: null,
      active: true,
    },
  })
  const r = await validateApiKey(supa as never, VALID_KEY)
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.error, 'scope_missing')
    assertEquals(r.status, 403)
  }
})

Deno.test('validateApiKey: clé valide active scope OK + proxy_user_id → ok', async () => {
  const hash = await hashApiKey(VALID_KEY)
  const supa = makeMockSupabase({
    apiKeyRow: {
      id: 'k1',
      name: 'bassira-prod',
      key_hash: hash,
      key_prefix: 'bsr_test',
      scopes: ['research-only'],
      rate_limit_per_min: 60,
      daily_budget_usd: null,
      active: true,
      proxy_user_id: '11111111-1111-1111-1111-111111111111',
    },
  })
  const r = await validateApiKey(supa as never, VALID_KEY)
  assert(r.ok)
  if (r.ok) {
    assertEquals(r.key.id, 'k1')
    assertEquals(r.key.rate_limit_per_min, 60)
    assertEquals(r.key.proxy_user_id, '11111111-1111-1111-1111-111111111111')
  }
})

Deno.test(
  'validateApiKey: clé valide MAIS proxy_user_id null → proxy_user_not_configured',
  async () => {
    const hash = await hashApiKey(VALID_KEY)
    const supa = makeMockSupabase({
      apiKeyRow: {
        id: 'k2',
        name: 'orphan-key',
        key_hash: hash,
        key_prefix: 'bsr_test',
        scopes: ['research-only'],
        rate_limit_per_min: 60,
        daily_budget_usd: null,
        active: true,
        proxy_user_id: null,
      },
    })
    const r = await validateApiKey(supa as never, VALID_KEY)
    assertEquals(r.ok, false)
    if (!r.ok) {
      assertEquals(r.error, 'proxy_user_not_configured')
      assertEquals(r.status, 500)
    }
  },
)

// ============================================================================
// checkRateLimit
// ============================================================================

Deno.test('checkRateLimit: count <= limit → allowed', async () => {
  const supa = makeMockSupabase({ rateHitCount: 5 })
  const allowed = await checkRateLimit(supa as never, 'k1', 60)
  assertEquals(allowed, true)
})

Deno.test('checkRateLimit: count > limit → rejected', async () => {
  const supa = makeMockSupabase({ rateHitCount: 61 })
  const allowed = await checkRateLimit(supa as never, 'k1', 60)
  assertEquals(allowed, false)
})

Deno.test('checkRateLimit: insert error → rejected (fail-closed)', async () => {
  const supa = makeMockSupabase({ rateHitInsertError: { message: 'db down' } })
  const allowed = await checkRateLimit(supa as never, 'k1', 60)
  assertEquals(allowed, false)
})

Deno.test('checkRateLimit: count exact = limit → allowed (boundary)', async () => {
  const supa = makeMockSupabase({ rateHitCount: 60 })
  const allowed = await checkRateLimit(supa as never, 'k1', 60)
  assertEquals(allowed, true)
})

// ============================================================================
// callInternal
// ============================================================================

Deno.test('callInternal: 200 OK → ok=true + data parsed', async () => {
  const fakeFetch: typeof fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as typeof fetch
  const r = await callInternal<{ ok: boolean; value: number }>(
    'https://example.test/foo',
    { x: 1 },
    'service-jwt',
    1000,
    fakeFetch,
  )
  assert(r.ok)
  if (r.ok) assertEquals(r.data.value, 42)
})

Deno.test('callInternal: 4xx → propage status + error', async () => {
  const fakeFetch: typeof fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'bad_body', detail: 'seed too short' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as typeof fetch
  const r = await callInternal('https://example.test/foo', {}, 'jwt', 1000, fakeFetch)
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.status, 400)
    assertEquals(r.error, 'bad_body')
    assertEquals(r.detail, 'seed too short')
  }
})

Deno.test('callInternal: timeout → status 504 error=timeout', async () => {
  // Fake fetch qui ne résout jamais → AbortController doit le couper.
  const fakeFetch: typeof fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const sig = init?.signal as AbortSignal | undefined
      sig?.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })) as typeof fetch

  const r = await callInternal('https://example.test/slow', {}, 'jwt', 50, fakeFetch)
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.status, 504)
    assertEquals(r.error, 'timeout')
  }
})

Deno.test('callInternal: réseau-down → status 502 error=fetch_failed', async () => {
  const fakeFetch: typeof fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch
  const r = await callInternal('https://example.test/down', {}, 'jwt', 1000, fakeFetch)
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.status, 502)
    assertEquals(r.error, 'fetch_failed')
  }
})

// ============================================================================
// buildScrapeJobs
// ============================================================================

Deno.test('buildScrapeJobs: subjects multi-hints → 3 jobs (x, reddit, arxiv)', () => {
  const strategy = {
    subjects: [
      {
        id: 's1',
        x_handles_hint: [
          { handle: '@LeMonde', confident: true },
          { handle: 'reuters', confident: true },
        ],
        reddit_subs_hint: [{ sub: 'r/morocco', confident: true }],
        arxiv_categories_hint: ['cs.AI'],
      },
      {
        id: 's2',
        x_handles_hint: [{ handle: '@Bloomberg', confident: true }],
        arxiv_categories_hint: ['cs.LG'],
      },
    ],
  }
  const jobs = buildScrapeJobs(strategy)
  const scrapers = jobs.map((j) => j.scraper).sort()
  assertEquals(scrapers, ['arxiv', 'reddit', 'x'])
  const xJob = jobs.find((j) => j.scraper === 'x')!
  // Strip @ + dedupe
  const listIds = xJob.body.listIds as string[]
  assert(listIds.includes('LeMonde'))
  assert(listIds.includes('reuters'))
  assert(listIds.includes('Bloomberg'))

  const redditJob = jobs.find((j) => j.scraper === 'reddit')!
  // Strip r/
  assertEquals(redditJob.body.subs, ['morocco'])

  const arxivJob = jobs.find((j) => j.scraper === 'arxiv')!
  const cats = arxivJob.body.categories as string[]
  assert(cats.includes('cs.AI'))
  assert(cats.includes('cs.LG'))
})

Deno.test('buildScrapeJobs: aucun hint → liste vide', () => {
  const strategy = { subjects: [{ id: 's1', title: 'foo' }] }
  const jobs = buildScrapeJobs(strategy)
  assertEquals(jobs.length, 0)
})

Deno.test('buildScrapeJobs: subjects=undefined → liste vide', () => {
  const jobs = buildScrapeJobs({})
  assertEquals(jobs.length, 0)
})

Deno.test('buildScrapeJobs: cap listIds à 10 / subs à 12 / categories à 5', () => {
  const strategy = {
    subjects: [
      {
        id: 's1',
        x_handles_hint: Array.from({ length: 20 }, (_, i) => ({ handle: `u${i}` })),
        reddit_subs_hint: Array.from({ length: 30 }, (_, i) => ({ sub: `s${i}` })),
        arxiv_categories_hint: Array.from({ length: 12 }, (_, i) => `cs.${i}`),
      },
    ],
  }
  const jobs = buildScrapeJobs(strategy)
  const xJob = jobs.find((j) => j.scraper === 'x')!
  assertEquals((xJob.body.listIds as string[]).length, 10)
  const redJob = jobs.find((j) => j.scraper === 'reddit')!
  assertEquals((redJob.body.subs as string[]).length, 12)
  const arxJob = jobs.find((j) => j.scraper === 'arxiv')!
  assertEquals((arxJob.body.categories as string[]).length, 5)
})

// ============================================================================
// selectTopSignals
// ============================================================================

Deno.test('selectTopSignals: filtre disqualified=true', () => {
  const signals = [
    { id: 'a', score: 80, disqualified: false },
    { id: 'b', score: 90, disqualified: true },
    { id: 'c', score: 70, disqualified: false },
  ]
  const top = selectTopSignals(signals, 10)
  assertEquals(
    top.map((s) => s.id),
    ['a', 'c'],
  )
})

Deno.test('selectTopSignals: tri score desc', () => {
  const signals = [
    { id: 'a', score: 30, disqualified: false },
    { id: 'b', score: 90, disqualified: false },
    { id: 'c', score: 60, disqualified: false },
  ]
  const top = selectTopSignals(signals, 10)
  assertEquals(
    top.map((s) => s.id),
    ['b', 'c', 'a'],
  )
})

Deno.test('selectTopSignals: limit tronque', () => {
  const signals = Array.from({ length: 100 }, (_, i) => ({
    id: `s${i}`,
    score: 100 - i,
    disqualified: false,
  }))
  const top = selectTopSignals(signals, 5)
  assertEquals(top.length, 5)
  assertEquals(top[0].id, 's0')
  assertEquals(top[4].id, 's4')
})

Deno.test('selectTopSignals: signaux sans score finissent en bas', () => {
  const signals = [
    { id: 'a', disqualified: false },
    { id: 'b', score: 50, disqualified: false },
  ] as Array<{ id: string; score?: number; disqualified: boolean }>
  const top = selectTopSignals(signals, 10)
  assertEquals(top[0].id, 'b')
  assertEquals(top[1].id, 'a')
})

// ============================================================================
// CORS resolveCorsOrigin / buildCorsHeaders
// ============================================================================

Deno.test('resolveCorsOrigin: prospectives.ai-mpower.com OK', () => {
  assertEquals(
    resolveCorsOrigin('https://prospectives.ai-mpower.com'),
    'https://prospectives.ai-mpower.com',
  )
})

Deno.test('resolveCorsOrigin: sous-domaine *.ai-mpower.com OK', () => {
  assertEquals(resolveCorsOrigin('https://staging.ai-mpower.com'), 'https://staging.ai-mpower.com')
})

Deno.test('resolveCorsOrigin: localhost:port OK', () => {
  assertEquals(resolveCorsOrigin('http://localhost:3000'), 'http://localhost:3000')
  assertEquals(resolveCorsOrigin('http://localhost'), 'http://localhost')
  assertEquals(resolveCorsOrigin('http://127.0.0.1:5173'), 'http://127.0.0.1:5173')
})

Deno.test('resolveCorsOrigin: domaine random rejeté', () => {
  assertEquals(resolveCorsOrigin('https://attacker.com'), null)
  assertEquals(resolveCorsOrigin('https://ai-mpower.com.attacker.com'), null)
  assertEquals(resolveCorsOrigin('http://foo.com'), null)
  assertEquals(resolveCorsOrigin(null), null)
})

Deno.test('buildCorsHeaders: origin OK → reflect dans Access-Control-Allow-Origin', () => {
  const h = buildCorsHeaders('https://prospectives.ai-mpower.com')
  assertEquals(h['Access-Control-Allow-Origin'], 'https://prospectives.ai-mpower.com')
  assertEquals(h['Vary'], 'Origin')
})

Deno.test('buildCorsHeaders: origin NULL → pas de Access-Control-Allow-Origin', () => {
  const h = buildCorsHeaders(null)
  assertEquals(h['Access-Control-Allow-Origin'], undefined)
})

Deno.test('buildCorsHeaders: origin attacker → pas de Access-Control-Allow-Origin', () => {
  const h = buildCorsHeaders('https://attacker.com')
  assertEquals(h['Access-Control-Allow-Origin'], undefined)
})

// ============================================================================
// Pipeline integration — mock fetch sur les 6 endpoints chaînés
// ============================================================================

interface FetchCall {
  url: string
  body: unknown
}

function makeChainedFetch(): {
  fetchImpl: typeof fetch
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  const impl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const body = init?.body ? JSON.parse(init.body as string) : null
    calls.push({ url, body })

    if (url.endsWith('/research-strategist')) {
      return new Response(
        JSON.stringify({
          ok: true,
          research_strategy: {
            domain: 'politique',
            geo_scope: 'MA',
            language_mix: ['fr', 'ar'],
            subjects: [
              {
                id: 's_001',
                title: 'Code travail',
                angle: 'actors',
                x_handles_hint: [{ handle: 'leMatin', confident: true }],
              },
            ],
            tensions: [],
            blind_spots: [],
            recursion_budget: 1,
          },
          telemetry: { latency_ms: 1000, cost: 0.01 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.endsWith('/rubric-architect')) {
      return new Response(
        JSON.stringify({
          ok: true,
          rubric: {
            scoring_prompt: 'mock',
            criteria: [['relevance', 100]],
            disqualifiers: [],
            soft_boosts: [],
            calibration_examples: [],
          },
          telemetry: { duration_ms: 500, usage: { cost: 0.005 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.endsWith('/scraper-x')) {
      return new Response(JSON.stringify({ ok: true, inserted: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.endsWith('/llm-score-batch')) {
      return new Response(
        JSON.stringify({
          batch_size: 5,
          scored: 5,
          failed: 0,
          cost: 0.02,
          results: [
            { signal_id: 's-1', score: 80, disqualified: false, applied_boosts: [] },
            { signal_id: 's-2', score: 60, disqualified: false, applied_boosts: ['fr'] },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.endsWith('/signal-synthesizer')) {
      return new Response(
        JSON.stringify({
          ok: true,
          topics: [
            {
              id: 't_001',
              label: 'topic',
              type: 'devil_advocate',
              key_signals_supporting: ['s-1', 's-2'],
            },
          ],
          coverage_map: { s_001: { signals_count: 2, covered: true, topics: ['t_001'] } },
          cultural_warnings: [],
          devil_advocate_topic_id: 't_001',
          telemetry: { cost_usd: 0.015, latency_ms: 800 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.endsWith('/quality-auditor')) {
      return new Response(
        JSON.stringify({
          verdict: 'pass',
          issues: [],
          auto_corrections_applied: {},
          deepening_targets: [],
          telemetry: { llm_cost: 0.003, total_latency_ms: 400 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('not_found', { status: 404 })
  }) as typeof fetch
  return { fetchImpl: impl, calls }
}

Deno.test('callInternal: chained mock — research-strategist returns parsed strategy', async () => {
  const { fetchImpl, calls } = makeChainedFetch()
  const r = await callInternal<{ ok: boolean; research_strategy: Record<string, unknown> }>(
    'https://kairos.test/functions/v1/research-strategist',
    { seed: 'a'.repeat(60), lang: 'fr' },
    'service-jwt',
    5000,
    fetchImpl,
  )
  assert(r.ok)
  if (r.ok) {
    assertExists(r.data.research_strategy)
    assertEquals(calls.length, 1)
    assertEquals((calls[0].body as { lang: string }).lang, 'fr')
  }
})

Deno.test('Pipeline mock: ordre des appels chaînés respecté', async () => {
  // Simule la séquence d'appels que ferait le handler en pipelinant
  // research-strategist → rubric-architect → scraper-x → llm-score-batch
  // → signal-synthesizer → quality-auditor.
  const { fetchImpl, calls } = makeChainedFetch()
  const base = 'https://kairos.test/functions/v1'
  const jwt = 'svc'

  const strat = await callInternal<{ research_strategy: Record<string, unknown> }>(
    `${base}/research-strategist`,
    { seed: 'a'.repeat(60), lang: 'fr' },
    jwt,
    5000,
    fetchImpl,
  )
  assert(strat.ok)

  const rubric = await callInternal<{ rubric: Record<string, unknown> }>(
    `${base}/rubric-architect`,
    { seed: 'x', lang: 'fr', research_strategy: strat.ok ? strat.data.research_strategy : {} },
    jwt,
    5000,
    fetchImpl,
  )
  assert(rubric.ok)

  const scrape = await callInternal(`${base}/scraper-x`, {}, jwt, 5000, fetchImpl)
  assert(scrape.ok)

  const score = await callInternal<{ results: unknown[] }>(
    `${base}/llm-score-batch`,
    {},
    jwt,
    5000,
    fetchImpl,
  )
  assert(score.ok)

  const synth = await callInternal<{ topics: unknown[] }>(
    `${base}/signal-synthesizer`,
    {},
    jwt,
    5000,
    fetchImpl,
  )
  assert(synth.ok)

  const audit = await callInternal<{ verdict: string }>(
    `${base}/quality-auditor`,
    {},
    jwt,
    5000,
    fetchImpl,
  )
  assert(audit.ok)
  if (audit.ok) assertEquals(audit.data.verdict, 'pass')

  // Ordre vérifié
  assertEquals(calls.length, 6)
  assert(calls[0].url.endsWith('/research-strategist'))
  assert(calls[1].url.endsWith('/rubric-architect'))
  assert(calls[2].url.endsWith('/scraper-x'))
  assert(calls[3].url.endsWith('/llm-score-batch'))
  assert(calls[4].url.endsWith('/signal-synthesizer'))
  assert(calls[5].url.endsWith('/quality-auditor'))
})
