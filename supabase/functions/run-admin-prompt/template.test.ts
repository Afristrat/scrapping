/**
 * Tests Deno pour le moteur de templates `template.ts`.
 *
 * Couvre les 7 variables substituées par `renderTemplate` et la logique
 * d'extraction de `extractComposedRunKinds`.
 *
 * Lancement :
 *   deno test --allow-env --node-modules-dir=auto \
 *     supabase/functions/run-admin-prompt/template.test.ts
 */

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  extractComposedRunKinds,
  renderTemplate,
  type TemplateContext,
  type TemplateSignal,
} from './template.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    signals: [],
    language: 'fr',
    date: '2026-05-01',
    topicsEmerging: [],
    rubric: null,
    composedRuns: {},
    ...overrides,
  }
}

function makeSignal(overrides: Partial<TemplateSignal> = {}): TemplateSignal {
  return {
    id: 'sig-1',
    source: 'reddit',
    title: 'Titre par défaut',
    url: 'https://example.com/x',
    signal_date: '2026-04-30T08:00:00Z',
    scraped_at: '2026-04-30T09:00:00Z',
    score: 75,
    reasoning: null,
    raw_payload: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. renderTemplate — substitutions élémentaires
// ---------------------------------------------------------------------------

Deno.test('substitue les variables {{language}}, {{date}} et {{rubric}} avec leurs valeurs', () => {
  const ctx = makeContext({
    language: 'en',
    date: '2026-05-01',
    rubric: 'Évalue la pertinence du signal pour la veille IA.',
  })
  const tpl = 'lang={{language}} date={{date}} rubric={{rubric}}'

  const out = renderTemplate(tpl, ctx)

  assertEquals(
    out,
    'lang=en date=2026-05-01 rubric=Évalue la pertinence du signal pour la veille IA.',
  )
})

Deno.test('remplace {{rubric}} par le placeholder lorsque ctx.rubric est null', () => {
  const ctx = makeContext({ rubric: null })

  const out = renderTemplate('R={{rubric}}', ctx)

  assertEquals(out, 'R=(aucune rubrique active)')
})

// ---------------------------------------------------------------------------
// 2. renderTemplate — topics_emerging
// ---------------------------------------------------------------------------

Deno.test('joint les topics émergents avec ", " quand la liste est non vide', () => {
  const ctx = makeContext({ topicsEmerging: ['agents', 'on-device LLM', 'RAG'] })

  const out = renderTemplate('T={{topics_emerging}}', ctx)

  assertEquals(out, 'T=agents, on-device LLM, RAG')
})

Deno.test('utilise le placeholder quand la liste de topics émergents est vide', () => {
  const ctx = makeContext({ topicsEmerging: [] })

  const out = renderTemplate('T={{topics_emerging}}', ctx)

  assertEquals(out, 'T=(aucun topic émergent)')
})

// ---------------------------------------------------------------------------
// 3. renderTemplate — signals_block
// ---------------------------------------------------------------------------

Deno.test('rend le placeholder de {{signals_block}} quand la liste est vide', () => {
  const ctx = makeContext({ signals: [] })

  const out = renderTemplate('B={{signals_block}}', ctx)

  assertEquals(out, 'B=(aucun signal disponible)')
})

Deno.test('rend {{signals_block}} avec titre, [source], score et séparateur entre signaux', () => {
  const ctx = makeContext({
    signals: [
      makeSignal({
        id: 's1',
        source: 'reddit',
        title: 'Premier signal',
        score: 88,
      }),
      makeSignal({
        id: 's2',
        source: 'arxiv',
        title: 'Second signal',
        score: 42,
      }),
    ],
  })

  const out = renderTemplate('{{signals_block}}', ctx)

  assertStringIncludes(out, 'Premier signal')
  assertStringIncludes(out, '[reddit]')
  assertStringIncludes(out, '(score: 88)')
  assertStringIncludes(out, 'Second signal')
  assertStringIncludes(out, '[arxiv]')
  assertStringIncludes(out, '(score: 42)')
  assertStringIncludes(out, '\n\n---\n\n')
})

Deno.test('vérifie que {{signals_block}} affiche "(sans titre)" pour un signal sans titre', () => {
  const ctx = makeContext({
    signals: [makeSignal({ title: null })],
  })

  const out = renderTemplate('{{signals_block}}', ctx)

  assertStringIncludes(out, '(sans titre)')
})

Deno.test('tronque le summary du raw_payload à 400 caractères dans {{signals_block}}', () => {
  const longSummary = 'A'.repeat(1000)
  const ctx = makeContext({
    signals: [
      makeSignal({
        title: 'Signal long',
        raw_payload: { summary: longSummary },
      }),
    ],
  })

  const out = renderTemplate('{{signals_block}}', ctx)

  // La sortie doit contenir exactement 400 'A' contigus mais pas 401.
  assertStringIncludes(out, 'A'.repeat(400))
  assertEquals(out.includes('A'.repeat(401)), false)
})

Deno.test('priorise raw_payload.summary par rapport à raw_payload.selftext', () => {
  const ctx = makeContext({
    signals: [
      makeSignal({
        title: 'Signal priorité summary',
        raw_payload: { summary: 'CONTENU_SUMMARY', selftext: 'CONTENU_SELFTEXT' },
      }),
    ],
  })

  const out = renderTemplate('{{signals_block}}', ctx)

  assertStringIncludes(out, 'CONTENU_SUMMARY')
  assertEquals(out.includes('CONTENU_SELFTEXT'), false)
})

Deno.test('utilise raw_payload.selftext lorsque summary est absent', () => {
  const ctx = makeContext({
    signals: [
      makeSignal({
        title: 'Signal fallback selftext',
        raw_payload: { selftext: 'CONTENU_SELFTEXT' },
      }),
    ],
  })

  const out = renderTemplate('{{signals_block}}', ctx)

  assertStringIncludes(out, 'CONTENU_SELFTEXT')
})

// ---------------------------------------------------------------------------
// 4. renderTemplate — signals (JSON brut)
// ---------------------------------------------------------------------------

Deno.test('produit un JSON parseable contenant les ids quand {{signals}} est rendu', () => {
  const ctx = makeContext({
    signals: [makeSignal({ id: 'sig-A' }), makeSignal({ id: 'sig-B' })],
  })

  const out = renderTemplate('{{signals}}', ctx)
  const parsed = JSON.parse(out) as Array<{ id?: string }>

  assertEquals(Array.isArray(parsed), true)
  assertEquals(parsed.length, 2)
  assertEquals(parsed[0].id, 'sig-A')
  assertEquals(parsed[1].id, 'sig-B')
})

Deno.test('tronque {{signals}} à 30 000 caractères lorsque le JSON dépasse cette taille', () => {
  // Construit suffisamment de signaux pour dépasser 30 000 chars de JSON.
  const bigText = 'X'.repeat(2000)
  const signals: TemplateSignal[] = []
  for (let i = 0; i < 50; i++) {
    signals.push(
      makeSignal({
        id: `sig-${i}`,
        title: bigText,
        raw_payload: { summary: bigText },
      }),
    )
  }
  const ctx = makeContext({ signals })

  const out = renderTemplate('{{signals}}', ctx)

  assert(out.length <= 30000, `JSON injecté trop long : ${out.length}`)
  // S'assure qu'on a bien dépassé le seuil avant troncature (sécurité du test).
  assert(JSON.stringify(signals).length > 30000)
})

// ---------------------------------------------------------------------------
// 5. renderTemplate — run:<task_kind>
// ---------------------------------------------------------------------------

Deno.test("substitue {{run:<kind>}} par la valeur de composedRuns lorsqu'elle existe", () => {
  const ctx = makeContext({ composedRuns: { reddit: 'CONTENU_RUN_REDDIT' } })

  const out = renderTemplate('Précédent : {{run:reddit}}', ctx)

  assertStringIncludes(out, 'CONTENU_RUN_REDDIT')
})

Deno.test('utilise le placeholder lorsque le kind est absent de composedRuns', () => {
  const ctx = makeContext({ composedRuns: {} })

  const out = renderTemplate('Précédent : {{run:reddit}}', ctx)

  assertEquals(out, 'Précédent : (aucun run précédent disponible)')
})

Deno.test('considère un composedRuns vide ou whitespace comme manquant', () => {
  const ctxEmpty = makeContext({ composedRuns: { reddit: '' } })
  const ctxBlank = makeContext({ composedRuns: { reddit: '   \n  \t' } })

  const outEmpty = renderTemplate('{{run:reddit}}', ctxEmpty)
  const outBlank = renderTemplate('{{run:reddit}}', ctxBlank)

  assertEquals(outEmpty, '(aucun run précédent disponible)')
  assertEquals(outBlank, '(aucun run précédent disponible)')
})

Deno.test('ré-évalue les marqueurs présents dans le contenu injecté par {{run:<kind>}}', () => {
  // L'ordre documenté est : run:<kind> en premier, donc {{language}}
  // injecté est ensuite résolu par la passe suivante.
  const ctx = makeContext({
    language: 'fr',
    composedRuns: { reddit: '{{language}}' },
  })

  const out = renderTemplate('{{run:reddit}}', ctx)

  assertEquals(out, 'fr')
})

// ---------------------------------------------------------------------------
// 6. renderTemplate — robustesse
// ---------------------------------------------------------------------------

Deno.test('produit deux fois le même résultat pour deux appels successifs (idempotence)', () => {
  const ctx = makeContext({
    language: 'es',
    date: '2026-05-01',
    rubric: 'Rubrique X',
    topicsEmerging: ['t1', 't2'],
    signals: [makeSignal({ id: 'sig-1', title: 'Signal A' })],
    composedRuns: { reddit: 'run précédent' },
  })
  const tpl =
    'lang={{language}} d={{date}} r={{rubric}} t={{topics_emerging}} ' +
    'b={{signals_block}} j={{signals}} run={{run:reddit}}'

  const a = renderTemplate(tpl, ctx)
  const b = renderTemplate(tpl, ctx)

  assertEquals(a, b)
})

Deno.test('ne mute ni le template ni le contexte passés en argument', () => {
  const tpl = 'lang={{language}} sig={{signals_block}} run={{run:reddit}}'
  const tplSnapshot = tpl

  const ctx = makeContext({
    language: 'fr',
    signals: [makeSignal({ id: 'sig-1', title: 'Original' })],
    composedRuns: { reddit: 'run-A' },
    topicsEmerging: ['topic-1'],
  })
  const ctxSnapshot = JSON.parse(JSON.stringify(ctx))

  renderTemplate(tpl, ctx)

  assertEquals(tpl, tplSnapshot)
  assertEquals(JSON.parse(JSON.stringify(ctx)), ctxSnapshot)
})

// ---------------------------------------------------------------------------
// 7. extractComposedRunKinds
// ---------------------------------------------------------------------------

Deno.test('retourne un tableau vide pour un template sans marqueur run', () => {
  assertEquals(extractComposedRunKinds('Aucun run ici, juste {{language}}'), [])
})

Deno.test('extrait un unique kind {{run:reddit}}', () => {
  assertEquals(extractComposedRunKinds('Voir {{run:reddit}}'), ['reddit'])
})

Deno.test("extrait plusieurs kinds distincts d'un même template", () => {
  const tpl = 'A={{run:reddit}} B={{run:arxiv}} C={{run:x}} et un {{language}} pour brouiller'

  const kinds = extractComposedRunKinds(tpl)

  assertEquals(new Set(kinds), new Set(['reddit', 'arxiv', 'x']))
  assertEquals(kinds.length, 3)
})

Deno.test('déduplique les kinds répétés dans le template', () => {
  const tpl = '{{run:reddit}} ... {{run:reddit}} ... {{run:reddit}}'

  const kinds = extractComposedRunKinds(tpl)

  assertEquals(kinds.length, 1)
  assertEquals(kinds[0], 'reddit')
})

Deno.test('reconnaît les kinds avec ":", "-" et "_"', () => {
  const tpl = '{{run:synthesis:beta}} {{run:multi-source}} {{run:task_x}}'

  const kinds = extractComposedRunKinds(tpl)

  assertEquals(new Set(kinds), new Set(['synthesis:beta', 'multi-source', 'task_x']))
})

Deno.test('ne reconnaît pas un kind contenant des majuscules ({{run:Reddit}})', () => {
  assertEquals(extractComposedRunKinds('{{run:Reddit}}'), [])
})
