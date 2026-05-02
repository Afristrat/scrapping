import { Building2, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrganizations } from '@/hooks/useOrganizations'
import { useOrgStore } from '@/stores/org'

/**
 * Sélecteur d'organisation affiché dans le `BrandedHeader`.
 *
 * - Affiche un skeleton pendant le chargement initial.
 * - Si l'utilisateur n'a aucune organisation, ne rend rien (null).
 * - Si l'utilisateur a une seule organisation, affiche son nom (lecture seule).
 * - Si l'utilisateur a plusieurs organisations, affiche un dropdown qui appelle
 *   `setCurrentOrgId` au switch. Toutes les queries TanStack se réinvalident
 *   automatiquement grâce aux queryKeys indexés sur `orgId` (cf. `useSignals`,
 *   `useScores`, etc.).
 */
export function OrgSelector(): React.ReactElement | null {
  // Bootstrap réactif : déjà appelé dans `AppLayout`, mais on s'assure que la
  // query est montée si le composant est utilisé hors de ce layout.
  useOrganizations()

  const orgs = useOrgStore((s) => s.organizations)
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)
  const isLoading = useOrgStore((s) => s.isLoading)

  if (isLoading && orgs.length === 0) {
    return <Skeleton className="h-8 w-[120px]" data-testid="org-selector-skeleton" />
  }

  if (orgs.length === 0) {
    return null
  }

  if (orgs.length === 1) {
    const only = orgs[0]
    if (!only) return null
    return (
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <Building2 className="h-4 w-4 text-slate-400" />
        <span className="max-w-[180px] truncate">{only.name}</span>
      </div>
    )
  }

  const current = orgs.find((o) => o.id === currentOrgId) ?? orgs[0]
  if (!current) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Changer d'organisation"
          className="max-w-[240px] gap-2"
        >
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm">{current.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Vos organisations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => setCurrentOrgId(o.id)}
            className="flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{o.name}</div>
              <div className="text-[11px] text-slate-500 capitalize">
                {o.segment} · {o.plan} · {o.role}
              </div>
            </div>
            {o.id === currentOrgId && (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="sélectionnée" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
