/**
 * Tests Deno pour orchestrator.ts — logique pure sans effets de bord.
 * Run : deno test --allow-env supabase/functions/process-pending-enrichments/orchestrator.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildDispatchList,
  buildLogPayload,
  filterRequeuable,
  PASS_KIND_TO_FN,
  type PendingCountRow,
} from './orchestrator.ts'

// ---------------------------------------------------------------------------
// PASS_KIND_TO_FN mapping
// ---------------------------------------------------------------------------

Deno.test('PASS_KIND_TO_FN contient les 3 pass_kind attendus', () => {
  assertEquals(PASS_KIND_TO_FN.entities, '/functions/v1/enrich-entities')
  assertEquals(PASS_KIND_TO_FN.reputation, '/functions/v1/compute-reputation')
  assertEquals(PASS_KIND_TO_FN.clustering, '/functions/v1/cluster-signals')
})

// ---------------------------------------------------------------------------
// buildDispatchList
// ---------------------------------------------------------------------------

Deno.test('buildDispatchList — retourne vide si aucun count > 0', () => {
  const rows: PendingCountRow[] = [
    { pass_kind: 'entities', count: 0 },
    { pass_kind: 'reputation', count: 0 },
    { pass_kind: 'clustering', count: 0 },
  ]
  assertEquals(buildDispatchList(rows), [])
})

Deno.test('buildDispatchList — retourne seulement les pass_kind avec count > 0', () => {
  const rows: PendingCountRow[] = [
    { pass_kind: 'entities', count: 5 },
    { pass_kind: 'reputation', count: 0 },
    { pass_kind: 'clustering', count: 3 },
  ]
  const result = buildDispatchList(rows)
  assertEquals(result.includes('entities'), true)
  assertEquals(result.includes('clustering'), true)
  assertEquals(result.includes('reputation'), false)
  assertEquals(result.length, 2)
})

Deno.test('buildDispatchList — ignore les pass_kind inconnus', () => {
  const rows: PendingCountRow[] = [
    { pass_kind: 'unknown_kind', count: 10 },
    { pass_kind: 'entities', count: 2 },
  ]
  const result = buildDispatchList(rows)
  assertEquals(result, ['entities'])
})

Deno.test('buildDispatchList — retourne les 3 si tous ont des jobs pending', () => {
  const rows: PendingCountRow[] = [
    { pass_kind: 'entities', count: 1 },
    { pass_kind: 'reputation', count: 1 },
    { pass_kind: 'clustering', count: 1 },
  ]
  assertEquals(buildDispatchList(rows).length, 3)
})

// ---------------------------------------------------------------------------
// filterRequeuable
// ---------------------------------------------------------------------------

Deno.test('filterRequeuable — exclut les jobs avec attempts >= 5', () => {
  const jobs = [
    { id: 'a', attempts: 5 },
    { id: 'b', attempts: 6 },
    { id: 'c', attempts: 10 },
  ]
  assertEquals(filterRequeuable(jobs), [])
})

Deno.test('filterRequeuable — inclut les jobs avec attempts < 5', () => {
  const jobs = [
    { id: 'a', attempts: 0 },
    { id: 'b', attempts: 4 },
    { id: 'c', attempts: 3 },
  ]
  assertEquals(filterRequeuable(jobs), ['a', 'b', 'c'])
})

Deno.test('filterRequeuable — liste mixte', () => {
  const jobs = [
    { id: 'a', attempts: 4 }, // ok
    { id: 'b', attempts: 5 }, // ko
    { id: 'c', attempts: 0 }, // ok
    { id: 'd', attempts: 7 }, // ko
  ]
  assertEquals(filterRequeuable(jobs), ['a', 'c'])
})

Deno.test('filterRequeuable — liste vide retourne vide', () => {
  assertEquals(filterRequeuable([]), [])
})

// ---------------------------------------------------------------------------
// buildLogPayload
// ---------------------------------------------------------------------------

Deno.test('buildLogPayload — structure correcte', () => {
  const payload = buildLogPayload(['entities', 'reputation'], 3, [
    { kind: 'entities', ok: true, status: 202 },
    { kind: 'reputation', ok: false, status: 500, error: 'timeout' },
  ])
  assertEquals(payload.dispatched, ['entities', 'reputation'])
  assertEquals(payload.requeued, 3)
  const results = payload.dispatch_results as Array<{
    kind: string
    ok: boolean
    status?: number
    error?: string
  }>
  assertEquals(results.length, 2)
  assertEquals(results[0].kind, 'entities')
  assertEquals(results[0].ok, true)
  assertEquals(results[1].ok, false)
  assertEquals(results[1].error, 'timeout')
})

Deno.test('buildLogPayload — 0 dispatched et 0 requeued', () => {
  const payload = buildLogPayload([], 0, [])
  assertEquals(payload.dispatched, [])
  assertEquals(payload.requeued, 0)
  assertEquals((payload.dispatch_results as unknown[]).length, 0)
})
