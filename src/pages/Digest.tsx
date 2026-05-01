import { useMemo, useState } from 'react'
import { Sparkles, RefreshCw, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  useDigests,
  useGenerateDigest,
  useDeleteDigest,
  type DigestRow,
} from '@/hooks/useDigest'

const WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 24, label: '24 h' },
  { value: 24 * 7, label: '7 j' },
  { value: 24 * 30, label: '30 j' },
]

export default function Digest(): React.ReactElement {
  const [windowHours, setWindowHours] = useState<number>(24)
  const [minScoreRange, setMinScoreRange] = useState<number[]>([60])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const digestsQuery = useDigests()
  const generate = useGenerateDigest()
  const remove = useDeleteDigest()

  const digests = useMemo<DigestRow[]>(
    () => digestsQuery.data ?? [],
    [digestsQuery.data],
  )
  const selected = useMemo<DigestRow | null>(() => {
    if (!digests.length) return null
    if (selectedId) {
      const found = digests.find((d) => d.id === selectedId)
      if (found) return found
    }
    return digests[0] ?? null
  }, [digests, selectedId])

  const minScore = minScoreRange[0] ?? 60

  const handleGenerate = (): void => {
    generate.mutate(
      { window_hours: windowHours, min_score: minScore },
      {
        onSuccess: (resp) => {
          setSelectedId(resp.digest_id)
        },
      },
    )
  }

  const handleDelete = (id: string): void => {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce brief ?')) return
    remove.mutate(id, {
      onSuccess: () => {
        if (selectedId === id) setSelectedId(null)
      },
    })
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Brief quotidien — synthèse 80/20
        </h2>
        <p className="text-sm text-slate-500">
          Agrégation des signaux scorés en un brief markdown structuré, dans la langue
          configurée dans Settings.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-6 py-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="window-hours"
              className="text-xs font-medium tracking-wide text-slate-600 uppercase"
            >
              Fenêtre
            </label>
            <Select
              value={String(windowHours)}
              onValueChange={(v) => setWindowHours(Number(v))}
            >
              <SelectTrigger id="window-hours" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <label
              htmlFor="min-score"
              className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-600 uppercase"
            >
              <span>Score minimum</span>
              <span className="font-mono normal-case text-slate-900">{minScore}</span>
            </label>
            <Slider
              id="min-score"
              min={0}
              max={100}
              step={5}
              value={minScoreRange}
              onValueChange={setMinScoreRange}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generate.isPending}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {generate.isPending ? 'Génération…' : 'Générer maintenant'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Historique ({digests.length})
          </h3>

          {digestsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : digests.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucun brief généré pour l&apos;instant.
            </p>
          ) : (
            <ul className="space-y-2">
              {digests.map((d) => {
                const isActive = selected?.id === d.id
                return (
                  <li
                    key={d.id}
                    className={`group rounded-md border transition ${
                      isActive
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1 px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        className="flex-1 rounded px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                        aria-pressed={isActive}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            {new Date(d.generated_at).toLocaleString('fr-FR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                          <Badge variant="outline" className="uppercase">
                            {d.language}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {d.signal_count} signaux · {d.window_hours}h · score ≥{' '}
                          {d.min_score}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        aria-label="Supprimer ce brief"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section>
          {digestsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !selected ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Sparkles className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Aucun brief disponible.
                  <br />
                  Lance une génération avec les paramètres ci-dessus.
                </p>
              </CardContent>
            </Card>
          ) : (
            <article className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="prose prose-sm prose-slate max-w-none">
                <ReactMarkdown
                  components={{
                    a: ({ href, children, ...rest }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                        {...rest}
                      >
                        {children}
                      </a>
                    ),
                    h1: ({ children }) => (
                      <h2 className="mt-4 mb-3 text-lg font-bold text-slate-900">
                        {children}
                      </h2>
                    ),
                    h2: ({ children }) => (
                      <h3 className="mt-6 mb-2 text-base font-semibold text-slate-900">
                        {children}
                      </h3>
                    ),
                    h3: ({ children }) => (
                      <h4 className="mt-4 mb-2 text-sm font-semibold text-slate-900">
                        {children}
                      </h4>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-3 ml-5 list-disc space-y-2 text-sm text-slate-700">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-3 ml-5 list-decimal space-y-2 text-sm text-slate-700">
                        {children}
                      </ol>
                    ),
                    p: ({ children }) => (
                      <p className="my-2 text-sm leading-relaxed text-slate-700">
                        {children}
                      </p>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                        {children}
                      </code>
                    ),
                  }}
                >
                  {selected.content}
                </ReactMarkdown>
              </div>

              <footer className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>{selected.signal_count} signaux analysés</span>
                <span>·</span>
                <span>fenêtre {selected.window_hours} h</span>
                <span>·</span>
                <span>score ≥ {selected.min_score}</span>
                <span>·</span>
                <span className="font-mono">{selected.model_used ?? '—'}</span>
                <span>·</span>
                <span>${Number(selected.cost ?? 0).toFixed(5)}</span>
                <span>·</span>
                <span>
                  {new Date(selected.generated_at).toLocaleString('fr-FR')}
                </span>
                <span>·</span>
                <Badge variant="outline" className="uppercase">
                  {selected.language}
                </Badge>
              </footer>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}
