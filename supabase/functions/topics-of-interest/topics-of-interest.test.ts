/**
 * topics-of-interest/topics-of-interest.test.ts — Tests purs sur lib.ts.
 *
 * Run : deno test --allow-env --node-modules-dir=auto \
 *         supabase/functions/topics-of-interest/topics-of-interest.test.ts
 */

import { assertEquals } from 'jsr:@std/assert@1'
import { computeNextCollectAt, seedsChanged, validateCreateBody, validatePatchBody } from './lib.ts'

// =============================================================================
// validateCreateBody
// =============================================================================

const VALID_SEED = 'a'.repeat(60)
const TOO_SHORT_SEED = 'a'.repeat(49)
const TOO_LONG_SEED = 'a'.repeat(3001)

Deno.test('validateCreateBody: payload minimal valide accepté', () => {
  const r = validateCreateBody({ name: 'My Topic', seeds: [VALID_SEED], lang: 'fr' })
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.body.name, 'My Topic')
    assertEquals(r.body.seeds, [VALID_SEED])
    assertEquals(r.body.lang, 'fr')
    assertEquals(r.body.collect_cron, 'weekly') // default
  }
})

Deno.test('validateCreateBody: rejette payload non-objet', () => {
  const r = validateCreateBody('not-an-object')
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'invalid_body')
})

Deno.test('validateCreateBody: rejette name manquant', () => {
  const r = validateCreateBody({ seeds: [VALID_SEED], lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'name_required')
})

Deno.test('validateCreateBody: rejette name > 120 chars', () => {
  const r = validateCreateBody({ name: 'a'.repeat(121), seeds: [VALID_SEED], lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'name_too_long')
})

Deno.test('validateCreateBody: rejette seeds vide', () => {
  const r = validateCreateBody({ name: 'X', seeds: [], lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seeds_too_few')
})

Deno.test('validateCreateBody: rejette seeds > 5', () => {
  const r = validateCreateBody({
    name: 'X',
    seeds: [VALID_SEED, VALID_SEED, VALID_SEED, VALID_SEED, VALID_SEED, VALID_SEED],
    lang: 'fr',
  })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seeds_too_many')
})

Deno.test('validateCreateBody: rejette seed individuel trop court', () => {
  const r = validateCreateBody({ name: 'X', seeds: [TOO_SHORT_SEED], lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seeds[0]_too_short')
})

Deno.test('validateCreateBody: rejette seed individuel trop long', () => {
  const r = validateCreateBody({ name: 'X', seeds: [TOO_LONG_SEED], lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seeds[0]_too_long')
})

Deno.test('validateCreateBody: rejette lang inconnu', () => {
  const r = validateCreateBody({ name: 'X', seeds: [VALID_SEED], lang: 'de' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'lang_unsupported')
})

Deno.test('validateCreateBody: accepte scope_profile valide morocco-tech', () => {
  const r = validateCreateBody({
    name: 'X',
    seeds: [VALID_SEED],
    lang: 'fr',
    scope_profile: 'morocco-tech',
  })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.body.scope_profile, 'morocco-tech')
})

Deno.test('validateCreateBody: rejette scope_profile avec chars invalides', () => {
  const r = validateCreateBody({
    name: 'X',
    seeds: [VALID_SEED],
    lang: 'fr',
    scope_profile: 'morocco tech',
  }) // espace interdit
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'scope_profile_invalid_chars')
})

Deno.test('validateCreateBody: hints_override.reddit_subs normalisé', () => {
  const r = validateCreateBody({
    name: 'X',
    seeds: [VALID_SEED],
    lang: 'fr',
    hints_override: { reddit_subs: ['Morocco', 'AfricanTech', ''] },
  })
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.body.hints_override?.reddit_subs, ['Morocco', 'AfricanTech'])
  }
})

Deno.test('validateCreateBody: collect_cron invalide rejeté', () => {
  const r = validateCreateBody({
    name: 'X',
    seeds: [VALID_SEED],
    lang: 'fr',
    collect_cron: 'hourly',
  })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'collect_cron_invalid')
})

// =============================================================================
// validatePatchBody
// =============================================================================

Deno.test('validatePatchBody: patch vide rejeté', () => {
  const r = validatePatchBody({})
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'patch_body_empty')
})

Deno.test('validatePatchBody: name seul OK', () => {
  const r = validatePatchBody({ name: 'New Name' })
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.body.name, 'New Name')
    assertEquals(r.body.seeds, undefined)
  }
})

Deno.test('validatePatchBody: status seul OK', () => {
  const r = validatePatchBody({ status: 'paused' })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.body.status, 'paused')
})

Deno.test('validatePatchBody: scope_profile null = effacé', () => {
  const r = validatePatchBody({ scope_profile: null })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.body.scope_profile, null)
})

Deno.test('validatePatchBody: status invalide rejeté', () => {
  const r = validatePatchBody({ status: 'archived' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'status_invalid')
})

// =============================================================================
// seedsChanged
// =============================================================================

Deno.test('seedsChanged: oldSeeds null → true', () => {
  assertEquals(seedsChanged(null, ['a']), true)
})

Deno.test('seedsChanged: longueurs différentes → true', () => {
  assertEquals(seedsChanged(['a'], ['a', 'b']), true)
})

Deno.test('seedsChanged: ordre identique → false', () => {
  assertEquals(seedsChanged(['a', 'b'], ['a', 'b']), false)
})

Deno.test('seedsChanged: ordre différent → true', () => {
  assertEquals(seedsChanged(['a', 'b'], ['b', 'a']), true)
})

// =============================================================================
// computeNextCollectAt
// =============================================================================

Deno.test('computeNextCollectAt: daily +1 jour', () => {
  const from = new Date('2026-05-16T10:00:00Z')
  const next = computeNextCollectAt('daily', from)
  assertEquals(next?.toISOString(), '2026-05-17T10:00:00.000Z')
})

Deno.test('computeNextCollectAt: weekly +7 jours', () => {
  const from = new Date('2026-05-16T10:00:00Z')
  const next = computeNextCollectAt('weekly', from)
  assertEquals(next?.toISOString(), '2026-05-23T10:00:00.000Z')
})

Deno.test('computeNextCollectAt: monthly +30 jours', () => {
  const from = new Date('2026-05-16T10:00:00Z')
  const next = computeNextCollectAt('monthly', from)
  assertEquals(next?.toISOString(), '2026-06-15T10:00:00.000Z')
})

Deno.test('computeNextCollectAt: paused → null', () => {
  const from = new Date('2026-05-16T10:00:00Z')
  const next = computeNextCollectAt('paused', from)
  assertEquals(next, null)
})
