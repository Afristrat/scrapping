import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ConfidenceBadge } from './ConfidenceBadge'
import { detectConfidenceLevel } from '@/lib/confidence-levels'

describe('ConfidenceBadge', () => {
  it('rend le label FR pour Quasi-certain', () => {
    render(<ConfidenceBadge level="almost-certain" language="fr" />)
    expect(screen.getByText('Quasi-certain')).toBeInTheDocument()
  })

  it('rend le label EN pour very-likely', () => {
    render(<ConfidenceBadge level="very-likely" language="en" />)
    expect(screen.getByText('Very likely')).toBeInTheDocument()
  })

  it('rend le label ES pour speculative', () => {
    render(<ConfidenceBadge level="speculative" language="es" />)
    expect(screen.getByText('Especulativo')).toBeInTheDocument()
  })

  it('expose data-confidence pour ciblage CSS', () => {
    const { container } = render(<ConfidenceBadge level="likely" />)
    expect(container.querySelector('[data-confidence="likely"]')).toBeTruthy()
  })

  it('inclut une description en title pour accessibilité', () => {
    render(<ConfidenceBadge level="possible" language="fr" />)
    const span = screen.getByText('Possible').closest('span')
    expect(span?.title).toMatch(/35-55/)
  })
})

describe('detectConfidenceLevel', () => {
  const cases: Array<[string, ReturnType<typeof detectConfidenceLevel>]> = [
    ['[Quasi-certain]', 'almost-certain'],
    ['[Almost certain]', 'almost-certain'],
    ['[Casi seguro]', 'almost-certain'],
    ['[Très probable]', 'very-likely'],
    ['[Tres probable]', 'very-likely'],
    ['[Very likely]', 'very-likely'],
    ['[Muy probable]', 'very-likely'],
    ['[Probable]', 'likely'],
    ['[Likely]', 'likely'],
    ['[Possible]', 'possible'],
    ['[Posible]', 'possible'],
    ['[Spéculatif]', 'speculative'],
    ['[Speculatif]', 'speculative'],
    ['[Speculative]', 'speculative'],
    ['[Especulativo]', 'speculative'],
    ['  [QUASI-CERTAIN]  ', 'almost-certain'],
    ['[unknown]', null],
    ['random text', null],
  ]
  it.each(cases)('détecte %s → %s', (input, expected) => {
    expect(detectConfidenceLevel(input)).toBe(expected)
  })
})
