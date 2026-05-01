import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TopicRow {
  id: string
  name: string
  slug: string
  is_seed: boolean
  is_emerging: boolean
  trend: 'warming_up' | 'emerging' | 'stable' | 'declining'
  baseline_mean: number
  baseline_n: number
  last_seen_at: string
  total_signal_count: number
}

export interface TopicRunRow {
  id: string
  topic_id: string
  run_at: string
  signal_count: number
  sources: Record<string, { count: number; avg_score: number }>
  top_signal_title: string | null
  top_signal_score: number | null
}

export interface TopicWithRuns extends TopicRow {
  runs: TopicRunRow[]
  z_score: number
}

function computeZ(latestCount: number, mean: number, m2: number, n: number): number {
  if (n < 2) return 0
  const variance = m2 / (n - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  return (latestCount - mean) / std
}

export function useTopics(opts?: { runsLimit?: number }) {
  const runsLimit = opts?.runsLimit ?? 30
  return useQuery<TopicWithRuns[]>({
    queryKey: ['topics', { runsLimit }],
    queryFn: async () => {
      const { data: topics, error: tErr } = await supabase
        .from('topics')
        .select('*')
        .order('last_seen_at', { ascending: false })
      if (tErr) throw tErr
      if (!topics || topics.length === 0) return []

      const { data: runs, error: rErr } = await supabase
        .from('topic_runs')
        .select('*')
        .in('topic_id', topics.map((t: { id: string }) => t.id))
        .order('run_at', { ascending: false })
      if (rErr) throw rErr

      const runsByTopic = new Map<string, TopicRunRow[]>()
      for (const r of (runs ?? []) as unknown as TopicRunRow[]) {
        const list = runsByTopic.get(r.topic_id) ?? []
        if (list.length < runsLimit) list.push(r)
        runsByTopic.set(r.topic_id, list)
      }

      return (topics as Array<TopicRow & { baseline_m2: number }>).map((t) => {
        const topicRuns = runsByTopic.get(t.id) ?? []
        const latestCount = topicRuns[0]?.signal_count ?? 0
        return {
          ...t,
          runs: topicRuns,
          z_score: computeZ(latestCount, t.baseline_mean, t.baseline_m2, t.baseline_n),
        }
      })
    },
  })
}
