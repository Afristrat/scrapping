import { describe, expect, it } from 'vitest'
import { detectVariables, renderPromptPreview, todayIso } from './promptPreview'

describe('renderPromptPreview', () => {
  it('substitue {{date}} avec la date du jour', () => {
    const out = renderPromptPreview('Date : {{date}}', {
      language: 'fr',
      date: '2026-05-01',
      signalsCount: null,
    })
    expect(out).toBe('Date : 2026-05-01')
  })

  it('substitue {{language}} avec la valeur du contexte', () => {
    const out = renderPromptPreview('Lang : {{language}}', {
      language: 'en',
      date: '2026-05-01',
      signalsCount: null,
    })
    expect(out).toBe('Lang : en')
  })

  it('remplace {{signals_block}} par un placeholder explicite (avec count si fourni)', () => {
    const sansCount = renderPromptPreview('{{signals_block}}', {
      language: 'fr',
      date: '2026-05-01',
      signalsCount: null,
    })
    expect(sansCount).toContain('N signaux seront injectes')

    const avecCount = renderPromptPreview('{{signals_block}}', {
      language: 'fr',
      date: '2026-05-01',
      signalsCount: 42,
    })
    expect(avecCount).toContain('42 signaux seront injectes')
  })

  it('substitue {{run:reddit}} avec un placeholder mentionnant le kind', () => {
    const out = renderPromptPreview('{{run:reddit}}', {
      language: 'fr',
      date: '2026-05-01',
    })
    expect(out).toContain('reddit')
    expect(out).toContain('injecte par')
  })

  it('substitue plusieurs variables en une passe', () => {
    const tpl = 'On {{date}} ({{language}}) : {{signals_block}}'
    const out = renderPromptPreview(tpl, {
      language: 'fr',
      date: '2026-05-01',
      signalsCount: 3,
    })
    expect(out).toContain('On 2026-05-01 (fr)')
    expect(out).toContain('3 signaux')
  })
})

describe('detectVariables', () => {
  it('detecte les variables connues comme known=true', () => {
    const vars = detectVariables('System {{date}}', 'User {{language}} {{signals_block}}')
    const names = vars.map((v) => v.name)
    expect(names).toEqual(expect.arrayContaining(['date', 'language', 'signals_block']))
    expect(vars.find((v) => v.name === 'date')?.known).toBe(true)
    expect(vars.find((v) => v.name === 'language')?.known).toBe(true)
  })

  it('detecte run:<kind> comme known=true', () => {
    const vars = detectVariables('', '{{run:reddit}} {{run:arxiv}}')
    expect(vars.find((v) => v.name === 'run:reddit')?.known).toBe(true)
    expect(vars.find((v) => v.name === 'run:arxiv')?.known).toBe(true)
  })

  it('marque les variables inconnues comme known=false', () => {
    const vars = detectVariables('', '{{foo}} {{bar_baz}}')
    expect(vars.find((v) => v.name === 'foo')?.known).toBe(false)
    expect(vars.find((v) => v.name === 'bar_baz')?.known).toBe(false)
  })

  it('deduplique les variables apparaissant plusieurs fois', () => {
    const vars = detectVariables('{{date}}', '{{date}} {{date}}')
    expect(vars.filter((v) => v.name === 'date')).toHaveLength(1)
  })
})

describe('todayIso', () => {
  it('retourne une date au format YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
