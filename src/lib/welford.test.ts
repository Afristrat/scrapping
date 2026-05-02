import { describe, expect, it } from 'vitest'
import { welfordUpdate, computeZScore, computeTrend } from './welford'

describe('welfordUpdate', () => {
  it('initialise correctement avec un premier échantillon', () => {
    const result = welfordUpdate({ mean: 0, m2: 0, n: 0 }, 5)
    expect(result.n).toBe(1)
    expect(result.mean).toBe(5)
    expect(result.m2).toBe(0)
  })

  it('met à jour la moyenne et m2 sur 3 échantillons (4, 8, 6)', () => {
    let state = { mean: 0, m2: 0, n: 0 }
    state = welfordUpdate(state, 4)
    state = welfordUpdate(state, 8)
    state = welfordUpdate(state, 6)
    expect(state.n).toBe(3)
    expect(state.mean).toBeCloseTo(6, 5)
    expect(state.m2 / (state.n - 1)).toBeCloseTo(4, 5)
  })
})

describe('computeZScore', () => {
  it('retourne 0 si std = 0', () => {
    expect(computeZScore(10, { mean: 10, m2: 0, n: 5 })).toBe(0)
  })

  it('calcule un z-score positif sur un pic', () => {
    const state = { mean: 2, m2: 9, n: 10 }
    expect(computeZScore(5, state)).toBeCloseTo(3, 1)
  })
})

describe('computeTrend', () => {
  it('retourne warming_up si n < 10', () => {
    expect(computeTrend(5, { mean: 2, m2: 4, n: 9 })).toBe('warming_up')
  })

  it('retourne emerging si z > 2', () => {
    expect(computeTrend(5, { mean: 2, m2: 9, n: 10 })).toBe('emerging')
  })

  it('retourne declining si z < -2', () => {
    expect(computeTrend(2, { mean: 5, m2: 9, n: 10 })).toBe('declining')
  })

  it('retourne stable si |z| ≤ 1', () => {
    expect(computeTrend(5, { mean: 5, m2: 9, n: 10 })).toBe('stable')
  })
})
