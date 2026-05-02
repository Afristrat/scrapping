export interface WelfordState {
  mean: number
  m2: number
  n: number
}

export type Trend = 'warming_up' | 'emerging' | 'stable' | 'declining'

export function welfordUpdate(state: WelfordState, value: number): WelfordState {
  const n = state.n + 1
  const delta = value - state.mean
  const mean = state.mean + delta / n
  const delta2 = value - mean
  const m2 = state.m2 + delta * delta2
  return { mean, m2, n }
}

export function computeZScore(value: number, state: WelfordState): number {
  if (state.n < 2) return 0
  const variance = state.m2 / (state.n - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  return (value - state.mean) / std
}

export function computeTrend(value: number, state: WelfordState): Trend {
  if (state.n < 10) return 'warming_up'
  const z = computeZScore(value, state)
  if (z > 2) return 'emerging'
  if (z < -2) return 'declining'
  return 'stable'
}
