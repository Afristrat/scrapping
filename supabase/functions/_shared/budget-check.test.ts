// Tests Deno — budget-check.ts (garde budget fail-open du péage dispatch-llm)
//
// Exécution : deno test --allow-env --node-modules-dir=auto supabase/functions/_shared/budget-check.test.ts

import { assertEquals } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { budgetExceeded } from './budget-check.ts'

type CostRow = { cost: number | string | null }

/** Fake client minimal : ne supporte que from('llm_costs').select().eq().gte(). */
function makeClient(result: { data: CostRow[] | null; error: unknown }): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => Promise.resolve(result),
  }
  return { from: () => chain } as unknown as SupabaseClient
}

const USER = '00000000-0000-4000-8000-000000000001'

Deno.test('budget null → guard désactivé (false)', async () => {
  const client = makeClient({ data: [{ cost: 999 }], error: null })
  assertEquals(await budgetExceeded(client, USER, null), false)
})

Deno.test('budget 0 ou négatif → guard désactivé (false)', async () => {
  const client = makeClient({ data: [{ cost: 999 }], error: null })
  assertEquals(await budgetExceeded(client, USER, 0), false)
  assertEquals(await budgetExceeded(client, USER, -5), false)
})

Deno.test('budget NaN → guard désactivé (false)', async () => {
  const client = makeClient({ data: [{ cost: 999 }], error: null })
  assertEquals(await budgetExceeded(client, USER, Number.NaN), false)
})

Deno.test('dépense sous le budget → false', async () => {
  const client = makeClient({ data: [{ cost: 0.4 }, { cost: 0.3 }], error: null })
  assertEquals(await budgetExceeded(client, USER, 1), false)
})

Deno.test('dépense égale au budget → true (skip à spent >= budget)', async () => {
  const client = makeClient({ data: [{ cost: 0.5 }, { cost: 0.5 }], error: null })
  assertEquals(await budgetExceeded(client, USER, 1), true)
})

Deno.test('dépense au-dessus du budget → true', async () => {
  const client = makeClient({ data: [{ cost: 2 }], error: null })
  assertEquals(await budgetExceeded(client, USER, 1), true)
})

Deno.test('coûts NUMERIC renvoyés en string par PostgREST → sommés correctement', async () => {
  const client = makeClient({ data: [{ cost: '0.75' }, { cost: '0.30' }], error: null })
  assertEquals(await budgetExceeded(client, USER, 1), true)
})

Deno.test('rows avec cost null → traités comme 0', async () => {
  const client = makeClient({ data: [{ cost: null }, { cost: 0.2 }], error: null })
  assertEquals(await budgetExceeded(client, USER, 1), false)
})

Deno.test('erreur de lecture → fail-open (false)', async () => {
  const client = makeClient({ data: null, error: { message: 'boom' } })
  assertEquals(await budgetExceeded(client, USER, 1), false)
})

Deno.test('aucune dépense (data vide) → false', async () => {
  const client = makeClient({ data: [], error: null })
  assertEquals(await budgetExceeded(client, USER, 1), false)
})
