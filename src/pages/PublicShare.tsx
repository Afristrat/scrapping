import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { ConfidenceBadge } from '@/components/features/ConfidenceBadge'
import { detectConfidenceLevel } from '@/lib/confidence-levels'
import { KairosLogo } from '@/components/icons/KairosLogo'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'

/**
 * Wave 11 — Page publique de partage d un brief sans authentification.
 *
 * Accessible directement via `/share/:slug`. Lit le digest via la fonction
 * `read_public_digest()` SECURITY DEFINER qui bypass RLS et accepte les
 * appels anon. Increment view_count automatiquement.
 *
 * Cette page est crawlée par Twitter/LinkedIn lors d un partage URL — les OG
 * meta tags devraient être dynamiques pour preview riche (TODO Wave 11.X).
 */

interface PublicDigest {
  digest_id: string
  content: string
  language: string
  signal_count: number
  window_hours: number
  min_score: number
  generated_at: string
  expires_at: string
  org_name: string
}

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

export default function PublicShare(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>()
  // 3 états distincts : loading | error | digest
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'success'; digest: PublicDigest }
  >({ kind: 'loading' })

  useEffect(() => {
    if (!slug) {
      // Edge case : slug absent (route param parsing failed). On signale l erreur
      // de manière asynchrone pour respecter la règle React 19
      // « no setState sync in effect ».
      void Promise.resolve().then(() => {
        setState({ kind: 'error', message: 'Lien invalide.' })
      })
      return
    }
    let cancelled = false

    // Cast nécessaire : RPC read_public_digest pas dans Database types tant que
    // pas regen post-migration. Cf. CLAUDE.md piège connu.
    const client = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    }

    void client.rpc('read_public_digest', { p_slug: slug }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setState({
          kind: 'error',
          message: error.message.includes('share_not_found_or_expired')
            ? "Ce lien n'existe pas ou a expiré."
            : `Erreur : ${error.message.slice(0, 200)}`,
        })
        return
      }
      const rows = (data ?? []) as PublicDigest[]
      if (rows.length === 0) {
        setState({ kind: 'error', message: "Ce lien n'existe pas ou a expiré." })
        return
      }
      setState({ kind: 'success', digest: rows[0] })
    })

    return () => {
      cancelled = true
    }
  }, [slug])

  const digest = state.kind === 'success' ? state.digest : null
  const error = state.kind === 'error' ? state.message : null
  const loading = state.kind === 'loading'

  const dateLabel = useMemo(() => {
    if (!digest) return ''
    return new Date(digest.generated_at).toLocaleDateString(
      digest.language === 'fr' ? 'fr-FR' : digest.language === 'es' ? 'es-ES' : 'en-US',
      { day: 'numeric', month: 'long', year: 'numeric' },
    )
  }, [digest])

  return (
    <main className="bg-surface text-on-surface min-h-screen">
      {/* Header public Kairos branded */}
      <header className="border-outline-variant border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-2 no-underline">
            <KairosLogo className="h-7 w-7" />
            <span className="text-on-surface text-lg font-bold tracking-tight">Kairos</span>
          </a>
          <a
            href="/login"
            className="text-on-surface-variant hover:text-primary text-xs font-medium"
          >
            Se connecter →
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && error && (
          <div className="border-outline-variant bg-surface-container-low rounded-xl border p-8 text-center">
            <h1 className="text-on-surface text-2xl font-bold tracking-tight">Lien indisponible</h1>
            <p className="text-on-surface-variant mt-3 text-sm">{error}</p>
            <a
              href="/"
              className="text-primary mt-6 inline-flex text-sm font-medium hover:underline"
            >
              Découvrir Kairos →
            </a>
          </div>
        )}

        {!loading && digest && (
          <article className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-md">
            <div className="border-outline-variant bg-surface-bright border-b p-6">
              <p className="text-primary text-xs font-bold tracking-[0.1em] uppercase">
                Brief stratégique · {digest.org_name}
              </p>
              <h1 className="text-on-surface mt-1 text-2xl font-bold tracking-tight">
                Veille IA — {dateLabel}
              </h1>
              <p className="text-on-surface-variant mt-2 text-xs">
                {digest.signal_count} signaux analysés · fenêtre {digest.window_hours} h · score ≥{' '}
                {digest.min_score} · {digest.language.toUpperCase()}
              </p>
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
                    <h4 className="text-on-surface mt-4 mb-2 text-sm font-semibold">{children}</h4>
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
                            language={digest.language as 'fr' | 'en' | 'es'}
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
                {normalizeConfidenceMarkers(digest.content)}
              </ReactMarkdown>
            </div>

            <footer className="bg-surface-container-low border-outline-variant text-on-surface-variant border-t px-6 py-4 text-xs">
              <p>
                Généré par <strong className="text-on-surface">Kairos</strong> · Veille IA scorée
                par LLM ·{' '}
                <a
                  href="https://scrap.ai-mpower.com"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Découvrir
                </a>
              </p>
              <p className="text-outline mt-1">
                Lien valide jusqu&apos;au{' '}
                {new Date(digest.expires_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
              </p>
            </footer>
          </article>
        )}
      </div>
    </main>
  )
}
