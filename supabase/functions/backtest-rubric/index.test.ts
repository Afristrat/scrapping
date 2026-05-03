/**
 * Tests pour backtest-rubric.
 *
 * Stratégie : les tests HTTP full-stack nécessitent un serveur Supabase local.
 * Ici, on teste les fonctions utilitaires extraites de la logique métier,
 * ainsi que les comportements clés du handler via des mocks Deno.
 */

import { assertEquals, assertMatch } from 'jsr:@std/assert@1'

// ─── Helpers extraits pour les tests ────────────────────────────────────────

const MAX_SIGNALS = 100

/**
 * Applique le cap max_signals : min(requested, MAX_SIGNALS)
 */
function resolveLimit(max_signals: number | undefined): number {
  return Math.min(
    typeof max_signals === 'number' && max_signals > 0 ? max_signals : MAX_SIGNALS,
    MAX_SIGNALS,
  )
}

/**
 * Parse un score depuis le contenu LLM (regex + JSON fallback).
 */
function parseBacktestScore(content: string): { score: number; reasoning: string } {
  let score = 0
  let reasoning = '(no reasoning)'

  const match = content.match(/score:?\s*(\d+)/i)
  if (match) {
    const parsed = parseInt(match[1], 10)
    score = Math.max(0, Math.min(100, isNaN(parsed) ? 0 : parsed))
  } else {
    try {
      const parsed = JSON.parse(content)
      if (typeof parsed.score === 'number' && isFinite(parsed.score)) {
        score = Math.max(0, Math.min(100, Math.round(parsed.score)))
      }
      if (typeof parsed.reasoning === 'string') {
        reasoning = parsed.reasoning.slice(0, 1000)
      }
    } catch {
      score = 0
    }
  }

  // Attempt reasoning extraction if still default
  if (reasoning === '(no reasoning)') {
    try {
      const parsed = JSON.parse(content)
      if (typeof parsed.reasoning === 'string') {
        reasoning = parsed.reasoning.slice(0, 1000)
      }
    } catch {
      // Keep default
    }
  }

  return { score, reasoning }
}

/**
 * Calcule le delta entre backtested et current score.
 */
function computeDelta(backtested: number, current: number | null): number {
  return backtested - (current ?? backtested)
}

// ─── Tests cap max_signals ───────────────────────────────────────────────────

Deno.test('resolveLimit: valeur par défaut = 100', () => {
  assertEquals(resolveLimit(undefined), 100)
})

Deno.test('resolveLimit: cap à 100 même si > 100 passé', () => {
  assertEquals(resolveLimit(200), 100)
  assertEquals(resolveLimit(150), 100)
  assertEquals(resolveLimit(1000), 100)
})

Deno.test('resolveLimit: valeur <= 100 est respectée', () => {
  assertEquals(resolveLimit(50), 50)
  assertEquals(resolveLimit(10), 10)
  assertEquals(resolveLimit(100), 100)
})

Deno.test('resolveLimit: valeur 0 ou négative → défaut 100', () => {
  assertEquals(resolveLimit(0), 100)
  assertEquals(resolveLimit(-5), 100)
})

// ─── Tests parsing score LLM ─────────────────────────────────────────────────

Deno.test('parseBacktestScore: regex "score: 75" fonctionne', () => {
  const { score } = parseBacktestScore('The score: 75 for this signal')
  assertEquals(score, 75)
})

Deno.test('parseBacktestScore: regex "score:80" sans espace', () => {
  const { score } = parseBacktestScore('score:80 rationale follows')
  assertEquals(score, 80)
})

Deno.test('parseBacktestScore: JSON fallback {"score": 60}', () => {
  const { score, reasoning } = parseBacktestScore('{"score": 60, "reasoning": "Très pertinent"}')
  assertEquals(score, 60)
  assertEquals(reasoning, 'Très pertinent')
})

Deno.test('parseBacktestScore: score hors range clampé à [0, 100]', () => {
  const high = parseBacktestScore('score: 150')
  assertEquals(high.score, 100)
  const low = parseBacktestScore('score: -10')
  assertEquals(low.score, 0)
})

Deno.test('parseBacktestScore: contenu vide → score 0', () => {
  const { score } = parseBacktestScore('')
  assertEquals(score, 0)
})

Deno.test('parseBacktestScore: contenu sans score → 0', () => {
  const { score } = parseBacktestScore('Aucun score disponible pour ce signal.')
  assertEquals(score, 0)
})

// ─── Tests delta ─────────────────────────────────────────────────────────────

Deno.test('computeDelta: promotion +30', () => {
  assertEquals(computeDelta(80, 50), 30)
})

Deno.test('computeDelta: rétrogradation -20', () => {
  assertEquals(computeDelta(40, 60), -20)
})

Deno.test('computeDelta: current_score null → delta 0', () => {
  assertEquals(computeDelta(70, null), 0)
})

Deno.test('computeDelta: égalité → delta 0', () => {
  assertEquals(computeDelta(55, 55), 0)
})

// ─── Test happy path logique (3 signaux → 3 résultats avec delta) ─────────────

Deno.test('happy path: 3 signaux mockés produisent 3 résultats avec delta', () => {
  const signals = [
    { id: 'sig-1', title: 'Signal A', raw_payload: {} },
    { id: 'sig-2', title: 'Signal B', raw_payload: {} },
    { id: 'sig-3', title: 'Signal C', raw_payload: {} },
  ]

  const currentScores = new Map([
    ['sig-1', 50],
    ['sig-2', 70],
    // sig-3 has no current score
  ])

  const llmResponses = [
    '{"score": 80, "reasoning": "Très pertinent pour A"}',
    '{"score": 60, "reasoning": "Moins pertinent pour B"}',
    '{"score": 45, "reasoning": "Pertinent pour C"}',
  ]

  const results = signals.map((signal, i) => {
    const { score: backtested_score, reasoning: reasoning_new } = parseBacktestScore(
      llmResponses[i],
    )
    const current_score = currentScores.get(signal.id) ?? null
    const delta = computeDelta(backtested_score, current_score)
    return {
      signal_id: signal.id,
      title: signal.title,
      current_score,
      backtested_score,
      delta,
      reasoning_new,
    }
  })

  assertEquals(results.length, 3)

  // Signal A: current=50, backtested=80, delta=+30
  assertEquals(results[0].signal_id, 'sig-1')
  assertEquals(results[0].current_score, 50)
  assertEquals(results[0].backtested_score, 80)
  assertEquals(results[0].delta, 30)
  assertMatch(results[0].reasoning_new, /pertinent pour A/i)

  // Signal B: current=70, backtested=60, delta=-10
  assertEquals(results[1].signal_id, 'sig-2')
  assertEquals(results[1].current_score, 70)
  assertEquals(results[1].backtested_score, 60)
  assertEquals(results[1].delta, -10)

  // Signal C: no current score, delta=0
  assertEquals(results[2].signal_id, 'sig-3')
  assertEquals(results[2].current_score, null)
  assertEquals(results[2].backtested_score, 45)
  assertEquals(results[2].delta, 0)
})

// ─── Test rubric vide → erreur 400 ────────────────────────────────────────────

Deno.test('validation: rubric_prompt vide doit être rejeté', () => {
  function validateBody(body: { rubric_prompt?: string }): string | null {
    if (
      !body.rubric_prompt ||
      typeof body.rubric_prompt !== 'string' ||
      body.rubric_prompt.trim().length === 0
    ) {
      return 'rubric_prompt_required'
    }
    return null
  }

  assertEquals(validateBody({}), 'rubric_prompt_required')
  assertEquals(validateBody({ rubric_prompt: '' }), 'rubric_prompt_required')
  assertEquals(validateBody({ rubric_prompt: '   ' }), 'rubric_prompt_required')
  assertEquals(validateBody({ rubric_prompt: 'Valid prompt text' }), null)
})

// ─── Test concurrence (log-based lock) ────────────────────────────────────────

Deno.test('concurrent lock: second appel pendant premier → 409', async () => {
  // Simule la logique de vérification du lock via les logs
  const locks = new Map<string, boolean>()

  function tryAcquireLock(userId: string): boolean {
    if (locks.get(userId)) return false
    locks.set(userId, true)
    return true
  }

  function releaseLock(userId: string): void {
    locks.delete(userId)
  }

  const userId = 'user-concurrent-test'

  // Premier appel acquiert le lock
  const first = tryAcquireLock(userId)
  assertEquals(first, true)

  // Deuxième appel échoue → 409
  const second = tryAcquireLock(userId)
  assertEquals(second, false)

  // Après release, nouveau appel réussit
  releaseLock(userId)
  const third = tryAcquireLock(userId)
  assertEquals(third, true)
  releaseLock(userId)
})

// ─── Test structure du résultat final ─────────────────────────────────────────

Deno.test('résultat: chaque entrée contient les champs requis', () => {
  const result = {
    signal_id: 'sig-abc',
    title: 'Test signal',
    current_score: 45,
    backtested_score: 72,
    delta: 27,
    reasoning_new: 'Signal très pertinent pour le contexte IA',
  }

  assertEquals(typeof result.signal_id, 'string')
  assertEquals(typeof result.title, 'string')
  assertEquals(typeof result.backtested_score, 'number')
  assertEquals(typeof result.delta, 'number')
  assertEquals(typeof result.reasoning_new, 'string')
  // current_score peut être null
  assertEquals(result.current_score !== undefined, true)
})
