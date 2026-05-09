/**
 * Tests Deno pour scraper-rss (Kairos K03).
 *
 * Couvre l'intégration session-routing pour le scraper RSS : validation,
 * build de rows signals_session avec source='rss'.
 *
 * Exécuter :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/scraper-rss/scraper-rss.test.ts
 */

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { buildSessionRow, parseSessionRouting } from '../_shared/session-routing.ts'

const VALID_UUID = '11112222-3333-4444-5555-666677778888'

// ─── Test 1 : session_id manquant → 400 ─────────────────────────────────────

Deno.test('scraper-rss: target_table=signals_session sans session_id → 400', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    feed_urls: ['https://example.com/feed.xml'],
  })
  assert(!r.ok)
  if (!r.ok) assertEquals(r.error, 'session_id_required')
})

// ─── Test 2 : Row RSS session = source rss + raw_payload feed_url ───────────

Deno.test('scraper-rss: row signals_session a source=rss + url + payload riche', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
  })
  assert(r.ok)

  const fixedNow = Date.parse('2026-05-08T15:00:00.000Z')
  const row = buildSessionRow(
    {
      source: 'rss',
      external_id: 'https://blog.example.com/post-42',
      url: 'https://blog.example.com/post-42',
      title: 'Yet another LLM benchmark',
      raw_payload: {
        feed_url: 'https://blog.example.com/rss',
        feed_name: 'Example Blog',
        title: 'Yet another LLM benchmark',
        link: 'https://blog.example.com/post-42',
        description: '...',
        pub_date: '2026-05-08T14:00:00Z',
      },
    },
    r.config,
    fixedNow,
  )

  assertEquals(row.source, 'rss')
  assertEquals(row.url, 'https://blog.example.com/post-42')
  assertEquals(row.expires_at, '2026-05-08T16:00:00.000Z')
  assertEquals((row.raw_payload as { feed_url: string }).feed_url, 'https://blog.example.com/rss')
})

// ─── Test 3 : created_by_api_key propagé sur la row ─────────────────────────

Deno.test('scraper-rss: created_by_api_key propagé sur signals_session row', () => {
  const r = parseSessionRouting({
    target_table: 'signals_session',
    session_id: VALID_UUID,
    created_by_api_key: 'bsr_pk_42',
  })
  assert(r.ok)
  const row = buildSessionRow({ source: 'rss' }, r.config, 0)
  assertEquals(row.created_by_api_key, 'bsr_pk_42')
})
