import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import type { CostRow } from '@/hooks/useLLMCosts'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TASK_CLASS: Record<string, string> = {
  scraping: 'bg-primary-fixed text-on-primary-fixed',
  scoring: 'bg-secondary-fixed text-on-secondary-fixed',
  monitoring: 'bg-tertiary-fixed text-on-tertiary-fixed',
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
      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant rounded-xl border border-dashed p-8 text-center text-sm">
        Pas de données de coûts OpenRouter.
      </div>
    )
  }

  return (
    <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-md">
      <table className="w-full text-sm">
        <thead className="bg-surface-container text-on-surface-variant border-outline-variant border-b text-left text-xs font-semibold tracking-[0.05em] uppercase">
          <tr>
            <th className="w-32 px-4 py-3">Quand</th>
            <th className="w-24 px-4 py-3">Tâche</th>
            <th className="px-4 py-3">Modèle</th>
            <th className="px-4 py-3 text-right">Tokens in</th>
            <th className="px-4 py-3 text-right">Tokens out</th>
            <th className="px-4 py-3 text-right">Coût</th>
          </tr>
        </thead>
        <tbody className="divide-outline-variant/40 divide-y">
          {rows.map((r, i) => (
            <tr key={`${r.ts}-${i}`} className="even:bg-surface-container-low/40 align-top">
              <td className="text-on-surface-variant px-4 py-3 text-xs">
                {formatDistanceToNow(new Date(r.ts), { addSuffix: true, locale: fr })}
              </td>
              <td className="px-4 py-3">
                <Badge
                  className={cn(
                    'rounded-full border-transparent px-2 py-0.5 text-[10px] font-semibold',
                    TASK_CLASS[r.task] ?? 'bg-surface-variant text-on-surface-variant',
                  )}
                >
                  {r.task}
                </Badge>
              </td>
              <td className="text-on-surface px-4 py-3 font-mono text-xs">{r.model}</td>
              <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                {r.prompt_tokens.toLocaleString()}
              </td>
              <td className="text-on-surface px-4 py-3 text-right font-mono text-xs">
                {r.completion_tokens.toLocaleString()}
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
