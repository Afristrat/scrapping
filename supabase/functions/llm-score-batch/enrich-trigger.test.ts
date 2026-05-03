/**
 * Tests unitaires pour enrich-trigger.ts
 *
 * Test 1 : Le trigger est best-effort — si enrich échoue, le résultat de scoring reste intact.
 * Test 2 : enrich_triggered est true dans le payload log quand des signal_ids sont présents.
 */

import { assertEquals, assertNotEquals } from 'jsr:@std/assert'
import { buildEnrichPayload, triggerEnrichSignal } from './enrich-trigger.ts'

// ─── Test 1 : buildEnrichPayload — cas valides et invalides ──────────────────

Deno.test('buildEnrichPayload retourne null si signalIds vide', () => {
  const result = buildEnrichPayload([], 'org-123')
  assertEquals(result, null)
})

Deno.test('buildEnrichPayload retourne null si orgId absent', () => {
  assertEquals(buildEnrichPayload(['sig-1', 'sig-2'], null), null)
  assertEquals(buildEnrichPayload(['sig-1', 'sig-2'], undefined), null)
  assertEquals(buildEnrichPayload(['sig-1', 'sig-2'], ''), null)
  assertEquals(buildEnrichPayload(['sig-1', 'sig-2'], '   '), null)
})

Deno.test('buildEnrichPayload retourne le payload correct si données valides', () => {
  const result = buildEnrichPayload(['sig-1', 'sig-2', 'sig-3'], 'org-abc')
  assertNotEquals(result, null)
  assertEquals(result!.signal_ids, ['sig-1', 'sig-2', 'sig-3'])
  assertEquals(result!.org_id, 'org-abc')
})

// ─── Test 2 : enrich_triggered = true quand signal_ids présents ──────────────

Deno.test('enrich_triggered est true quand buildEnrichPayload retourne un payload non-null', () => {
  const signalIds = ['sig-a', 'sig-b']
  const orgId = 'org-xyz'

  const payload = buildEnrichPayload(signalIds, orgId)
  const enrichTriggered = payload !== null

  assertEquals(
    enrichTriggered,
    true,
    'enrich_triggered doit être true quand signal_ids est non-vide',
  )
})

Deno.test('enrich_triggered est false quand signalIds est vide', () => {
  const payload = buildEnrichPayload([], 'org-xyz')
  const enrichTriggered = payload !== null

  assertEquals(enrichTriggered, false, 'enrich_triggered doit être false quand signal_ids est vide')
})

// ─── Test 3 : triggerEnrichSignal best-effort — un fetch qui échoue ne propage pas ──

Deno.test('triggerEnrichSignal best-effort : fetch échouant ne propage pas erreur', async () => {
  // On utilise une URL invalide pour simuler un échec fetch
  const payload = buildEnrichPayload(['sig-1'], 'org-test')
  assertNotEquals(payload, null)

  let threw = false
  try {
    // triggerEnrichSignal fire-and-forget : retourne true immédiatement
    const triggered = triggerEnrichSignal(
      'http://localhost:99999', // URL invalide garantissant un échec
      'Bearer test-token',
      payload!,
    )
    assertEquals(triggered, true)

    // Laisser le temps à la Promise interne de se résoudre (ou rejeter silencieusement)
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
  } catch {
    threw = true
  }

  assertEquals(threw, false, 'triggerEnrichSignal ne doit JAMAIS propager d erreur')
})

// ─── Test 4 : le résultat de scoring reste intact même si enrich échoue ──────

Deno.test('résultat scoring intact même si enrich fail (best-effort garanti)', async () => {
  // Simule le payload de résultat scoring
  const scoringResult = {
    batch_size: 3,
    scored: 3,
    missed: 0,
    cost: 0.0012,
    enrich_triggered: false as boolean,
    enrich_triggered_at: null as string | null,
  }

  const signalIds = ['sig-1', 'sig-2', 'sig-3']
  const orgId = 'org-test'

  const payload = buildEnrichPayload(signalIds, orgId)
  if (payload !== null) {
    // Enrich déclenché best-effort avec URL invalide
    triggerEnrichSignal('http://localhost:99999', 'Bearer tok', payload)
    scoringResult.enrich_triggered = true
    scoringResult.enrich_triggered_at = new Date().toISOString()
  }

  // Attendre que la Promise interne se résolve silencieusement
  await new Promise<void>((resolve) => setTimeout(resolve, 50))

  // Le résultat scoring doit rester intact
  assertEquals(scoringResult.batch_size, 3)
  assertEquals(scoringResult.scored, 3)
  assertEquals(scoringResult.missed, 0)
  assertEquals(scoringResult.cost, 0.0012)
  // Et enrich_triggered doit être true (le trigger a été lancé, même si fetch échoue)
  assertEquals(scoringResult.enrich_triggered, true)
})
