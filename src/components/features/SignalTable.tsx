import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SOURCE_META } from '@/lib/source-meta'
import { cn } from '@/lib/utils'
import type { SignalRow } from '@/hooks/useSignals'

interface Props {
  rows: SignalRow[] | undefined
  isLoading: boolean
  onRowClick: (row: SignalRow) => void
}

export function SignalTable({ rows, isLoading, onRowClick }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
        <p className="text-base font-medium text-slate-900">Aucun signal</p>
        <p className="text-sm text-slate-500">Clique « Run pipeline » pour ingérer les sources.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="w-20 px-4 py-2.5">Score</th>
            <th className="w-24 px-4 py-2.5">Source</th>
            <th className="px-4 py-2.5">Titre</th>
            <th className="w-32 px-4 py-2.5">Date contenu</th>
            <th className="w-32 px-4 py-2.5">Scrapé</th>
            <th className="w-40 px-4 py-2.5">Modèle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const { label, badgeClass } = SOURCE_META[r.source]
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick(r)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  {r.score != null ? (
                    <span
                      className={cn(
                        'inline-flex h-7 w-12 items-center justify-center rounded font-mono text-xs font-medium',
                        r.score >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.score >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : r.score === 0 && r.reasoning === '(LLM batch missed this signal)'
                              ? 'bg-orange-100 text-orange-800 ring-1 ring-orange-200'
                              : 'bg-slate-100 text-slate-600',
                      )}
                      title={
                        r.score === 0 && r.reasoning === '(LLM batch missed this signal)'
                          ? 'Le batch LLM a oublié ce signal. À re-scorer.'
                          : (r.reasoning ?? undefined)
                      }
                    >
                      {r.score === 0 && r.reasoning === '(LLM batch missed this signal)'
                        ? '⟲'
                        : Math.round(r.score)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400" title="Pas encore scoré">
                      —
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn('font-normal', badgeClass)}>{label}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-2 text-slate-900">{r.title ?? '(sans titre)'}</span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-slate-400 hover:text-slate-600"
                        aria-label="Ouvrir la source"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.signal_date ? (
                    <span title={new Date(r.signal_date).toLocaleString('fr-FR')}>
                      {formatDistanceToNow(new Date(r.signal_date), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(r.scraped_at), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.model_used ?? <span className="text-slate-400">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
