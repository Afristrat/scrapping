/**
 * Tests Deno pour scraper-x (Kairos K03).
 *
 * Couvre l'intégration session-routing pour le scraper X (Twitter via Apify).
 *
 * Exécuter :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/scraper-x/scraper-x.test.ts
 */

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { buildSessionRow, parseSessionRouting } from '../_shared/session-routing.ts'

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

// ─── Test 1 : session_id format invalide → 400 ──────────────────────────────

Deno.test('scraper-x: target_table=signals_session avec session_id non-UUID → 400', () => {
  const r = parseSessionRouting({
    listIds: ['1234567890'],
    target_table: 'signals_session',
    session_id: 'session-12345',
  })
  assert(!r.ok)
  if (!r.ok) assertEquals(r.error, 'session_id_invalid')
})

// ─── Test 2 : Row X session = source x + tweet metadata préservée ───────────

Deno.test('scraper-x: row signals_session a source=x + url x.com + payload tweet', () => {
  const r = parseSessionRouting({
    listIds: ['1234567890'],
    target_table: 'signals_session',
    session_id: VALID_UUID,
    apify_token: 'apify_test',
  })
  assert(r.ok)

  const tweetPayload = {
    id: '987654321',
    text: 'GPT-5 just dropped, here is my take…',
    author: { userName: 'jane_ai' },
    createdAt: '2026-05-08T10:00:00Z',
  }
  const fixedNow = Date.parse('2026-05-08T11:00:00.000Z')
  const row = buildSessionRow(
    {
      source: 'x',
      external_id: '987654321',
      url: 'https://x.com/jane_ai/status/987654321',
      title: 'GPT-5 just dropped, here is my take…',
      raw_payload: tweetPayload,
    },
    r.config,
    fixedNow,
  )

  assertEquals(row.source, 'x')
  assertEquals(row.url, 'https://x.com/jane_ai/status/987654321')
  assertEquals(row.expires_at, '2026-05-08T12:00:00.000Z')
  assertEquals((row.raw_payload as { id: string }).id, '987654321')
})

// ─── Test 3 : Mode legacy reste inchangé ────────────────────────────────────

Deno.test('scraper-x: body sans target_table → mode legacy', () => {
  const r = parseSessionRouting({ listIds: ['list1', 'list2'] })
  assert(r.ok)
  assertEquals(r.config.targetTable, 'signals')
  assertEquals(r.config.sessionId, null)
})
