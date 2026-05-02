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

// Material You — palette Kairos (cf. Wave 7.3 design tokens)
const TASK_COLORS: Record<LLMTask, string> = {
  scoring: '#0051d5', // secondary
  scraping: '#006948', // primary
  monitoring: '#9b3e3b', // tertiary
}
const TASKS: LLMTask[] = ['scoring', 'scraping', 'monitoring']

interface Props {
  data: CostByDayRow[] | undefined
}

export function CostChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant rounded-xl border border-dashed p-12 text-center text-sm">
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
    <div className="border-outline-variant bg-surface-container-lowest rounded-xl border p-6 shadow-md">
      <h3 className="text-on-surface mb-4 text-lg font-semibold">Coût par jour &amp; tâche</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={pivoted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#bccac0" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#3d4a42' }} stroke="#bccac0" />
          <YAxis
            tick={{ fontSize: 11, fill: '#3d4a42' }}
            stroke="#bccac0"
            tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
          />
          <Tooltip
            formatter={(v) => `$${Number(v).toFixed(5)}`}
            contentStyle={{
              backgroundColor: '#233144',
              border: 'none',
              borderRadius: '8px',
              color: '#eaf1ff',
            }}
            labelStyle={{ color: '#eaf1ff' }}
            itemStyle={{ color: '#eaf1ff' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: '#3d4a42' }} />
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
