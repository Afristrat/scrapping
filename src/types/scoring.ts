export interface ScoreRunEntry {
  model: string
  provider: string
  score: number
  reasoning: string | null
}

export interface ScoreConsensus {
  consensus: number | null
  variance: number | null
  models: string[]
  agreement: 'high' | 'medium' | 'low' | null
  runs: ScoreRunEntry[]
}
