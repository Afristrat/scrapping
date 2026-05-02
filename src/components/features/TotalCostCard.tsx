import { TrendingDown, TrendingUp, Minus, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  total7d: number
  delta: number
}

export function TotalCostCard({ total7d, delta }: Props) {
  const Icon = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus
  const deltaColor =
    delta > 1 ? 'text-tertiary' : delta < -1 ? 'text-primary' : 'text-on-surface-variant'

  return (
    <div className="border-outline-variant bg-surface-container-lowest relative overflow-hidden rounded-xl border p-6 shadow-md">
      <div className="text-primary absolute top-0 right-0 p-4 opacity-10">
        <Wallet className="h-16 w-16" />
      </div>
      <p className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
        Coût total · 7 derniers jours
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-on-surface text-4xl font-bold tracking-tight">${total7d.toFixed(4)}</p>
        <p className={cn('flex items-center gap-1 text-sm font-medium', deltaColor)}>
          <Icon className="h-4 w-4" />
          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
          <span className="text-on-surface-variant font-normal">vs 7j précédents</span>
        </p>
      </div>
    </div>
  )
}
