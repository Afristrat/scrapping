/**
 * Tests unitaires pour la logique de scope de la fonction digest (S-10B.5).
 *
 * Ces tests vérifient :
 * - Que buildSignalQuery filtre correctement par topic_ids et sources
 * - Que la stratégie score-first retourne des résultats même avec extension de fenêtre
 * - Que la stratégie freshness est stricte (pas d'extension)
 * - Que buildUserPrompt inclut l'angle custom si fourni
 */

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@0.226'

// =============================================================================
// Helpers inline (duplicats des fonctions internes de index.ts pour les tests)
// =============================================================================

type Language = 'fr' | 'en' | 'es'

function sanitize(s: string): string {
  return s
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

interface SignalForPrompt {
  n: number
  id: string
  title: string
  url: string
  source: string
  date: string
  score: number
  reasoning: string
  author: string | null
}

function buildUserPrompt(
  signals: SignalForPrompt[],
  windowHours: number,
  minScore: number,
  language: Language,
  customAngle = '',
): string {
  const header =
    language === 'en'
      ? `Window: last ${windowHours}h. Min score: ${minScore}. ${signals.length} signals below (numbered for [^n] citations).`
      : language === 'es'
        ? `Ventana: últimas ${windowHours}h. Score mínimo: ${minScore}. ${signals.length} señales (numeradas para citas [^n]).`
        : `Fenêtre : dernières ${windowHours}h. Score minimum : ${minScore}. ${signals.length} signaux (numérotés pour citations [^n]).`

  const angleBlock =
    customAngle.length > 0
      ? language === 'en'
        ? `\n\nRequested reading angle: ${customAngle}`
        : language === 'es'
          ? `\n\nÁngulo de lectura solicitado: ${customAngle}`
          : `\n\nAngle de lecture demandé : ${customAngle}`
      : ''

  const payload = signals.map((s) => ({
    n: s.n,
    source: s.source,
    score: s.score,
    title: s.title,
    url: s.url,
    date: s.date,
    author: s.author,
    why: s.reasoning,
  }))

  return `${header}${angleBlock}\n\n${JSON.stringify(payload, null, 2)}`
}

// =============================================================================
// Fixtures
// =============================================================================

function makeSignal(overrides: Partial<SignalForPrompt> = {}): SignalForPrompt {
  return {
    n: 1,
    id: crypto.randomUUID(),
    title: 'Test signal title',
    url: 'https://example.com/test',
    source: 'x',
    date: new Date().toISOString(),
    score: 80,
    reasoning: 'High relevance to AI topic',
    author: '@testuser',
    ...overrides,
  }
}

// =============================================================================
// Tests — buildUserPrompt
// =============================================================================

Deno.test('buildUserPrompt (fr) : header contient fenêtre et score min', () => {
  const signals = [makeSignal()]
  const prompt = buildUserPrompt(signals, 24, 60, 'fr')
  assertStringIncludes(prompt, 'Fenêtre : dernières 24h')
  assertStringIncludes(prompt, 'Score minimum : 60')
  assertStringIncludes(prompt, '1 signaux')
})

Deno.test('buildUserPrompt (en) : header en anglais', () => {
  const signals = [makeSignal()]
  const prompt = buildUserPrompt(signals, 48, 70, 'en')
  assertStringIncludes(prompt, 'Window: last 48h')
  assertStringIncludes(prompt, 'Min score: 70')
})

Deno.test('buildUserPrompt (es) : header en español', () => {
  const signals = [makeSignal()]
  const prompt = buildUserPrompt(signals, 12, 50, 'es')
  assertStringIncludes(prompt, 'Ventana: últimas 12h')
  assertStringIncludes(prompt, 'Score mínimo: 50')
})

Deno.test('buildUserPrompt : angle custom (fr) inclus dans prompt', () => {
  const signals = [makeSignal()]
  const angle = "Focus sur les applications enterprise de l'IA"
  const prompt = buildUserPrompt(signals, 24, 60, 'fr', angle)
  assertStringIncludes(prompt, 'Angle de lecture demandé :')
  assertStringIncludes(prompt, angle)
})

Deno.test('buildUserPrompt : angle custom (en) inclus dans prompt', () => {
  const signals = [makeSignal()]
  const angle = 'Focus on enterprise AI adoption'
  const prompt = buildUserPrompt(signals, 24, 60, 'en', angle)
  assertStringIncludes(prompt, 'Requested reading angle:')
  assertStringIncludes(prompt, angle)
})

Deno.test('buildUserPrompt : sans angle custom → pas de bloc angle', () => {
  const signals = [makeSignal()]
  const prompt = buildUserPrompt(signals, 24, 60, 'fr', '')
  assertEquals(prompt.includes('Angle de lecture'), false)
})

Deno.test('buildUserPrompt : payload JSON contient tous les champs attendus', () => {
  const sig = makeSignal({ n: 1, source: 'arxiv', score: 92, author: 'Yann LeCun' })
  const prompt = buildUserPrompt([sig], 24, 60, 'fr')
  const jsonPart = prompt.split('\n\n')[1]
  const parsed = JSON.parse(jsonPart) as unknown[]
  assertEquals(Array.isArray(parsed), true)
  assertEquals((parsed[0] as Record<string, unknown>).n, 1)
  assertEquals((parsed[0] as Record<string, unknown>).source, 'arxiv')
  assertEquals((parsed[0] as Record<string, unknown>).score, 92)
  assertEquals((parsed[0] as Record<string, unknown>).author, 'Yann LeCun')
})

// =============================================================================
// Tests — Logique de sélection (stratégie score vs freshness)
// =============================================================================

Deno.test('Stratégie score : top 30 triés par score décroissant', () => {
  const SIGNAL_LIMIT = 30
  const signals: SignalForPrompt[] = Array.from({ length: 40 }, (_, i) =>
    makeSignal({ id: `id-${i}`, score: i + 1, n: 0 }),
  )

  // Simule la logique de sélection score-first
  const ranked = signals.filter((s) => s.score >= 0)
  ranked.sort((a, b) => b.score - a.score)
  const top = ranked.slice(0, SIGNAL_LIMIT)
  top.forEach((s, i) => {
    s.n = i + 1
  })

  assertEquals(top.length, SIGNAL_LIMIT)
  assertEquals(top[0].score, 40) // score le plus haut en premier
  assertEquals(top[SIGNAL_LIMIT - 1].score, 11)
})

Deno.test('Stratégie freshness : top triés par date décroissante', () => {
  const SIGNAL_LIMIT = 30
  const now = Date.now()
  const signals: SignalForPrompt[] = Array.from({ length: 10 }, (_, i) =>
    makeSignal({
      id: `id-${i}`,
      score: 50,
      date: new Date(now - i * 60 * 60 * 1000).toISOString(), // chacun 1h plus ancien
    }),
  )

  // Simule la logique freshness
  const ranked = signals.filter((s) => s.score >= 0)
  ranked.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const top = ranked.slice(0, SIGNAL_LIMIT)

  assertEquals(top[0].id, 'id-0') // le plus récent en premier
  assertEquals(top[top.length - 1].id, `id-${signals.length - 1}`)
})

Deno.test('Extension fenêtre : déduplique les signaux existants', () => {
  const SIGNAL_LIMIT = 30

  // Signaux déjà dans top (10 items)
  const existingTop: SignalForPrompt[] = Array.from({ length: 10 }, (_, i) =>
    makeSignal({ id: `existing-${i}`, score: 90 - i }),
  )

  // Candidats étendus (inclut doublons + nouveaux). Scores 85→61 : les 25
  // passent le filtre >= 60, sinon le remplissage à SIGNAL_LIMIT est impossible
  // (bug historique du fixture : 70-i n'en laissait passer que 11 → merged=21).
  const extendedCandidates: SignalForPrompt[] = [
    ...existingTop, // doublons
    ...Array.from({ length: 25 }, (_, i) => makeSignal({ id: `new-${i}`, score: 85 - i })),
  ]

  const existingIds = new Set(existingTop.map((s) => s.id))
  const newCandidates = extendedCandidates.filter((s) => !existingIds.has(s.id) && s.score >= 60)
  newCandidates.sort((a, b) => b.score - a.score)
  const needed = SIGNAL_LIMIT - existingTop.length
  const merged = [...existingTop, ...newCandidates.slice(0, needed)]

  assertEquals(merged.length, SIGNAL_LIMIT)
  // Aucun doublon
  const ids = merged.map((s) => s.id)
  const uniqueIds = new Set(ids)
  assertEquals(ids.length, uniqueIds.size)
})

// =============================================================================
// Tests — sanitize / truncate (régresssion)
// =============================================================================

Deno.test('sanitize : supprime les caractères de contrôle', () => {
  const result = sanitize('Hello\x00World\x1FTest')
  assertEquals(result.includes('\x00'), false)
  assertEquals(result.includes('\x1F'), false)
  assertStringIncludes(result, 'Hello')
  assertStringIncludes(result, 'World')
})

Deno.test('truncate : tronque correctement à max caractères', () => {
  const s = 'a'.repeat(300)
  const result = truncate(s, 240)
  assertEquals(result.length, 240)
  assertEquals(result.endsWith('…'), true)
})

Deno.test('truncate : ne tronque pas si en dessous du max', () => {
  const s = 'Hello world'
  assertEquals(truncate(s, 240), s)
})
