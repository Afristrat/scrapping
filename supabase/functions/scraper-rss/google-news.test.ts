import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { buildGoogleNewsSearchUrl } from './google-news.ts'

Deno.test(
  'buildGoogleNewsSearchUrl : encode le mot-clé et pose le hl/gl/ceid FR par défaut',
  () => {
    const url = buildGoogleNewsSearchUrl('agent IA & LLM')
    assertStringIncludes(url, 'https://news.google.com/rss/search?q=')
    assertStringIncludes(url, encodeURIComponent('agent IA & LLM'))
    assertStringIncludes(url, 'hl=fr')
    assertStringIncludes(url, 'gl=MA')
    assertStringIncludes(url, 'ceid=MA:fr')
  },
)

Deno.test('buildGoogleNewsSearchUrl : locale EN', () => {
  const url = buildGoogleNewsSearchUrl('AI safety', 'en')
  assertStringIncludes(url, 'hl=en')
  assertStringIncludes(url, 'gl=US')
  assertStringIncludes(url, 'ceid=US:en')
})

Deno.test('buildGoogleNewsSearchUrl : locale AR', () => {
  const url = buildGoogleNewsSearchUrl('الذكاء الاصطناعي', 'ar')
  assertStringIncludes(url, 'hl=ar')
  assertStringIncludes(url, 'ceid=MA:ar')
})

Deno.test('buildGoogleNewsSearchUrl : lang inconnue retombe sur fr', () => {
  // @ts-expect-error -- exercice volontairement une valeur hors union pour vérifier le fallback runtime
  const url = buildGoogleNewsSearchUrl('test', 'de')
  assertEquals(url.includes('hl=fr'), true)
})
