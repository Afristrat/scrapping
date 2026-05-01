import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import type { CostRow } from '@/hooks/useLLMCosts'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TASK_CLASS: Record<string, string> = {
  scraping: 'bg-emerald-100 text-emerald-800',
  scoring: 'bg-blue-100 text-blue-800',
  monitoring: 'bg-amber-100 text-amber-800',
}

interface Props {
  rows: CostRow[] | undefined
  isLoading: boolean
}

export function LLMCostsTable({ rows, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Pas de donnees de couts OpenRouter.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="w-32 px-4 py-2.5">Quand</th>
            <th className="w-24 px-4 py-2.5">Tache</th>
            <th className="px-4 py-2.5">Modele</th>
            <th className="px-4 py-2.5 text-right">Tokens in</th>
            <th className="px-4 py-2.5 text-right">Tokens out</th>
            <th className="px-4 py-2.5 text-right">Cout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={`${r.ts}-${i}`} className="align-top">
              <td className="px-4 py-3 text-xs text-slate-500">
                {formatDistanceToNow(new Date(r.ts), { addSuffix: true, locale: fr })}
              </td>
              <td className="px-4 py-3">
                <Badge className={cn('font-normal', TASK_CLASS[r.task] ?? 'bg-slate-100')}>
                  {r.task}
                </Badge>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.model}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">
                {r.prompt_tokens.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">
                {r.completion_tokens.toLocaleString()}
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
