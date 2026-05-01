import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type LLMTask = 'scraping' | 'scoring' | 'monitoring'

export interface CostRow {
  task: LLMTask
  model: string
  prompt_tokens: number
  completion_tokens: number
  cost: number
  ts: string
}

export interface CostByDayRow {
  day: string
  task: LLMTask
  total_cost: number
}

export interface BreakdownRow {
  model: string
  task: LLMTask
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost: number
}

export function useCostsByDay(days = 7) {
  return useQuery<CostByDayRow[]>({
    queryKey: ['costs_by_day', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('costs_by_day', { days })
      if (error) throw error
      return (data ?? []) as CostByDayRow[]
    },
  })
}

export function useLLMCostsRecent(days = 14) {
  return useQuery<CostRow[]>({
    queryKey: ['llm_costs', 'recent', days],
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('llm_costs')
        .select('task, model, prompt_tokens, completion_tokens, cost, ts')
        .gte('ts', sinceIso)
        .order('ts', { ascending: false })
      if (error) throw error
      return (data ?? []) as CostRow[]
    },
  })
}

export function computeTotals(rows: CostRow[]): {
  total7d: number
  previous7d: number
  delta: number
} {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86_400_000
  const fourteenDaysAgo = now - 14 * 86_400_000
  let total7d = 0
  let previous7d = 0
  for (const r of rows) {
    const t = new Date(r.ts).getTime()
    if (t >= sevenDaysAgo) total7d += Number(r.cost)
    else if (t >= fourteenDaysAgo) previous7d += Number(r.cost)
  }
  const delta = previous7d === 0 ? 0 : ((total7d - previous7d) / previous7d) * 100
  return { total7d, previous7d, delta }
}

export function computeBreakdown(rows: CostRow[], lastDays?: number): BreakdownRow[] {
  if (lastDays != null) {
    const sinceMs = Date.now() - lastDays * 86_400_000
    return computeBreakdownRows(rows.filter((r) => new Date(r.ts).getTime() >= sinceMs))
  }
  return computeBreakdownRows(rows)
}

function computeBreakdownRows(rows: CostRow[]): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>()
  for (const r of rows) {
    const key = `${r.model}__${r.task}`
    const existing = map.get(key)
    if (existing) {
      existing.calls++
      existing.prompt_tokens += r.prompt_tokens
      existing.completion_tokens += r.completion_tokens
      existing.cost += Number(r.cost)
    } else {
      map.set(key, {
        model: r.model,
        task: r.task,
        calls: 1,
        prompt_tokens: r.prompt_tokens,
        completion_tokens: r.completion_tokens,
        cost: Number(r.cost),
      })
    }
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}
