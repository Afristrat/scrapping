import type { BreakdownRow } from '@/hooks/useLLMCosts'

interface Props {
  rows: BreakdownRow[]
}

export function CostBreakdown({ rows }: Props) {
  if (rows.length === 0) return null
  return (
    <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-md">
      <table className="w-full text-sm">
        <thead className="bg-surface-container text-on-surface-variant border-outline-variant border-b text-left text-xs font-semibold tracking-[0.05em] uppercase">
          <tr>
            <th className="px-4 py-3">Modèle</th>
            <th className="px-4 py-3">Tâche</th>
            <th className="px-4 py-3 text-right">Calls</th>
            <th className="px-4 py-3 text-right">Tokens (in/out)</th>
            <th className="px-4 py-3 text-right">Coût</th>
          </tr>
        </thead>
        <tbody className="divide-outline-variant/40 divide-y">
          {rows.map((r) => (
            <tr key={`${r.model}-${r.task}`} className="even:bg-surface-container-low/40">
              <td className="text-on-surface px-4 py-3 font-mono text-xs">{r.model}</td>
              <td className="text-on-surface-variant px-4 py-3 text-xs">{r.task}</td>
              <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">{r.calls}</td>
              <td className="text-on-surface-variant px-4 py-3 text-right font-mono text-xs">
                {r.prompt_tokens.toLocaleString()} / {r.completion_tokens.toLocaleString()}
              </td>
              <td className="text-primary px-4 py-3 text-right font-mono text-xs font-semibold">
                ${r.cost.toFixed(5)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
