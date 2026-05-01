import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  total7d: number
  delta: number
}

export function TotalCostCard({ total7d, delta }: Props) {
  const Icon = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus
  const deltaColor = delta > 1 ? 'text-red-600' : delta < -1 ? 'text-emerald-600' : 'text-slate-500'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <p className="text-xs tracking-wide text-slate-500 uppercase">
        Coût total · 7 derniers jours
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-3xl font-semibold text-slate-900">${total7d.toFixed(4)}</p>
        <p className={cn('flex items-center gap-1 text-sm', deltaColor)}>
          <Icon className="h-4 w-4" />
          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
          <span className="text-slate-400">vs 7j précédents</span>
        </p>
      </div>
    </div>
  )
}
