import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { buildVeilleBlocks, type VeilleItem } from './slack.ts'

const ITEM: VeilleItem = {
  titre: 'Un titre normal',
  score: 90,
  url: 'https://example.com/a',
  source: 'reddit',
}

Deno.test('buildVeilleBlocks : header + contexte + liste ordonnée', () => {
  const blocks = buildVeilleBlocks([ITEM], new Date('2026-06-03T12:00:00Z'), 42) as Array<{
    type: string
  }>
  assertEquals(blocks[0].type, 'header')
  assertEquals(blocks[1].type, 'context')
  assertEquals(blocks[2].type, 'divider')
  assertEquals(blocks[3].type, 'rich_text')
})

Deno.test('buildVeilleBlocks : contexte mentionne le compte analysé', () => {
  const blocks = buildVeilleBlocks([ITEM], new Date(), 42) as Array<{
    type: string
    elements?: Array<{ text?: string }>
  }>
  const contextText = blocks[1].elements?.[0]?.text ?? ''
  assertStringIncludes(contextText, '42 signaux analysés')
  assertStringIncludes(contextText, 'Top 1')
})

Deno.test('buildVeilleBlocks : titre long est aplati et tronqué proprement', () => {
  const longTitle = 'mot '.repeat(40) // 160 caractères, bien au-delà de TITLE_MAX=110
  const blocks = buildVeilleBlocks([{ ...ITEM, titre: longTitle }], new Date(), 1) as Array<{
    elements?: Array<{ elements?: Array<{ elements?: Array<{ text?: string }> }> }>
  }>
  const listEl = blocks[3].elements?.[0]?.elements?.[0]?.elements
  // Le lien (4e élément, index 3) porte le titre tronqué
  const link = listEl?.[3] as { text?: string } | undefined
  assert((link?.text?.length ?? 0) <= 111) // TITLE_MAX + ellipse
  assert(link?.text?.endsWith('…'))
  assert(!link?.text?.includes('\n'))
})

Deno.test('buildVeilleBlocks : pastille verte pour un score >= 85', () => {
  const blocks = buildVeilleBlocks([{ ...ITEM, score: 90 }], new Date(), 1) as Array<{
    elements?: Array<{ elements?: Array<{ elements?: Array<{ text?: string }> }> }>
  }>
  const listEl = blocks[3].elements?.[0]?.elements?.[0]?.elements
  assertEquals(listEl?.[0]?.text, '🟢 ')
})
