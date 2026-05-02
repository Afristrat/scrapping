import { assertEquals } from 'jsr:@std/assert@1'
import { rotateEntries, formatEntry, slugify } from './minio.ts'

Deno.test('rotateEntries déplace les entrées > 90 jours dans archived', () => {
  const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
  const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000

  const content =
    `# Test\nfirst_seen: 2026-01-01\nis_seed: true\n\n## Run History\n\n` +
    `### ${oldDate}\n- signal_count: 3\n- sources: x(count=3,avg=70.0)\n- top_signal: (none)\n\n` +
    `### ${recentDate}\n- signal_count: 5\n- sources: arxiv(count=5,avg=80.0)\n- top_signal: (none)\n`

  const { kept, archived } = rotateEntries(content, cutoff)
  assertEquals(archived.length, 1)
  assertEquals(kept.includes(recentDate), true)
  assertEquals(kept.includes(oldDate), false)
})

Deno.test('rotateEntries préserve les blocs multi-lignes (régression bug regex)', () => {
  const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000

  const content =
    `# Test\n## Run History\n\n` +
    `### ${recentDate}\n- signal_count: 7\n- sources: reddit(count=4,avg=65.2) x(count=2,avg=78.5) arxiv(count=1,avg=89.0)\n- top_signal: "On-device LLM" (score=91, source=arxiv)\n`

  const { kept } = rotateEntries(content, cutoff)
  assertEquals(kept.includes('signal_count: 7'), true)
  assertEquals(kept.includes('reddit(count=4'), true)
  assertEquals(kept.includes('top_signal:'), true)
})

Deno.test('formatEntry produit le format attendu', () => {
  const entry = formatEntry({
    runAt: '2026-05-01T09:34:22Z',
    signalCount: 7,
    sources: { reddit: { count: 4, avg_score: 65.2 }, arxiv: { count: 1, avg_score: 89 } },
    topSignalTitle: 'Test',
    topSignalScore: 91,
    topSignalSource: 'arxiv',
  })
  assertEquals(entry.includes('### 2026-05-01T09:34:22Z'), true)
  assertEquals(entry.includes('- signal_count: 7'), true)
  assertEquals(entry.includes('reddit(count=4,avg=65.2)'), true)
  assertEquals(entry.includes('arxiv(count=1,avg=89.0)'), true)
  assertEquals(entry.includes('"Test" (score=91, source=arxiv)'), true)
})

Deno.test('slugify normalise les noms de topics', () => {
  assertEquals(slugify('Fine-tuning & PEFT'), 'fine-tuning-peft')
  assertEquals(slugify('LLM / Foundation Models'), 'llm-foundation-models')
  assertEquals(slugify('Référentiel'), 'referentiel')
})
