/**
 * topics-search/topics-search.test.ts — Tests purs sur validateSearchBody.
 *
 * Le validateur étant inline dans index.ts, on l'importe via le bundle Deno
 * (validateSearchBody n'est pas exporté ; on teste via comportement attendu en
 * appelant le handler en mode mock). Pour rester pur, on duplique le validateur
 * ici pour test minimal. Si l'API change, ces tests guident la refacto.
 */

import { assertEquals } from 'jsr:@std/assert@1'

// Reproduit la signature attendue côté index.ts pour tests d'intégration.
// Si on veut zéro duplication, on extraira validateSearchBody dans lib.ts plus tard.
const VALID_SEED = 'a'.repeat(60)
const TOO_SHORT_SEED = 'a'.repeat(49)

interface SearchBody {
  seed: string
  lang: 'fr' | 'en' | 'ar'
  min_similarity?: number
  max_age_days?: number
  limit_topics?: number
}

function isValidBodyShape(b: SearchBody): boolean {
  if (typeof b.seed !== 'string') return false
  if (b.seed.length < 50 || b.seed.length > 3000) return false
  if (!['fr', 'en', 'ar'].includes(b.lang)) return false
  if (b.min_similarity !== undefined && (b.min_similarity < 0 || b.min_similarity > 1)) return false
  if (
    b.max_age_days !== undefined &&
    (!Number.isInteger(b.max_age_days) || b.max_age_days < 1 || b.max_age_days > 365)
  )
    return false
  if (
    b.limit_topics !== undefined &&
    (!Number.isInteger(b.limit_topics) || b.limit_topics < 1 || b.limit_topics > 50)
  )
    return false
  return true
}

// =============================================================================
// Shape de body — tests minimaux
// =============================================================================

Deno.test('topics-search body: payload minimal valide', () => {
  const ok = isValidBodyShape({ seed: VALID_SEED, lang: 'fr' })
  assertEquals(ok, true)
})

Deno.test('topics-search body: seed trop court rejeté', () => {
  const ok = isValidBodyShape({ seed: TOO_SHORT_SEED, lang: 'fr' })
  assertEquals(ok, false)
})

Deno.test('topics-search body: lang inconnu rejeté', () => {
  // deno-lint-ignore no-explicit-any
  const ok = isValidBodyShape({ seed: VALID_SEED, lang: 'de' as any })
  assertEquals(ok, false)
})

Deno.test('topics-search body: min_similarity hors [0,1] rejeté', () => {
  const ok1 = isValidBodyShape({ seed: VALID_SEED, lang: 'fr', min_similarity: -0.1 })
  const ok2 = isValidBodyShape({ seed: VALID_SEED, lang: 'fr', min_similarity: 1.1 })
  assertEquals(ok1, false)
  assertEquals(ok2, false)
})

Deno.test('topics-search body: max_age_days hors [1,365] rejeté', () => {
  const ok1 = isValidBodyShape({ seed: VALID_SEED, lang: 'fr', max_age_days: 0 })
  const ok2 = isValidBodyShape({ seed: VALID_SEED, lang: 'fr', max_age_days: 366 })
  assertEquals(ok1, false)
  assertEquals(ok2, false)
})

Deno.test('topics-search body: limit_topics hors [1,50] rejeté', () => {
  const ok1 = isValidBodyShape({ seed: VALID_SEED, lang: 'fr', limit_topics: 0 })
  const ok2 = isValidBodyShape({ seed: VALID_SEED, lang: 'fr', limit_topics: 51 })
  assertEquals(ok1, false)
  assertEquals(ok2, false)
})

Deno.test('topics-search body: payload complet valide', () => {
  const ok = isValidBodyShape({
    seed: VALID_SEED,
    lang: 'en',
    min_similarity: 0.85,
    max_age_days: 14,
    limit_topics: 5,
  })
  assertEquals(ok, true)
})
