import type { BreakdownRow } from '@/hooks/useLLMCosts'

interface Props {
  rows: BreakdownRow[]
}

export function CostBreakdown({ rows }: Props) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2.5">Modèle</th>
            <th className="px-4 py-2.5">Tâche</th>
            <th className="px-4 py-2.5 text-right">Calls</th>
            <th className="px-4 py-2.5 text-right">Tokens (in/out)</th>
            <th className="px-4 py-2.5 text-right">Coût</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.model}-${r.task}`}>
              <td className="px-4 py-3 font-mono text-xs">{r.model}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{r.task}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{r.calls}</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                {r.prompt_tokens.toLocaleString()} / {r.completion_tokens.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                ${r.cost.toFixed(5)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
