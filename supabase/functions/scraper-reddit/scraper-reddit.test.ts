/**
 * Tests Deno pour scraper-reddit (Kairos K03).
 *
 * Couvre l'intégration session-routing pour le scraper Reddit (via Apify).
 *
 * Exécuter :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/scraper-reddit/scraper-reddit.test.ts
 */

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { buildSessionRow, parseSessionRouting } from '../_shared/session-routing.ts'

const VALID_UUID = 'cccccccc-dddd-eeee-ffff-000011112222'

// ─── Test 1 : session_id manquant → 400 ─────────────────────────────────────

Deno.test('scraper-reddit: target_table=signals_session sans session_id → 400', () => {
  const r = parseSessionRouting({
    subs: ['MachineLearning', 'LocalLLaMA'],
    target_table: 'signals_session',
  })
  assert(!r.ok)
  if (!r.ok) {
    assertEquals(r.error, 'session_id_required')
    assertEquals(r.status, 400)
  }
})

// ─── Test 2 : Row Reddit session = source=reddit + permalink + score ────────

Deno.test('scraper-reddit: row signals_session a source=reddit + payload post', () => {
  const r = parseSessionRouting({
    subs: ['MachineLearning'],
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: 2,
  })
  assert(r.ok)

  const post = {
    id: 'abc123',
    title: 'New paper on RLHF',
    permalink: '/r/MachineLearning/comments/abc123/new_paper_rlhf/',
    url: 'https://reddit.com/r/MachineLearning/comments/abc123/new_paper_rlhf/',
    score: 234,
    created_utc: 1715166000,
  }
  const fixedNow = Date.parse('2026-05-08T08:00:00.000Z')
  const row = buildSessionRow(
    {
      source: 'reddit',
      external_id: 'abc123',
      url: post.url,
      title: post.title,
      raw_payload: post,
    },
    r.config,
    fixedNow,
  )

  assertEquals(row.source, 'reddit')
  assertEquals(row.session_id, VALID_UUID)
  // ttl_hours=2 → expires_at = now + 2h
  assertEquals(row.expires_at, '2026-05-08T10:00:00.000Z')
  assertEquals((row.raw_payload as { score: number }).score, 234)
})

// ─── Test 3 : ttl_hours invalide (négatif) → 400 ─────────────────────────────

Deno.test('scraper-reddit: ttl_hours négatif → 400', () => {
  const r = parseSessionRouting({
    subs: ['MachineLearning'],
    target_table: 'signals_session',
    session_id: VALID_UUID,
    ttl_hours: -1,
  })
  assert(!r.ok)
  if (!r.ok) assertEquals(r.error, 'ttl_hours_invalid')
})
