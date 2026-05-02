import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { TopicRunRow } from '@/hooks/useTopics'

interface Props {
  runs: TopicRunRow[]
}

const SOURCES: Array<{ key: string; label: string; color: string }> = [
  { key: 'reddit', label: 'REDDIT', color: '#f97316' },
  { key: 'x', label: 'X', color: '#6366f1' },
  { key: 'arxiv', label: 'ARXIV', color: '#06b6d4' },
]

export function TopicSparklines({ runs }: Props) {
  const ordered = [...runs].reverse()

  return (
    <div className="grid grid-cols-3 gap-3">
      {SOURCES.map((src) => {
        const data = ordered.map((r) => ({
          run_at: r.run_at,
          count: r.sources?.[src.key]?.count ?? 0,
        }))
        return (
          <div key={src.key}>
            <div className="text-[10px] font-semibold mb-1" style={{ color: src.color }}>
              {src.label}
            </div>
            <div className="h-6 bg-muted/40 rounded">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={src.color}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })}
    </div>
  )
}
