import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SOURCE_META } from '@/lib/source-meta'
import { cn } from '@/lib/utils'
import type { SignalRow } from '@/hooks/useSignals'

interface Props {
  signal: SignalRow | null
  onClose: () => void
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (score >= 40) return 'bg-orange-100 text-orange-800 border-orange-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function extractContent(signal: SignalRow): string | null {
  const p = signal.raw_payload as Record<string, unknown> | null
  if (!p) return null
  const content =
    (p.summary as string) ??
    (p.selftext as string) ??
    (p.text as string) ??
    (p.fullText as string) ??
    null
  if (!content || typeof content !== 'string') return null
  return content.replace(/\s+/g, ' ').trim()
}

function extractMeta(signal: SignalRow): Array<{ label: string; value: string }> {
  const p = signal.raw_payload as Record<string, unknown> | null
  if (!p) return []
  const meta: Array<{ label: string; value: string }> = []
  if (p.authors && Array.isArray(p.authors))
    meta.push({ label: 'Auteurs', value: (p.authors as string[]).slice(0, 5).join(', ') })
  if (p.author && typeof p.author === 'string')
    meta.push({ label: 'Auteur', value: p.author as string })
  if (p.published) meta.push({ label: 'Publié', value: String(p.published).slice(0, 10) })
  if (p.created_utc) {
    const ts = Number(p.created_utc) * 1000
    meta.push({ label: 'Publié', value: new Date(ts).toLocaleDateString('fr-FR') })
  }
  if (p.subreddit) meta.push({ label: 'Subreddit', value: `r/${p.subreddit}` })
  if (p.score && typeof p.score === 'number')
    meta.push({ label: 'Score Reddit', value: String(p.score) })
  if (p.categories && Array.isArray(p.categories))
    meta.push({ label: 'Catégories', value: (p.categories as string[]).join(', ') })
  return meta
}

export function SignalModal({ signal, onClose }: Props) {
  const [debugOpen, setDebugOpen] = useState(false)

  return (
    <Dialog open={signal != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        {signal && (
          <>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <Badge className={SOURCE_META[signal.source].badgeClass}>
                  {SOURCE_META[signal.source].label}
                </Badge>
                {signal.score != null && (
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 font-mono text-sm font-medium',
                      scoreColor(Number(signal.score)),
                    )}
                  >
                    {Math.round(Number(signal.score))}/100
                  </span>
                )}
              </div>
              <DialogTitle className="text-left text-base leading-snug">
                {signal.title ?? '(sans titre)'}
              </DialogTitle>
              {signal.url && (
                <DialogDescription>
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Ouvrir la source originale <ExternalLink className="h-3 w-3" />
                  </a>
                </DialogDescription>
              )}
            </DialogHeader>

            {signal.reasoning && (
              <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Pourquoi c'est pertinent
                </h3>
                <p className="text-sm leading-relaxed text-slate-800">{signal.reasoning}</p>
              </section>
            )}

            {extractContent(signal) && (
              <section>
                <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Extrait du contenu
                </h3>
                <p className="text-sm leading-relaxed text-slate-700">
                  {extractContent(signal)?.slice(0, 1200)}
                  {(extractContent(signal)?.length ?? 0) > 1200 && '…'}
                </p>
              </section>
            )}

            {extractMeta(signal).length > 0 && (
              <section className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {extractMeta(signal).map((m) => (
                  <div key={m.label}>
                    <span className="text-xs tracking-wide text-slate-500 uppercase">
                      {m.label}
                    </span>
                    <p className="text-slate-700">{m.value}</p>
                  </div>
                ))}
              </section>
            )}

            <section className="border-t border-slate-200 pt-3 text-xs text-slate-400">
              Scoré par {signal.model_used ?? '—'} ·{' '}
              {signal.cost != null ? `$${Number(signal.cost).toFixed(5)}` : '—'}
            </section>

            <section>
              <button
                type="button"
                onClick={() => setDebugOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                {debugOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Détails techniques (JSON brut)
              </button>
              {debugOpen && (
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                  {JSON.stringify(signal.raw_payload, null, 2)}
                </pre>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
