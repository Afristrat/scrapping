import { Check, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CURRENCIES, useCurrencyStore } from '@/stores/currency'

/**
 * Sélecteur de devise affiché dans les headers (marketing + dashboard).
 * Persist le choix dans le store Zustand `kairos-currency` (localStorage).
 *
 * - Toutes les conversions sont purement présentationnelles : Stripe charge
 *   toujours en EUR.
 * - Les emojis drapeau sont des séquences Unicode ; certains environnements
 *   Windows les rendent en monochrome — c'est attendu et acceptable.
 */
export function CurrencyPicker(): React.ReactElement | null {
  const currency = useCurrencyStore((s) => s.currency)
  const setCurrency = useCurrencyStore((s) => s.setCurrency)

  if (CURRENCIES.length === 0) return null

  const current = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0]
  if (!current) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Choisir la devise"
          className="text-on-surface-variant hover:text-primary gap-1.5"
        >
          <span aria-hidden="true">{current.flag}</span>
          <span className="text-sm font-medium">{current.code}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Devise d'affichage</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CURRENCIES.map((c) => (
          <DropdownMenuItem
            key={c.code}
            onSelect={() => setCurrency(c.code)}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span aria-hidden="true">{c.flag}</span>
              <span className="text-sm">
                <span className="font-medium">{c.code}</span>
                <span className="text-muted-foreground"> — {c.name}</span>
              </span>
            </div>
            {c.code === currency ? (
              <Check className="text-primary h-4 w-4 shrink-0" aria-label="sélectionnée" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
