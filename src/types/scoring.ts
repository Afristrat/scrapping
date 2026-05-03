export interface ScoreConsensus {
  consensus: number | null
  variance: number | null
  models: string[]
  agreement: 'high' | 'medium' | 'low' | null
}
