import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGenerateDigest, useLatestDigest, type PeriodDays } from '@/hooks/useDigest'
import { cn } from '@/lib/utils'

const PERIODS: Array<{ label: string; days: PeriodDays }> = [
  { label: '24h', days: 1 },
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
]

export default function Digest() {
  const [period, setPeriod] = useState<PeriodDays>(7)
  const { data: digest, isLoading } = useLatestDigest(period)
  const genMutation = useGenerateDigest()

  const isStale =
    digest && Date.now() - new Date(digest.generated_at).getTime() > 6 * 60 * 60 * 1000

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Brief de veille
          </h2>
          <p className="text-sm text-slate-500">
            Synthèse 80/20 des signaux scorés, traduite dans ta langue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <Button
                key={p.days}
                size="sm"
                variant={period === p.days ? 'default' : 'outline'}
                onClick={() => setPeriod(p.days)}
                aria-pressed={period === p.days}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => genMutation.mutate({ period_days: period })}
            disabled={genMutation.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', genMutation.isPending && 'animate-spin')} />
            {genMutation.isPending ? 'Génération…' : 'Générer'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !digest ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">
              Aucun brief pour cette période.
              <br />
              Lance le pipeline depuis le Dashboard, puis clique "Générer".
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isStale && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Brief généré il y a plus de 6h — clique "Générer" pour rafraîchir.
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <DigestRenderer markdown={digest.content} />
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span>{digest.signals_count} signaux analysés</span>
              <span>·</span>
              <span className="font-mono">{digest.model_used}</span>
              <span>·</span>
              <span>${Number(digest.cost).toFixed(5)}</span>
              <span>·</span>
              <span>{new Date(digest.generated_at).toLocaleString('fr-FR')}</span>
              <span>·</span>
              <span className="uppercase">{digest.language}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function DigestRenderer({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length === 0) return
    elements.push(
      <ul key={key++} className="my-3 ml-5 list-disc space-y-2 text-sm text-slate-700">
        {listItems.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
        ))}
      </ul>,
    )
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        <h3 key={key++} className="mt-6 mb-2 text-base font-semibold text-slate-900">
          {trimmed.slice(3)}
        </h3>,
      )
    } else if (trimmed.startsWith('# ')) {
      flushList()
      elements.push(
        <h2 key={key++} className="mt-4 mb-3 text-lg font-bold text-slate-900">
          {trimmed.slice(2)}
        </h2>,
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2))
    } else if (trimmed === '') {
      flushList()
    } else {
      flushList()
      elements.push(
        <p
          key={key++}
          className="my-2 text-sm leading-relaxed text-slate-700"
          dangerouslySetInnerHTML={{ __html: inlineMd(trimmed) }}
        />,
      )
    }
  }
  flushList()

  return <div>{elements}</div>
}

function inlineMd(text: string): string {
  // Escape HTML first
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Then apply transformations
  return escaped
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="text-blue-600 underline hover:text-blue-800">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-900">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-xs">$1</code>')
}
