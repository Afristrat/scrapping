import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('devrait fusionner des classes Tailwind sans conflit', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('devrait ignorer les valeurs falsy', () => {
    expect(cn('text-sm', false, null, undefined, 'font-bold')).toBe('text-sm font-bold')
  })
})
