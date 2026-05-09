/**
 * Tests Deno pour research-strategist (Kairos K01).
 *
 * Couvre la logique pure : validation body input, sanitization output LLM,
 * extraction JSON équilibrée, validation schema research_strategy.
 *
 * Les tests d'intégration (fetch dispatch-llm, JWT auth) sortent du scope —
 * laissés pour la phase E2E avec Supabase running.
 */

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@0.226'

import {
  buildSystemPrompt,
  buildUserMessage,
  extractJsonObject,
  sanitizeLlmJsonContent,
  stripControlChars,
  stripXmlNoise,
  validateRequestBody,
  validateResearchStrategy,
} from './lib.ts'

// ===========================================================================
// validateRequestBody — input validation
// ===========================================================================

Deno.test('validateRequestBody : rejette body non-object', () => {
  const r = validateRequestBody(null)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'invalid_body')
})

Deno.test('validateRequestBody : rejette seed trop courte (<50 chars)', () => {
  const r = validateRequestBody({ seed: 'court', lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seed_too_short')
})

Deno.test('validateRequestBody : rejette seed trop longue (>3000 chars)', () => {
  const longSeed = 'a'.repeat(3001)
  const r = validateRequestBody({ seed: longSeed, lang: 'fr' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'seed_too_long')
})

Deno.test('validateRequestBody : rejette lang non supportée (es)', () => {
  const seed = 'a'.repeat(100)
  const r = validateRequestBody({ seed, lang: 'es' })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'lang_unsupported')
})

Deno.test('validateRequestBody : accepte fr/en/ar', () => {
  const seed =
    'Réforme du Code du travail au Maroc en 2026, flexibilité CDD, droit de grève, conventions collectives, tension CGEM CDT UMT.'
  for (const lang of ['fr', 'en', 'ar'] as const) {
    const r = validateRequestBody({ seed, lang })
    assertEquals(r.ok, true)
    if (r.ok) assertEquals(r.body.lang, lang)
  }
})

Deno.test('validateRequestBody : sector_hint optionnel — undefined OK', () => {
  const seed =
    'Réforme du Code du travail au Maroc en 2026, flexibilité CDD, droit de grève, conventions collectives.'
  const r = validateRequestBody({ seed, lang: 'fr' })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.body.sector_hint, undefined)
})

Deno.test('validateRequestBody : sector_hint string accepté', () => {
  const seed =
    'Réforme du Code du travail au Maroc en 2026, flexibilité CDD, droit de grève, conventions collectives.'
  const r = validateRequestBody({ seed, lang: 'fr', sector_hint: 'politics' })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.body.sector_hint, 'politics')
})

Deno.test('validateRequestBody : sector_hint non-string rejeté', () => {
  const seed =
    'Réforme du Code du travail au Maroc en 2026, flexibilité CDD, droit de grève, conventions collectives.'
  const r = validateRequestBody({ seed, lang: 'fr', sector_hint: 42 })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'sector_hint_must_be_string')
})

Deno.test('validateRequestBody : trim seed avant comptage longueur', () => {
  const seed = '   ' + 'a'.repeat(60) + '   '
  const r = validateRequestBody({ seed, lang: 'fr' })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.body.seed.length, 60)
})

// ===========================================================================
// stripXmlNoise + stripControlChars + sanitizeLlmJsonContent
// ===========================================================================

Deno.test('stripXmlNoise : purge <tool_call>...</tool_call>', () => {
  const dirty = '<tool_call>{"foo":"bar"}</tool_call>{"clean":true}'
  const cleaned = stripXmlNoise(dirty)
  assertEquals(cleaned.includes('<tool_call>'), false)
  assertEquals(cleaned.includes('</tool_call>'), false)
  assertStringIncludes(cleaned, '{"clean":true}')
})

Deno.test('stripXmlNoise : purge <thinking> et <scratchpad> multilignes', () => {
  const dirty = `<thinking>
  Je dois réfléchir longtemps avant de répondre.
  Plusieurs lignes de raisonnement.
</thinking>
<scratchpad>brouillon</scratchpad>
{"result": 1}`
  const cleaned = stripXmlNoise(dirty)
  assertEquals(cleaned.includes('<thinking>'), false)
  assertEquals(cleaned.includes('<scratchpad>'), false)
  assertEquals(cleaned.includes('réfléchir'), false)
  assertStringIncludes(cleaned, '{"result": 1}')
})

Deno.test('stripXmlNoise : purge balises orphelines non-fermées', () => {
  const dirty = '<tool_call attr="x">{"a":1}'
  const cleaned = stripXmlNoise(dirty)
  assertEquals(cleaned.includes('<tool_call'), false)
  assertStringIncludes(cleaned, '{"a":1}')
})

Deno.test('stripControlChars : strip \\x00 et \\x07', () => {
  const dirty = 'hello\x00world\x07!'
  const cleaned = stripControlChars(dirty)
  assertEquals(cleaned, 'helloworld!')
})

Deno.test('sanitizeLlmJsonContent : strip ```json fences', () => {
  const wrapped = '```json\n{"foo":"bar"}\n```'
  const cleaned = sanitizeLlmJsonContent(wrapped)
  assertEquals(cleaned, '{"foo":"bar"}')
})

Deno.test('sanitizeLlmJsonContent : combo balises + fences + control chars', () => {
  const dirty = '<thinking>réflexion</thinking>\x00```json\n{"ok":true}\n```'
  const cleaned = sanitizeLlmJsonContent(dirty)
  assertEquals(cleaned, '{"ok":true}')
})

// ===========================================================================
// extractJsonObject — récupération du 1er bloc JSON équilibré
// ===========================================================================

Deno.test('extractJsonObject : extrait JSON entouré de bruit', () => {
  const noisy = 'Voici la réponse :\n{"a":1,"b":{"c":2}}\nFin.'
  assertEquals(extractJsonObject(noisy), '{"a":1,"b":{"c":2}}')
})

Deno.test('extractJsonObject : retourne null si pas de {', () => {
  assertEquals(extractJsonObject('no json here'), null)
})

Deno.test('extractJsonObject : gère accolades dans strings', () => {
  const s = '{"k":"valeur avec { accolade }"}'
  assertEquals(extractJsonObject(s), s)
})

Deno.test('extractJsonObject : gère échappements \\" dans strings', () => {
  const s = '{"k":"a \\"quoted\\" b"}'
  assertEquals(extractJsonObject(s), s)
})

// ===========================================================================
// validateResearchStrategy — schema check
// ===========================================================================

function validStrategyFixture(): Record<string, unknown> {
  return {
    domain: 'politique-sociale',
    geo_scope: 'MA',
    language_mix: ['fr', 'ar'],
    subjects: [
      {
        id: 's_001',
        title: 'Mobilisation des centrales syndicales',
        angle: 'actors',
        rationale: 'Acteurs centraux du blocage politique.',
        sub_queries: [{ q: 'CDT UMT réforme', lang: 'fr' }],
        rss_keywords: ['cdt', 'umt'],
        x_handles_hint: null,
        reddit_subs_hint: null,
        arxiv_categories_hint: null,
        expected_signal_volume: 'high',
        confidence: 0.85,
      },
      {
        id: 's_002',
        title: 'Position CGEM patronat',
        angle: 'counter',
        rationale: 'Contrepoids économique.',
        sub_queries: [{ q: 'CGEM position', lang: 'fr' }],
        rss_keywords: ['cgem'],
        x_handles_hint: null,
        reddit_subs_hint: null,
        arxiv_categories_hint: null,
        expected_signal_volume: 'medium',
        confidence: 0.8,
      },
      {
        id: 's_003',
        title: 'Précédent retraites France 2023',
        angle: 'precedents',
        rationale: 'Cas analogue récent.',
        sub_queries: [{ q: 'retraites france bilan', lang: 'fr' }],
        rss_keywords: ['retraites'],
        x_handles_hint: null,
        reddit_subs_hint: null,
        arxiv_categories_hint: null,
        expected_signal_volume: 'medium',
        confidence: 0.7,
      },
    ],
    tensions: [
      { between: ['s_001', 's_002'], nature: 'Lectures opposées.', exploit_in_synthesis: true },
    ],
    blind_spots: [
      { description: 'Voix arabophones populaires.', mitigation_query: 'تعليقات' },
    ],
    recursion_budget: 1,
  }
}

Deno.test('validateResearchStrategy : fixture valide passe', () => {
  const r = validateResearchStrategy(validStrategyFixture())
  assertEquals(r.ok, true)
})

Deno.test('validateResearchStrategy : rejette subjects.length=0', () => {
  const fx = validStrategyFixture()
  fx.subjects = []
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_subjects_too_few')
})

Deno.test('validateResearchStrategy : rejette subjects.length=2 (<3)', () => {
  const fx = validStrategyFixture()
  fx.subjects = (fx.subjects as unknown[]).slice(0, 2)
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_subjects_too_few')
})

Deno.test('validateResearchStrategy : rejette subjects.length=13 (>12)', () => {
  const fx = validStrategyFixture()
  const base = (fx.subjects as Array<Record<string, unknown>>)[0]
  const many = []
  for (let i = 0; i < 13; i++) {
    many.push({ ...base, id: `s_${String(i).padStart(3, '0')}` })
  }
  fx.subjects = many
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_subjects_too_many')
})

Deno.test('validateResearchStrategy : rejette recursion_budget=3', () => {
  const fx = validStrategyFixture()
  fx.recursion_budget = 3
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_recursion_budget_out_of_range')
})

Deno.test('validateResearchStrategy : rejette recursion_budget=-1', () => {
  const fx = validStrategyFixture()
  fx.recursion_budget = -1
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_recursion_budget_out_of_range')
})

Deno.test('validateResearchStrategy : rejette recursion_budget non-int (1.5)', () => {
  const fx = validStrategyFixture()
  fx.recursion_budget = 1.5
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_recursion_budget_not_int')
})

Deno.test('validateResearchStrategy : rejette angle inconnu', () => {
  const fx = validStrategyFixture()
  ;(fx.subjects as Array<Record<string, unknown>>)[0].angle = 'invalid-angle'
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_subject_angle_invalid')
})

Deno.test('validateResearchStrategy : rejette tensions non-array', () => {
  const fx = validStrategyFixture()
  fx.tensions = 'not-an-array'
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_tensions_not_array')
})

Deno.test('validateResearchStrategy : rejette blind_spots non-array', () => {
  const fx = validStrategyFixture()
  fx.blind_spots = null
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_blind_spots_not_array')
})

Deno.test('validateResearchStrategy : rejette domain manquant', () => {
  const fx = validStrategyFixture()
  delete fx.domain
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_domain_invalid')
})

Deno.test('validateResearchStrategy : rejette language_mix vide', () => {
  const fx = validStrategyFixture()
  fx.language_mix = []
  const r = validateResearchStrategy(fx)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'schema_language_mix_invalid')
})

// ===========================================================================
// buildSystemPrompt + buildUserMessage — sanity checks
// ===========================================================================

Deno.test('buildSystemPrompt : contient mention de la lang fr', () => {
  const p = buildSystemPrompt('fr')
  assertStringIncludes(p, 'fr')
  assertStringIncludes(p, 'MÉTHODOLOGIE OBLIGATOIRE')
  assertStringIncludes(p, 'INTERDICTIONS')
  assertStringIncludes(p, 'SCHEMA OUTPUT')
})

Deno.test('buildSystemPrompt : conserve accents majuscules en fr', () => {
  const p = buildSystemPrompt('fr')
  // É, È, À doivent apparaître (DEFCON 1 FR)
  assert(p.includes('É'), 'É manquant')
  assert(p.includes('È'), 'È manquant')
  assert(p.includes('À'), 'À manquant')
})

Deno.test('buildSystemPrompt : liste les 8 angles', () => {
  const p = buildSystemPrompt('en')
  for (const angle of [
    'actors',
    'metrics',
    'precedents',
    'counter',
    'weak-signals',
    'context',
    'velocity',
    'second-order',
  ]) {
    assertStringIncludes(p, angle)
  }
})

Deno.test('buildUserMessage : sérialise seed + lang + sector_hint', () => {
  const msg = buildUserMessage({
    seed: 'graine de test pour validation',
    lang: 'fr',
    sector_hint: 'politics',
  })
  const parsed = JSON.parse(msg)
  assertEquals(parsed.seed, 'graine de test pour validation')
  assertEquals(parsed.lang, 'fr')
  assertEquals(parsed.sector_hint, 'politics')
})

Deno.test('buildUserMessage : sector_hint absent → null', () => {
  const msg = buildUserMessage({ seed: 'graine', lang: 'fr' })
  const parsed = JSON.parse(msg)
  assertEquals(parsed.sector_hint, null)
})
