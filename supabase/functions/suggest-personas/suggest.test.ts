/**
 * Tests Deno pour parseSuggestionsResponse (suggest-personas).
 * Exécuter : deno test supabase/functions/suggest-personas/suggest.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { parseSuggestionsResponse } from './suggest.ts'

// ─── Test 1 : JSON valide → hats + projects ──────────────────────────────────

Deno.test('parseSuggestionsResponse — JSON valide retourne hats + projects', () => {
  const raw = JSON.stringify({
    hats: [
      { name: 'CTO IA', key: 'cto-ia', context_md: 'Chapeau décisionnel IA pour infra.' },
      {
        name: 'Veilleur Marché',
        key: 'veilleur-marche',
        context_md: 'Suivi concurrence et tendances.',
      },
      {
        name: 'Chercheur Fondations',
        key: 'chercheur-fondations',
        context_md: 'Focus LLM et recherche.',
      },
    ],
    projects: [
      {
        name: 'Déploiement RAG v2',
        key: 'rag-v2',
        context_md: 'Projet de refonte du pipeline RAG.',
        date_start: '2026-05-01',
        date_end: '2026-07-31',
      },
      {
        name: 'Évaluation benchmarks',
        key: 'eval-benchmarks',
        context_md: 'Comparaison des modèles sur tâches métier.',
        date_start: '2026-06-01',
        date_end: '2026-06-30',
      },
    ],
  })

  const result = parseSuggestionsResponse(raw)

  assertEquals(result.hats.length, 3)
  assertEquals(result.hats[0].name, 'CTO IA')
  assertEquals(result.hats[0].key, 'cto-ia')
  assertEquals(result.hats[0].context_md, 'Chapeau décisionnel IA pour infra.')

  assertEquals(result.projects.length, 2)
  assertEquals(result.projects[0].name, 'Déploiement RAG v2')
  assertEquals(result.projects[0].key, 'rag-v2')
  assertEquals(result.projects[0].date_start, '2026-05-01')
  assertEquals(result.projects[0].date_end, '2026-07-31')
})

// ─── Test 2 : JSON invalide → { hats: [], projects: [] } ────────────────────

Deno.test('parseSuggestionsResponse — JSON invalide retourne hats et projects vides', () => {
  const result = parseSuggestionsResponse('pas du JSON { invalide }}')
  assertEquals(result, { hats: [], projects: [] })
})

Deno.test('parseSuggestionsResponse — chaîne vide retourne hats et projects vides', () => {
  const result = parseSuggestionsResponse('')
  assertEquals(result, { hats: [], projects: [] })
})

Deno.test('parseSuggestionsResponse — array au lieu d objet retourne vide', () => {
  const result = parseSuggestionsResponse('[{"name":"x"}]')
  assertEquals(result, { hats: [], projects: [] })
})

// ─── Test 3 : markdown fences stripped ──────────────────────────────────────

Deno.test('parseSuggestionsResponse — markdown fences sont supprimées', () => {
  const raw =
    '```json\n' +
    JSON.stringify({
      hats: [{ name: 'Architecte Cloud', key: 'architecte-cloud', context_md: 'Focus infra.' }],
      projects: [],
    }) +
    '\n```'

  const result = parseSuggestionsResponse(raw)

  assertEquals(result.hats.length, 1)
  assertEquals(result.hats[0].name, 'Architecte Cloud')
  assertEquals(result.hats[0].key, 'architecte-cloud')
  assertEquals(result.projects.length, 0)
})
