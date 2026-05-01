import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CostByDayRow, LLMTask } from '@/hooks/useLLMCosts'

const TASK_COLORS: Record<LLMTask, string> = {
  scoring: '#3b82f6',
  scraping: '#10b981',
  monitoring: '#f59e0b',
}
const TASKS: LLMTask[] = ['scoring', 'scraping', 'monitoring']

interface Props {
  data: CostByDayRow[] | undefined
}

export function CostChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-sm text-slate-500">
        Pas encore de coûts — lance un pipeline.
      </div>
    )
  }

  const dayMap = new Map<string, Record<string, number | string>>()
  for (const r of data) {
    const row = dayMap.get(r.day) ?? { day: r.day, scoring: 0, scraping: 0, monitoring: 0 }
    row[r.task] = Number(r.total_cost)
    dayMap.set(r.day, row)
  }
  const pivoted = [...dayMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-medium text-slate-900">Coût par jour &amp; tâche</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={pivoted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(3)}`} />
          <Tooltip formatter={(v) => `$${Number(v).toFixed(5)}`} />
          <Legend />
          {TASKS.map((t) => (
            <Line
              key={t}
              type="monotone"
              dataKey={t}
              stroke={TASK_COLORS[t]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
