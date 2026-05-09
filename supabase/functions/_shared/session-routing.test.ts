/**
 * Tests Deno pour session-routing.ts (Kairos K03).
 *
 * Couvre les helpers purs `parseSessionRouting` et `buildSessionRow` utilisés
 * par les 4 scrapers (x, reddit, arxiv, rss) en mode `target_table`.
 *
 * Exécuter :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/_shared/session-routing.test.ts
 */

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { buildSessionRow, isSessionMode, parseSessionRouting } from './session-routing.ts'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

// ─── parseSessionRouting — mode legacy (rétrocompat) ─────────────────────────

Deno.test('parseSessionRouting : body vide → mode legacy', () => {
  const r = parseSessionRouting({})
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals')
  assertEquals(r.config.sessionId, null)
})

Deno.test('parseSessionRouting : body null → mode legacy', () => {
  const r = parseSessionRouting(null)
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals')
})

Deno.test('parseSessionRouting : target_table=signals explicite → mode legacy', () => {
  const r = parseSessionRouting({ target_table: 'signals' })
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals')
  assertEquals(r.config.sessionId, null)
})

Deno.test('parseSessionRouting : target_table=signals + champs session ignorés', () => {
  // En mode legacy, session_id et autres ne doivent pas faire passer en mode session
  const r = parseSessionRouting({
    target_table: 'signals',
    session_id: VALID_UUID,
    ttl_hours: 5,
  })
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals')
  assertEquals(r.config.sessionId, null)
})

// ─── parseSessionRouting — mode session (validation stricte) ────────────────

Deno.test('parseSessionRouting : target_table=signals_session sans session_id → 400', () => {
  const r = parseSessionRouting({ target_table: 'signals_session' })
  assert(!r.ok)
  if (!r.ok) {
    assertEquals(r.error, 'session_id_required')
    assertEquals(r.status, 400)
  }
})

Deno.test('parseSessionRouting : target_table=signals_session + session_id non-UUID → 400', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: 'not-a-uuid',
  })
  assert(!r.ok)
  if (!r.ok) {
    assertEquals(r.error, 'session_id_invalid')
    assertEquals(r.status, 400)
  }
})

Deno.test('parseSessionRouting : target_table=signals_session + UUID valide → ok', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
  })
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals_session')
  assertEquals(r.config.sessionId, VALID_UUID)
  assertEquals(r.config.ttlHours, 1) // default
  assertEquals(r.config.createdByApiKey, null)
})

Deno.test('parseSessionRouting : ttl_hours=2 accepté', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: 2,
  })
  assert(r.ok)
  assertEquals(r.config.ttlHours, 2)
})

Deno.test('parseSessionRouting : ttl_hours=0 → 400', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: 0,
  })
  assert(!r.ok)
  if (!r.ok) assertEquals(r.error, 'ttl_hours_invalid')
})

Deno.test('parseSessionRouting : ttl_hours clampé à 24 max', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: 9999,
  })
  assert(r.ok)
  assertEquals(r.config.ttlHours, 24)
})

Deno.test('parseSessionRouting : created_by_api_key trim et accepté', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    created_by_api_key: '  bsr_pk_test_12345  ',
  })
  assert(r.ok)
  assertEquals(r.config.createdByApiKey, 'bsr_pk_test_12345')
})

Deno.test('parseSessionRouting : created_by_api_key vide → 400', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    created_by_api_key: '   ',
  })
  assert(!r.ok)
  if (!r.ok) assertEquals(r.error, 'created_by_api_key_invalid')
})

Deno.test('parseSessionRouting : target_table inconnu → 400', () => {
  const r = parseSessionRouting({ target_table: 'random_table' })
  assert(!r.ok)
  if (!r.ok) {
    assertEquals(r.error, 'invalid_target_table')
    assertEquals(r.status, 400)
  }
})

// ─── isSessionMode ──────────────────────────────────────────────────────────

Deno.test('isSessionMode : config legacy → false', () => {
  const r = parseSessionRouting({})
  assert(r.ok)
  assertEquals(isSessionMode(r.config), false)
})

Deno.test('isSessionMode : config session valide → true', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
  })
  assert(r.ok)
  assertEquals(isSessionMode(r.config), true)
})

// ─── buildSessionRow ────────────────────────────────────────────────────────

Deno.test('buildSessionRow : row complète avec expires_at = now + 1h', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
  })
  assert(r.ok)
  const fixedNow = Date.parse('2026-05-08T10:00:00.000Z')
  const row = buildSessionRow(
    {
      source: 'arxiv',
      external_id: 'http://arxiv.org/abs/2401.12345',
      url: 'http://arxiv.org/abs/2401.12345',
      title: 'Sparse Mixture-of-Experts at Scale',
      raw_payload: { authors: ['Alice', 'Bob'] },
    },
    r.config,
    fixedNow,
  )
  assertEquals(row.session_id, VALID_UUID)
  assertEquals(row.source, 'arxiv')
  assertEquals(row.title, 'Sparse Mixture-of-Experts at Scale')
  assertEquals(row.expires_at, '2026-05-08T11:00:00.000Z')
  assertEquals(row.created_by_api_key, null)
})

Deno.test('buildSessionRow : ttl_hours=3 → expires_at = now + 3h', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: 3,
    created_by_api_key: 'bsr_test',
  })
  assert(r.ok)
  const fixedNow = Date.parse('2026-05-08T00:00:00.000Z')
  const row = buildSessionRow(
    { source: 'rss', external_id: null, url: null, title: 'x', raw_payload: {} },
    r.config,
    fixedNow,
  )
  assertEquals(row.expires_at, '2026-05-08T03:00:00.000Z')
  assertEquals(row.created_by_api_key, 'bsr_test')
})

Deno.test('buildSessionRow : champs nullables → null (pas undefined)', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
  })
  assert(r.ok)
  const row = buildSessionRow({ source: 'web' }, r.config, 0)
  assertEquals(row.external_id, null)
  assertEquals(row.url, null)
  assertEquals(row.title, null)
  assertEquals(row.raw_payload, null)
})

Deno.test('buildSessionRow : throw si appelé sans session (garde-fou)', () => {
  const r = parseSessionRouting({})
  assert(r.ok)
  let threw = false
  try {
    buildSessionRow({ source: 'x' }, r.config, 0)
  } catch (e) {
    threw = true
    assert(e instanceof Error)
  }
  assertEquals(threw, true)
})
