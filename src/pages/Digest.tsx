import { useMemo, useState } from 'react'
import {
  Sparkles,
  Trash2,
  AlertTriangle,
  ClipboardCopy,
  Mail,
  X as IconX,
  Share2,
  Download,
  FileText,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfidenceBadge } from '@/components/features/ConfidenceBadge'
import { detectConfidenceLevel } from '@/lib/confidence-levels'
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
  DigestError,
  type DigestRow,
} from '@/hooks/useDigest'
import { useFormatCost } from '@/hooks/useFormatCost'
import { copyToClipboard, downloadAsMarkdown, formatDateForFilename } from '@/lib/download-utils'

const WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 24, label: '24 h' },
  { value: 72, label: '72 h' },
  { value: 24 * 7, label: '7 j' },
  { value: 24 * 30, label: '30 j' },
]

const RETRY_FALLBACK_SCORE = 30

/**
 * Wave 10.0 — Custom strong renderer support.
 *
 * Le LLM digest émet des insights sous le format :
 *   **[Quasi-certain] Insight en 1 phrase** [^1][^2]
 *
 * Cette fonction détecte le tag de confiance au début du contenu d'un `<strong>`
 * et retourne le niveau normalisé + le reste du contenu pour rendu côté React.
 */
function extractConfidenceTag(children: React.ReactNode): {
  level: ReturnType<typeof detectConfidenceLevel>
  rest: React.ReactNode
} {
  const arr = Array.isArray(children) ? children : [children]
  if (arr.length === 0 || typeof arr[0] !== 'string') {
    return { level: null, rest: children }
  }
  const match = (arr[0] as string).match(/^\s*\[([^\]]+)\]\s*(.*)$/s)
  if (!match) return { level: null, rest: children }
  const [, rawTag, remaining] = match
  const level = detectConfidenceLevel(`[${rawTag}]`)
  if (!level) return { level: null, rest: children }
  return { level, rest: [remaining, ...arr.slice(1)] }
}

/**
 * Pre-process le markdown LLM pour normaliser les variations de format que
 * le LLM émet malgré le prompt strict :
 *   "[Likely] **insight**"   (tag hors du bold)   → "**[Likely] insight**"
 *   "**[Likely]** insight"   (deux blocs strong)  → "**[Likely] insight**"
 *
 * Sans ce pre-process, le custom strong renderer ne détecte pas le tag et il
 * s affiche en texte brut au lieu d un Badge coloré.
 */
const CONFIDENCE_TAG_REGEX_PART =
  '(Almost certain|Very likely|Likely|Possible|Speculative|Quasi-certain|Très probable|Tres probable|Probable|Spéculatif|Speculatif|Casi seguro|Muy probable|Posible|Especulativo)'

function normalizeConfidenceMarkers(content: string): string {
  let normalized = content.replace(
    new RegExp(`\\[${CONFIDENCE_TAG_REGEX_PART}\\]\\s+\\*\\*([^*]+)\\*\\*`, 'gi'),
    '**[$1] $2**',
  )
  normalized = normalized.replace(
    new RegExp(`\\*\\*\\[${CONFIDENCE_TAG_REGEX_PART}\\]\\*\\*\\s+([^\\n*]+)`, 'gi'),
    '**[$1] $2**',
  )
  return normalized
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extraire le premier H1 ou H2 du contenu Markdown. */
function extractHeadline(content: string, fallback: string): string {
  const match = content.match(/^#{1,2} (.+)$/m)
  return match?.[1]?.trim() ?? fallback
}

/** Construire l'URL de partage d'un digest. */
function buildShareUrl(digestId: string): string {
  return `${window.location.origin}/digest?id=${digestId}`
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function Digest(): React.ReactElement {
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id')

  const [windowHours, setWindowHours] = useState<number>(24)
  const [minScoreRange, setMinScoreRange] = useState<number[]>([60])
  const [selectedId, setSelectedId] = useState<string | null>(urlId)

  const digestsQuery = useDigests()
  const generate = useGenerateDigest()
  const remove = useDeleteDigest()
  const formatCost = useFormatCost()

  const digests = useMemo<DigestRow[]>(() => digestsQuery.data ?? [], [digestsQuery.data])
  const selected = useMemo<DigestRow | null>(() => {
    if (!digests.length) return null
    if (selectedId) {
      const found = digests.find((d) => d.id === selectedId)
      if (found) return found
    }
    return digests[0] ?? null
  }, [digests, selectedId])

  const minScore = minScoreRange[0] ?? 60

  const submitGeneration = (params: { window_hours: number; min_score: number }): void => {
    generate.mutate(params, {
      onSuccess: (resp) => {
        setSelectedId(resp.digest_id)
      },
    })
  }

  const handleGenerate = (): void => {
    submitGeneration({ window_hours: windowHours, min_score: minScore })
  }

  const digestError = generate.error instanceof DigestError ? generate.error : null
  const canRetryWithLowerScore =
    digestError !== null &&
    digestError.code === 'no_signals' &&
    typeof digestError.maxScoreInWindow === 'number' &&
    digestError.maxScoreInWindow >= 0 &&
    minScore > RETRY_FALLBACK_SCORE
  const retryScore =
    digestError !== null && typeof digestError.maxScoreInWindow === 'number'
      ? Math.max(0, Math.min(RETRY_FALLBACK_SCORE, digestError.maxScoreInWindow))
      : RETRY_FALLBACK_SCORE

  const handleRetryWithLowerScore = (): void => {
    setMinScoreRange([retryScore])
    submitGeneration({ window_hours: windowHours, min_score: retryScore })
  }

  const handleDelete = (id: string): void => {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce brief ?')) return
    remove.mutate(id, {
      onSuccess: () => {
        if (selectedId === id) setSelectedId(null)
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Actions Footer — US-S0.1 à S0.6
  // ---------------------------------------------------------------------------

  const handleCopyMarkdown = async (): Promise<void> => {
    if (!selected) return
    try {
      await copyToClipboard(selected.content)
      toast.success('Markdown copié dans le presse-papier')
    } catch {
      toast.error('Impossible de copier dans le presse-papier')
    }
  }

  const handleEmail = (): void => {
    if (!selected) return
    const dateLabel = new Date(selected.generated_at).toLocaleDateString('fr-FR', {
      dateStyle: 'long',
    })
    const subject = encodeURIComponent(
      `Veille IA Kairos — ${dateLabel} — ${selected.signal_count} signaux`,
    )
    const shareUrl = buildShareUrl(selected.id)
    const MAX_BODY = 1500
    let body = selected.content
    if (body.length > MAX_BODY) {
      body = body.slice(0, MAX_BODY) + `\n\n[Brief complet : ${shareUrl}]`
    }
    const encodedBody = encodeURIComponent(body)
    window.location.href = `mailto:?subject=${subject}&body=${encodedBody}`
  }

  const handleTweet = (): void => {
    if (!selected) return
    const dateLabel = new Date(selected.generated_at).toLocaleDateString('fr-FR', {
      dateStyle: 'short',
    })
    const headline = extractHeadline(selected.content, `Veille IA Kairos — ${dateLabel}`)
    const shareUrl = buildShareUrl(selected.id)
    const tweetUrl =
      `https://twitter.com/intent/tweet` +
      `?text=${encodeURIComponent(headline)}` +
      `&url=${encodeURIComponent(shareUrl)}`
    window.open(tweetUrl, '_blank', 'noopener,noreferrer')
  }

  const handleLinkedIn = (): void => {
    if (!selected) return
    const shareUrl = buildShareUrl(selected.id)
    const linkedInUrl =
      `https://www.linkedin.com/sharing/share-offsite/` + `?url=${encodeURIComponent(shareUrl)}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadMd = (): void => {
    if (!selected) return
    const datePart = formatDateForFilename(selected.generated_at)
    const filename = `kairos-brief-${datePart}.md`
    downloadAsMarkdown(selected.content, filename)
  }

  const handleExportPdf = (): void => {
    window.print()
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-on-surface flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Sparkles className="text-primary h-7 w-7" />
          Digest 80/20
        </h2>
        <p className="text-on-surface-variant text-base">
          Synthèse des signaux qui comptent, dans votre langue.
        </p>
      </header>

      <Card className="border-outline-variant bg-surface-container-lowest rounded-xl shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="window-hours"
              className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
            >
              Fenêtre
            </label>
            <Select value={String(windowHours)} onValueChange={(v) => setWindowHours(Number(v))}>
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
              className="text-on-surface-variant flex items-center justify-between text-xs font-semibold tracking-[0.05em] uppercase"
            >
              <span>Score minimum</span>
              <span className="text-primary font-mono text-sm normal-case">{minScore}</span>
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
            className="bg-primary text-on-primary hover:bg-primary-container gap-2 shadow-sm"
          >
            <Sparkles
              className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {generate.isPending ? 'Génération…' : 'Générer le brief'}
          </Button>
        </CardContent>
      </Card>

      {digestError ? (
        <div
          role="alert"
          className="border-tertiary-fixed-dim bg-tertiary-fixed text-on-tertiary-fixed flex flex-col gap-3 rounded-xl border p-4 text-sm shadow-sm sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex gap-3">
            <AlertTriangle
              className="text-tertiary mt-0.5 h-5 w-5 flex-shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-semibold">Aucun brief généré</p>
              <p className="leading-relaxed">{digestError.message}</p>
              {typeof digestError.scoredSignalsTotal === 'number' &&
              digestError.scoredSignalsTotal >= 0 ? (
                <p className="text-on-tertiary-fixed-variant text-xs">
                  {digestError.scoredSignalsTotal} signaux scorés au total
                  {typeof digestError.scoredSignalsInWindow === 'number'
                    ? ` · ${digestError.scoredSignalsInWindow} dans la fenêtre`
                    : ''}
                  {typeof digestError.maxScoreInWindow === 'number' &&
                  digestError.maxScoreInWindow >= 0
                    ? ` · max ${digestError.maxScoreInWindow}/100`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
          {canRetryWithLowerScore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetryWithLowerScore}
              disabled={generate.isPending}
              className="border-outline self-start whitespace-nowrap"
            >
              Re-essayer avec seuil {retryScore}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <h3 className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
            Historique ({digests.length})
          </h3>

          {digestsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : digests.length === 0 ? (
            <p className="text-on-surface-variant text-sm">
              Aucun brief généré pour l&apos;instant.
            </p>
          ) : (
            <ul className="space-y-2">
              {digests.map((d) => {
                const isActive = selected?.id === d.id
                return (
                  <li
                    key={d.id}
                    className={`group rounded-xl border transition ${
                      isActive
                        ? 'border-primary bg-primary-fixed/40 shadow-sm'
                        : 'border-outline-variant bg-surface-container-lowest hover:border-outline hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center gap-1 px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        className="focus-visible:ring-primary flex-1 rounded px-2 py-1.5 text-left focus:outline-none focus-visible:ring-2"
                        aria-pressed={isActive}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface text-sm font-semibold">
                            {new Date(d.generated_at).toLocaleString('fr-FR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                          <Badge variant="outline" className="border-outline-variant uppercase">
                            {d.language}
                          </Badge>
                        </div>
                        <div className="text-on-surface-variant mt-1 text-xs">
                          {d.signal_count} signaux · {d.window_hours}h · score ≥ {d.min_score}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus-visible:ring-error rounded p-1.5 focus:outline-none focus-visible:ring-2"
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
            <Card className="border-outline-variant bg-surface-container-lowest rounded-xl shadow-md">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Sparkles className="text-outline h-10 w-10" />
                <p className="text-on-surface-variant text-sm">
                  Aucun brief disponible.
                  <br />
                  Lance une génération avec les paramètres ci-dessus.
                </p>
              </CardContent>
            </Card>
          ) : (
            <article className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-md">
              {/* En-tête synthétique visible uniquement à l'impression (US-S0.6) */}
              <div className="print-only print-header">
                Kairos ·{' '}
                {new Date(selected.generated_at).toLocaleDateString('fr-FR', {
                  dateStyle: 'long',
                })}{' '}
                · {selected.signal_count} signaux
              </div>

              <div className="border-outline-variant bg-surface-bright flex flex-col items-start justify-between gap-3 border-b p-6 sm:flex-row sm:items-center">
                <div>
                  <div className="mb-1 flex items-center gap-3">
                    <h3 className="text-on-surface text-xl font-bold tracking-tight">
                      Brief stratégique
                    </h3>
                    <span className="bg-primary-fixed text-on-primary-fixed rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                      Généré
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-xs">
                    {new Date(selected.generated_at).toLocaleString('fr-FR')} · Fenêtre{' '}
                    {selected.window_hours} h · Score min {selected.min_score} ·{' '}
                    {selected.signal_count} signaux
                  </p>
                  <p className="text-on-surface-variant mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium">Langue :</span>
                    <span className="text-on-surface font-mono uppercase">{selected.language}</span>
                    <span className="text-outline">·</span>
                    <span className="font-medium">Modèle :</span>
                    <span className="text-on-surface font-mono">{selected.model_used ?? '—'}</span>
                    {selected.cost != null && (
                      <>
                        <span className="text-outline">·</span>
                        <span className="font-medium">Coût :</span>
                        <span className="text-primary font-mono">
                          {formatCost(Number(selected.cost), 5)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-outline-variant uppercase"
                  title={`Brief généré en ${selected.language === 'fr' ? 'français' : selected.language === 'en' ? 'anglais' : 'espagnol'}`}
                >
                  {selected.language}
                </Badge>
              </div>

              <div className="prose prose-sm prose-slate max-w-none p-6">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children, ...rest }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary-container hover:text-secondary underline"
                        {...rest}
                      >
                        {children}
                      </a>
                    ),
                    h1: ({ children }) => (
                      <h2 className="text-on-surface mt-4 mb-3 text-lg font-bold">{children}</h2>
                    ),
                    h2: ({ children }) => (
                      <h3 className="text-on-surface mt-6 mb-3 text-base font-semibold tracking-tight">
                        {children}
                      </h3>
                    ),
                    h3: ({ children }) => (
                      <h4 className="text-on-surface mt-4 mb-2 text-sm font-semibold">
                        {children}
                      </h4>
                    ),
                    ul: ({ children }) => (
                      <ul className="text-on-surface my-3 ml-5 list-disc space-y-2 text-sm">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="text-on-surface my-3 ml-5 list-decimal space-y-2 text-sm">
                        {children}
                      </ol>
                    ),
                    p: ({ children }) => (
                      <p className="text-on-surface my-2 text-sm leading-relaxed">{children}</p>
                    ),
                    em: ({ children }) => (
                      <em className="text-on-surface-variant mt-1 block text-sm leading-relaxed not-italic">
                        {children}
                      </em>
                    ),
                    strong: ({ children }) => {
                      const { level, rest } = extractConfidenceTag(children)
                      if (level) {
                        return (
                          <strong className="text-on-surface inline-flex flex-wrap items-baseline gap-2 font-semibold">
                            <ConfidenceBadge
                              level={level}
                              language={selected.language as 'fr' | 'en' | 'es'}
                            />
                            <span>{rest}</span>
                          </strong>
                        )
                      }
                      return <strong className="text-on-surface font-semibold">{children}</strong>
                    },
                    code: ({ children }) => (
                      <code className="bg-surface-container-low rounded px-1 py-0.5 font-mono text-xs">
                        {children}
                      </code>
                    ),
                    sup: ({ children, ...rest }) => (
                      <sup
                        className="text-secondary hover:text-secondary-container ml-0.5 cursor-pointer text-[10px] font-semibold"
                        {...rest}
                      >
                        {children}
                      </sup>
                    ),
                  }}
                >
                  {normalizeConfidenceMarkers(selected.content)}
                </ReactMarkdown>
              </div>

              {/* ----------------------------------------------------------------
                  Footer restructuré (US-S0.5) :
                  - Zone gauche : Actions (6 boutons compacts)
                  - Zone droite : Métadonnées
               ---------------------------------------------------------------- */}
              <footer className="bg-surface-container-low border-outline-variant border-t px-6 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Zone gauche : Actions */}
                  <div className="no-print flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyMarkdown}
                      className="hover:bg-surface-container-low gap-1.5"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copier markdown
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleEmail}
                      className="hover:bg-surface-container-low gap-1.5"
                    >
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      Email
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTweet}
                      className="hover:bg-surface-container-low gap-1.5"
                    >
                      <IconX className="h-3.5 w-3.5" aria-hidden="true" />
                      Tweet
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLinkedIn}
                      className="hover:bg-surface-container-low gap-1.5"
                    >
                      <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                      LinkedIn
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadMd}
                      className="hover:bg-surface-container-low gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Télécharger .md
                    </Button>

                    <div className="no-print">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportPdf}
                        className="hover:bg-surface-container-low gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        Exporter PDF
                      </Button>
                    </div>
                  </div>

                  {/* Zone droite : Métadonnées */}
                  <div className="text-on-surface-variant flex flex-wrap items-center gap-3 text-xs">
                    <span>{selected.signal_count} signaux analysés</span>
                    <span>·</span>
                    <span>fenêtre {selected.window_hours} h</span>
                    <span>·</span>
                    <span>score ≥ {selected.min_score}</span>
                    <span>·</span>
                    <span className="font-mono">{selected.model_used ?? '—'}</span>
                    <span>·</span>
                    <span className="text-primary font-mono font-semibold">
                      {formatCost(Number(selected.cost ?? 0), 5)}
                    </span>
                  </div>
                </div>
              </footer>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}
