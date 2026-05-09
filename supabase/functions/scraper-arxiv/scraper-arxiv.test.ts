/**
 * Tests Deno pour scraper-arxiv (Kairos K03).
 *
 * Couvre l'intégration session-routing pour le scraper ArXiv : validation
 * stricte session_id, build d'une row signals_session avec source='arxiv'.
 *
 * Exécuter :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/scraper-arxiv/scraper-arxiv.test.ts
 */

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { buildSessionRow, parseSessionRouting } from '../_shared/session-routing.ts'

const VALID_UUID = '8b4f1a2e-3e7c-4d2b-9c5d-7e8f9a0b1c2d'

// ─── Test 1 : target_table=signals_session sans session_id → 400 ────────────

Deno.test('scraper-arxiv: target_table=signals_session sans session_id → 400', () => {
  const r = parseSessionRouting({
    categories: ['cs.AI'],
    target_table: 'signals_session',
  })
  assert(!r.ok)
  if (!r.ok) {
    assertEquals(r.error, 'session_id_required')
    assertEquals(r.status, 400)
  }
})

// ─── Test 2 : Row arxiv en mode session a source='arxiv' + expires_at ───────

Deno.test('scraper-arxiv: row signals_session a source=arxiv + expires_at', () => {
  const r = parseSessionRouting({
    categories: ['cs.AI'],
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: 1,
  })
  assert(r.ok)

  const fixedNow = Date.parse('2026-05-08T12:00:00.000Z')
  const row = buildSessionRow(
    {
      source: 'arxiv',
      external_id: 'http://arxiv.org/abs/2405.99999',
      url: 'http://arxiv.org/abs/2405.99999',
      title: 'Test paper',
      raw_payload: { summary: 'abstract', published: '2026-05-08', categories: ['cs.AI'] },
    },
    r.config,
    fixedNow,
  )

  assertEquals(row.source, 'arxiv')
  assertEquals(row.session_id, VALID_UUID)
  assertEquals(row.expires_at, '2026-05-08T13:00:00.000Z')
  // Pas de user_id sur la row (table signals_session pas user-scoped)
  assert(!('user_id' in row))
  // Pas de signal_date sur la row (table signals_session minimaliste)
  assert(!('signal_date' in row))
})

// ─── Test 3 : Mode legacy (target_table absent) — comportement inchangé ─────

Deno.test('scraper-arxiv: target_table absent → mode legacy (sessionId null)', () => {
  const r = parseSessionRouting({ categories: ['cs.AI'] })
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals')
  assertEquals(r.config.sessionId, null)
})
