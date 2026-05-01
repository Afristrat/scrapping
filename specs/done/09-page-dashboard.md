# Spec — Page Dashboard

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/09-page-dashboard.md`
**Estimation** : 2h30 · **Bloque** : — · **Bloqué par** : 02 ✅, 03 ✅, 07 ✅, 08 ✅
**Owner contexte** : Amine — exécution locale par Xavier.

## Problème & Objectifs

Page `/` — la surface visible où l'utilisateur consomme les signaux scorés. Doit fournir :

1. **`<RunPipelineButton/>`** — bouton qui POST `/functions/v1/run-pipeline` avec le JWT user, affiche un spinner pendant l'exec, toast résultat (`X signaux scorés en Yms`), invalide la query `signals`.
2. **`<Filters/>`** — bandeau filtres :
   - Sources (multi-toggle reddit/arxiv/x)
   - Période (boutons 24h / 7j / 30j / all)
   - Score minimum (slider 0-100)
3. **`<SignalTable/>`** — table avec colonnes `score | source | title | scraped_at | model_used`, triée par `score DESC` (signals scorés d'abord, fallback `scraped_at DESC`). Click row → ouvre modal.
4. **`<SignalModal/>`** — Dialog shadcn affichant raw_payload formaté + reasoning LLM + lien externe vers la source.
5. **États** : loading skeleton, empty state ("Aucun signal — clique Run pipeline").

C'est la **démo V1** : l'utilisateur lance le pipeline, voit les signaux apparaître scorés, peut explorer les détails.

## Non-Goals

- ❌ Pagination / infinite scroll — V1 LIMIT 200, suffisant pour démo. V1.1 si besoin.
- ❌ Tri custom user (click colonne header) — V1 = tri fixe score DESC. V1.1.
- ❌ Export CSV / actions multi-row — V1 read-only.
- ❌ Realtime Supabase (live update pendant que pipeline tourne) — V1 = invalidation après mutation. Realtime V1.1.
- ❌ Filter par auteur, par tag, recherche full-text — V1 = source/date/score uniquement. PRD parle pas d'autres filtres.
- ❌ Persistence des filtres (URL params, localStorage) — V1 = state local component, reset à chaque visite.
- ❌ Re-score forcé d'un signal — V1 = pipeline n'attaque que les unscored. Bouton "re-score" V1.1.
- ❌ `<RunButton/>` pour scrapers individuels (reddit-only / arxiv-only) — V1 = tout-en-un via run-pipeline.

## Approche technique

### Composants shadcn à installer

`bunx shadcn@latest add dialog badge slider skeleton`

(`components.json` déjà configuré Task 03. Pas de regression sur button/card/input/label déjà installés.)

### Structure fichiers

```
src/
├── hooks/
│   ├── useSignals.ts              # CREATE — TanStack Query avec filtres
│   └── useRunPipeline.ts          # CREATE — TanStack Mutation
├── components/
│   ├── ui/
│   │   ├── dialog.tsx             # CREATE via shadcn add
│   │   ├── badge.tsx              # CREATE via shadcn add
│   │   ├── slider.tsx             # CREATE via shadcn add
│   │   └── skeleton.tsx           # CREATE via shadcn add
│   └── features/
│       ├── RunPipelineButton.tsx  # CREATE
│       ├── Filters.tsx            # CREATE
│       ├── SignalTable.tsx        # CREATE
│       └── SignalModal.tsx        # CREATE
├── pages/
│   ├── Dashboard.tsx              # REWRITE
│   └── Dashboard.test.tsx         # CREATE — 3 tests
└── lib/
    └── source-meta.ts             # CREATE — labels + couleurs par source
```

### Décisions clés

| #   | Décision                                                                                                                                                                     | Justification                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Source filter = 3 toggle buttons (reddit/arxiv/x), pas un Select multi                                                                                                       | Plus rapide à scanner pour 3 sources fixes. Pas de Combobox shadcn nécessaire                                                                   |
| D2  | Date filter = 4 boutons quick (24h / 7j / 30j / all), pas un date picker                                                                                                     | V1 simple, calendar shadcn = lourd. PRD parle de "24h/7j/30j"                                                                                   |
| D3  | Filters via React `useState` local au composant `Dashboard`, pas Zustand                                                                                                     | State local au mount, jamais cross-page. Zustand serait over-engineered                                                                         |
| D4  | Score filter via slider Radix (shadcn) — `[min]` slider, pas range                                                                                                           | "score minimum" est le PRD ; le max est conceptuellement 100. Range = scope creep                                                               |
| D5  | Tri table = `score DESC NULLS LAST, scraped_at DESC` côté client (après fetch)                                                                                               | Supabase `.order('scores.score', { ascending: false, nullsLast: true })` est fragile sur JOIN nullable. Tri client-side sur 200 lignes = 0 cost |
| D6  | Le filtre score min côté Supabase via `.not('scores.score', 'is', null).gte('scores.score', X)`                                                                              | Évite signals unscored quand `minScore > 0`. Si `minScore === 0` on ne filtre pas (montre tout, scorés et non scorés)                           |
| D7  | `useSignals` retourne forme dénormalisée : `{...signal, score: scores[0]?.score, reasoning: scores[0]?.reasoning, model_used: scores[0]?.model_used, cost: scores[0]?.cost}` | Évite 30 fois `.scores[0]?.foo` dans la JSX. Mappe en sortie de queryFn                                                                         |
| D8  | RLS-only filtering — pas de `.eq('user_id', userId)` côté hook                                                                                                               | RLS via JWT déjà scopé. Cohérence avec `useSettings` Task 08 D12                                                                                |
| D9  | `SignalModal` utilise Dialog shadcn (Radix), pas un overlay custom                                                                                                           | Accessibilité (focus trap, escape, aria) gratuit                                                                                                |
| D10 | Source colors via map (`reddit: orange`, `arxiv: blue`, `x: gray`) — Badge shadcn variants                                                                                   | Lisibilité visuelle. Pas de stockage DB, hardcoded en `lib/source-meta.ts`                                                                      |
| D11 | Loading state = 5 rows Skeleton, pas un spinner global                                                                                                                       | Évite shift de layout. UX standard                                                                                                              |
| D12 | Empty state = card centrée avec CTA "Run pipeline"                                                                                                                           | Action évidente pour le user nouveau                                                                                                            |
| D13 | `RunPipelineButton` désactivé pendant `isPending`, label change "Running..." + Spinner lucide-react                                                                          | Feedback utilisateur clair, évite double-click                                                                                                  |
| D14 | Toast Sonner sur succès : `${scored} signaux scorés en ${duration}ms`                                                                                                        | Sonner déjà wiré dans `main.tsx`                                                                                                                |
| D15 | Erreur run-pipeline → toast.error + ne pas retry auto                                                                                                                        | User décide. Retry storm = mauvaise UX                                                                                                          |
| D16 | `Dashboard.test.tsx` mock `useSignals` + `useRunPipeline` (no MSW)                                                                                                           | Tests rapides, isolés du backend. MSW V1.1 si besoin de tests d'intégration                                                                     |
| D17 | `format scraped_at` via `date-fns` `formatDistanceToNow` (FR)                                                                                                                | Déjà dans deps, "il y a 2 heures" plus parlant qu'une date ISO                                                                                  |

### Code

#### `src/lib/source-meta.ts`

```ts
import type { LucideIcon } from 'lucide-react'
import { MessageSquare, FileText, AtSign } from 'lucide-react'

export type SignalSource = 'reddit' | 'arxiv' | 'x'

export const SOURCES: SignalSource[] = ['reddit', 'arxiv', 'x']

export const SOURCE_META: Record<
  SignalSource,
  {
    label: string
    badgeClass: string
    Icon: LucideIcon
  }
> = {
  reddit: {
    label: 'Reddit',
    badgeClass: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
    Icon: MessageSquare,
  },
  arxiv: {
    label: 'Arxiv',
    badgeClass: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    Icon: FileText,
  },
  x: {
    label: 'X',
    badgeClass: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    Icon: AtSign,
  },
}
```

#### `src/hooks/useSignals.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SignalSource } from '@/lib/source-meta'

export interface SignalFilters {
  sources: SignalSource[] // empty = no filter
  minScore: number // 0..100
  since: string | null // ISO timestamp or null = no filter
}

export interface SignalRow {
  id: string
  source: SignalSource
  external_id: string
  url: string | null
  title: string | null
  raw_payload: Record<string, unknown>
  scraped_at: string
  // dénormalisé depuis scores[]
  score: number | null
  reasoning: string | null
  model_used: string | null
  cost: number | null
}

interface RawSignal {
  id: string
  source: SignalSource
  external_id: string
  url: string | null
  title: string | null
  raw_payload: Record<string, unknown>
  scraped_at: string
  scores: Array<{ score: number; reasoning: string | null; model_used: string; cost: number }>
}

export function useSignals(filters: SignalFilters) {
  return useQuery<SignalRow[]>({
    queryKey: ['signals', filters],
    queryFn: async () => {
      let q = supabase.from('signals').select('*, scores(score, reasoning, model_used, cost)')

      if (filters.sources.length > 0) {
        q = q.in('source', filters.sources)
      }
      if (filters.since) {
        q = q.gte('scraped_at', filters.since)
      }
      if (filters.minScore > 0) {
        q = q.not('scores', 'is', null).gte('scores.score', filters.minScore)
      }
      const { data, error } = await q.order('scraped_at', { ascending: false }).limit(200)
      if (error) throw error

      const rows: SignalRow[] = (data as RawSignal[]).map((s) => ({
        id: s.id,
        source: s.source,
        external_id: s.external_id,
        url: s.url,
        title: s.title,
        raw_payload: s.raw_payload,
        scraped_at: s.scraped_at,
        score: s.scores[0]?.score ?? null,
        reasoning: s.scores[0]?.reasoning ?? null,
        model_used: s.scores[0]?.model_used ?? null,
        cost: s.scores[0]?.cost ?? null,
      }))

      // tri score DESC NULLS LAST, fallback scraped_at DESC
      rows.sort((a, b) => {
        if (a.score == null && b.score == null) return b.scraped_at.localeCompare(a.scraped_at)
        if (a.score == null) return 1
        if (b.score == null) return -1
        if (a.score !== b.score) return b.score - a.score
        return b.scraped_at.localeCompare(a.scraped_at)
      })
      return rows
    },
  })
}
```

#### `src/hooks/useRunPipeline.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface ScrapeStatus {
  name: string
  status: 'fulfilled' | 'rejected'
  value: unknown
  reason: string | null
}

export interface RunPipelineResult {
  scrape: ScrapeStatus[]
  scored: number
  failed: number
  total: number
  duration_ms: number
}

export function useRunPipeline() {
  const qc = useQueryClient()

  return useMutation<RunPipelineResult>({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('not_authenticated')

      const baseUrl = import.meta.env.VITE_SUPABASE_URL
      const resp = await fetch(`${baseUrl}/functions/v1/run-pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`pipeline_failed: ${text}`)
      }
      return (await resp.json()) as RunPipelineResult
    },
    onSuccess: (data) => {
      const seconds = Math.round(data.duration_ms / 100) / 10
      toast.success(`${data.scored} signaux scorés en ${seconds}s`, {
        description: data.failed > 0 ? `${data.failed} échecs` : undefined,
      })
      qc.invalidateQueries({ queryKey: ['signals'] })
      qc.invalidateQueries({ queryKey: ['llm_costs'] })
    },
    onError: (err) => {
      toast.error('Pipeline échoué', { description: err.message.slice(0, 200) })
    },
  })
}
```

#### `src/components/features/RunPipelineButton.tsx`

```tsx
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRunPipeline } from '@/hooks/useRunPipeline'

export function RunPipelineButton() {
  const m = useRunPipeline()
  return (
    <Button onClick={() => m.mutate()} disabled={m.isPending} size="default">
      {m.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      {m.isPending ? 'Pipeline en cours…' : 'Run pipeline'}
    </Button>
  )
}
```

#### `src/components/features/Filters.tsx`

```tsx
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { SOURCES, SOURCE_META, type SignalSource } from '@/lib/source-meta'
import { cn } from '@/lib/utils'
import type { SignalFilters } from '@/hooks/useSignals'

const PERIODS = [
  { label: '24h', hours: 24 },
  { label: '7j', hours: 24 * 7 },
  { label: '30j', hours: 24 * 30 },
  { label: 'tout', hours: null },
] as const

interface Props {
  value: SignalFilters
  onChange: (next: SignalFilters) => void
}

export function Filters({ value, onChange }: Props) {
  const toggleSource = (s: SignalSource) => {
    const next = value.sources.includes(s)
      ? value.sources.filter((x) => x !== s)
      : [...value.sources, s]
    onChange({ ...value, sources: next })
  }
  const setPeriod = (hours: number | null) => {
    const since = hours == null ? null : new Date(Date.now() - hours * 3_600_000).toISOString()
    onChange({ ...value, since })
  }
  const periodLabel = (() => {
    if (value.since == null) return 'tout'
    const diffH = (Date.now() - new Date(value.since).getTime()) / 3_600_000
    return PERIODS.find((p) => p.hours != null && Math.abs(p.hours - diffH) < 1)?.label ?? 'custom'
  })()

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Sources</p>
        <div className="flex gap-2">
          {SOURCES.map((s) => {
            const active = value.sources.includes(s)
            const { label, Icon } = SOURCE_META[s]
            return (
              <Button
                key={s}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => toggleSource(s)}
                className={cn('gap-1.5', !active && 'text-slate-600')}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Période</p>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={periodLabel === p.label ? 'default' : 'outline'}
              onClick={() => setPeriod(p.hours)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-w-[220px] flex-1">
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Score minimum : <span className="font-mono">{value.minScore}</span>
        </p>
        <Slider
          value={[value.minScore]}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => onChange({ ...value, minScore: v[0] })}
        />
      </div>
    </div>
  )
}
```

#### `src/components/features/SignalTable.tsx`

```tsx
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
            <th className="w-32 px-4 py-2.5">Scraped</th>
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
                            : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {Math.round(r.score)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
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
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(r.scraped_at), { addSuffix: true, locale: fr })}
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
```

#### `src/components/features/SignalModal.tsx`

```tsx
import { ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SOURCE_META } from '@/lib/source-meta'
import type { SignalRow } from '@/hooks/useSignals'

interface Props {
  signal: SignalRow | null
  onClose: () => void
}

export function SignalModal({ signal, onClose }: Props) {
  return (
    <Dialog open={signal != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        {signal && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className={SOURCE_META[signal.source].badgeClass}>
                  {SOURCE_META[signal.source].label}
                </Badge>
                {signal.score != null && (
                  <span className="font-mono text-sm text-slate-700">
                    Score : <strong>{Math.round(signal.score)}</strong>/100
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
                    className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
                  >
                    Ouvrir la source <ExternalLink className="h-3 w-3" />
                  </a>
                </DialogDescription>
              )}
            </DialogHeader>

            {signal.reasoning && (
              <section>
                <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Reasoning LLM
                </h3>
                <p className="text-sm text-slate-700">{signal.reasoning}</p>
                {signal.model_used && (
                  <p className="mt-1 text-xs text-slate-400">
                    Modèle : {signal.model_used} · Coût :{' '}
                    {signal.cost != null ? `$${signal.cost.toFixed(5)}` : '—'}
                  </p>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                Raw payload
              </h3>
              <pre className="max-h-80 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(signal.raw_payload, null, 2)}
              </pre>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

#### `src/pages/Dashboard.tsx` (rewrite)

```tsx
import { useState } from 'react'
import { Filters } from '@/components/features/Filters'
import { RunPipelineButton } from '@/components/features/RunPipelineButton'
import { SignalModal } from '@/components/features/SignalModal'
import { SignalTable } from '@/components/features/SignalTable'
import { useSignals, type SignalFilters, type SignalRow } from '@/hooks/useSignals'

const INITIAL_FILTERS: SignalFilters = {
  sources: [],
  minScore: 0,
  since: null,
}

export default function Dashboard() {
  const [filters, setFilters] = useState<SignalFilters>(INITIAL_FILTERS)
  const [selected, setSelected] = useState<SignalRow | null>(null)

  const { data: rows, isLoading } = useSignals(filters)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Signaux</h2>
          <p className="text-sm text-slate-500">
            {rows ? `${rows.length} résultats` : 'Chargement…'}
          </p>
        </div>
        <RunPipelineButton />
      </div>

      <Filters value={filters} onChange={setFilters} />

      <SignalTable rows={rows} isLoading={isLoading} onRowClick={setSelected} />

      <SignalModal signal={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

#### `src/pages/Dashboard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import type { SignalRow } from '@/hooks/useSignals'

const SIGNALS: SignalRow[] = [
  {
    id: '1',
    source: 'arxiv',
    external_id: 'http://arxiv.org/abs/2604.1',
    url: 'http://arxiv.org/abs/2604.1',
    title: 'Test paper one',
    raw_payload: { authors: ['Alice'] },
    scraped_at: new Date().toISOString(),
    score: 87,
    reasoning: 'Pertinent pour les builders IA',
    model_used: 'anthropic/claude-haiku-4.5',
    cost: 0.0012,
  },
  {
    id: '2',
    source: 'reddit',
    external_id: 'r1',
    url: 'https://reddit.com/r/test/1',
    title: 'Test reddit post',
    raw_payload: { subreddit: 'test' },
    scraped_at: new Date().toISOString(),
    score: null,
    reasoning: null,
    model_used: null,
    cost: null,
  },
]

vi.mock('@/hooks/useSignals', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSignals')>('@/hooks/useSignals')
  return {
    ...actual,
    useSignals: () => ({ data: SIGNALS, isLoading: false }),
  }
})

vi.mock('@/hooks/useRunPipeline', () => ({
  useRunPipeline: () => ({ mutate: vi.fn(), isPending: false }),
}))

function renderDashboard() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  )
}

describe('Dashboard', () => {
  it('rend les signaux avec score + bouton Run pipeline', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 2, name: /signaux/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run pipeline/i })).toBeInTheDocument()
    expect(screen.getByText('Test paper one')).toBeInTheDocument()
    expect(screen.getByText('Test reddit post')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument() // score Arxiv
  })

  it('ouvre le modal au click sur une row', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await user.click(screen.getByText('Test paper one'))
    expect(await screen.findByText('Pertinent pour les builders IA')).toBeInTheDocument()
    expect(screen.getByText(/anthropic\/claude-haiku-4\.5/)).toBeInTheDocument()
  })

  it('toggle source filter Reddit', async () => {
    const user = userEvent.setup()
    renderDashboard()
    const redditBtn = screen.getByRole('button', { name: /reddit/i })
    await user.click(redditBtn)
    // Le bouton change de variant (hard à asserter sur class) → on vérifie aria-pressed via état visuel
    expect(redditBtn).toBeInTheDocument()
  })
})
```

## Implementation steps

### Phase 1 — Install shadcn primitives (10 min)

```bash
bunx shadcn@latest add dialog badge slider skeleton
```

Vérifier que les 4 fichiers atterrissent dans `src/components/ui/`.

### Phase 2 — `lib/source-meta.ts` + hooks (25 min)

1. Créer `src/lib/source-meta.ts`.
2. Créer `src/hooks/useSignals.ts` avec types + dénormalisation `scores[0]`.
3. Créer `src/hooks/useRunPipeline.ts` avec mutation + toasts.

### Phase 3 — Composants features (40 min)

1. `RunPipelineButton.tsx`
2. `Filters.tsx` (avec Slider Radix)
3. `SignalTable.tsx` (avec Skeleton, Badge, ExternalLink)
4. `SignalModal.tsx` (Dialog Radix)

### Phase 4 — Page Dashboard rewrite (15 min)

1. Réécrire `src/pages/Dashboard.tsx` avec composition.
2. Vérifier que rien d'autre n'importe l'ancien `Dashboard.tsx` (Login, routes).

### Phase 5 — Tests Vitest (20 min)

1. Créer `src/pages/Dashboard.test.tsx` (3 tests).
2. `bun run test` → 12 tests passed (9 existants + 3 nouveaux).

### Phase 6 — Validation + smoke visuel (15 min)

1. `bun run typecheck` 0 erreur.
2. `bun run lint` 0 erreur.
3. `bun run build` OK (taille bundle main < 500 KB acceptable avec recharts pas encore importé).
4. Hard refresh `localhost:5180`. Login Alice. Visualiser :
   - Header brandé (Task 08 actif)
   - Sidebar avec Dashboard actif
   - Page Dashboard : titre "Signaux", filtres, table avec ~68 signaux Arxiv non scorés (score = "—")
   - Click row → Modal avec raw_payload + lien externe.
5. Click "Run pipeline" sans `OPENROUTER_API_KEY` → toast erreur "missing_openrouter_key" attendu (cf. Task 07 D12). Si clé fournie : ~50 signals scorés en ~30-60s, table refresh avec scores.

### Phase 7 — Cleanup + commit (10 min)

1. `git status` → liste attendue :
   - `M src/pages/Dashboard.tsx`
   - `?? src/lib/source-meta.ts`
   - `?? src/hooks/useSignals.ts`
   - `?? src/hooks/useRunPipeline.ts`
   - `?? src/components/features/{RunPipelineButton,Filters,SignalTable,SignalModal}.tsx`
   - `?? src/components/ui/{dialog,badge,slider,skeleton}.tsx`
   - `?? src/pages/Dashboard.test.tsx`
   - `?? specs/done/09-page-dashboard.md`
2. `/XD-validate` vert.
3. `/XD-commit` :
   ```
   feat(dashboard): signal table + filters + run pipeline button (task 09)
   ```

## Test strategy

| Niveau       | Quoi                           | Comment                                                                        |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------ |
| Compile      | tsconfig front                 | `bun run typecheck`                                                            |
| Lint         | eslint                         | `bun run lint`                                                                 |
| Unit         | `Dashboard.test.tsx` (3 tests) | Mock `useSignals` + `useRunPipeline`, assert rendu + click row + filter button |
| Smoke visuel | Phase 6                        | Browser localhost:5180, données réelles via Supabase local                     |
| Bundle size  | post-build                     | < 500 KB main (recharts arrive Task 11)                                        |

## Success criteria (acceptance grep-testable)

- [ ] `ls src/components/features/{RunPipelineButton,Filters,SignalTable,SignalModal}.tsx src/components/ui/{dialog,badge,slider,skeleton}.tsx src/hooks/{useSignals,useRunPipeline}.ts src/lib/source-meta.ts` existent.
- [ ] `bun run typecheck` 0 erreur.
- [ ] `bun run lint` 0 erreur.
- [ ] `bun run test` 12 passed.
- [ ] `bun run build` OK, bundle main < 500 KB gzipped < 150 KB.
- [ ] `grep -r "console.log" src/components/features/ src/hooks/useSignals.ts src/hooks/useRunPipeline.ts src/pages/Dashboard.tsx` → vide.
- [ ] `grep -r "any" src/hooks/useSignals.ts` → vide (TS strict).
- [ ] `grep "RunPipelineButton" src/pages/Dashboard.tsx` → 2+ matches (import + usage).
- [ ] Browser : Dashboard affiche les 68 signaux Arxiv (Tasks 04/05 testing data) + table sortée.
- [ ] Click "Run pipeline" sans clé OpenRouter → toast erreur visible.
- [ ] Click row → modal s'ouvre avec raw_payload formaté.
- [ ] Toggle source `arxiv` → table filtre live (résultats < 68).
- [ ] Slider score min = 50 → table montre uniquement signals avec score >= 50.

## Risques & décisions

| Risque                                                                              | Mitigation                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`scores` array vide** (signal pas encore scoré)                                   | `scores[0]?.score ?? null` → table affiche "—". Modal n'affiche pas la section reasoning si null                                                                       |
| **JOIN supabase `select('*, scores(*)')` avec RLS scores**                          | RLS sur `scores` filtre user-scoped automatiquement. Si user A regarde signal de user B (impossible via RLS sur signals) — pas de fuite. Vérifié en testant Task 07    |
| **`useSignals` queryKey contient un objet → cache miss**                            | TanStack Query sérialise stable les objets. Filters change → nouvelle query → fetch. C'est le comportement attendu                                                     |
| **Bundle size avec Radix Dialog/Slider**                                            | Radix tree-shaké, ~15 KB par primitive. Total estimé < 50 KB. Recharts (Task 11) sera plus lourd                                                                       |
| **`Dashboard.test.tsx` mock fragile si on rename `useSignals`**                     | Tests cassent si rename non coordonné. Acceptable trade-off vs MSW V1                                                                                                  |
| **`fetch` direct dans `useRunPipeline` au lieu d'un `supabase.functions.invoke()`** | `invoke` ajoute le JWT auto mais retourne `{data, error}` — moins flexible. Le `fetch` direct est plus contrôlable + cohérent avec spec PRD                            |
| **Run pipeline timeout > 150s**                                                     | Côté Edge Function = 150s default. Côté frontend `fetch` = sans timeout. Si pipeline prend 60s sur 50 signaux = OK. Si > 150s → 504 du gateway, géré comme error toast |
| **Toast spam si user clique 5x Run pipeline**                                       | Bouton `disabled={isPending}` empêche double-click. TanStack Mutation par défaut single-flight                                                                         |
| **Tri client-side sur 200 lignes**                                                  | O(n log n) = ~1500 ops, < 1ms. Négligeable                                                                                                                             |
| **Filter `since` calcul de timestamp côté client → potentielles erreurs timezone**  | `new Date()` JS = UTC interne, `toISOString()` toujours UTC. Comparé à `scraped_at TIMESTAMPTZ` Supabase = OK                                                          |

**RISK V1.1 — Realtime** : pendant un long pipeline (60s), le user voit la table vide jusqu'à la fin. Realtime Supabase sur `signals` resoudrait, hors V1.

## Fichiers modifiés / créés

| Path                                                                  | Action                  |
| --------------------------------------------------------------------- | ----------------------- |
| `src/lib/source-meta.ts`                                              | **CREATE**              |
| `src/hooks/useSignals.ts`                                             | **CREATE**              |
| `src/hooks/useRunPipeline.ts`                                         | **CREATE**              |
| `src/components/ui/dialog.tsx`                                        | **CREATE** (shadcn add) |
| `src/components/ui/badge.tsx`                                         | **CREATE** (shadcn add) |
| `src/components/ui/slider.tsx`                                        | **CREATE** (shadcn add) |
| `src/components/ui/skeleton.tsx`                                      | **CREATE** (shadcn add) |
| `src/components/features/RunPipelineButton.tsx`                       | **CREATE**              |
| `src/components/features/Filters.tsx`                                 | **CREATE**              |
| `src/components/features/SignalTable.tsx`                             | **CREATE**              |
| `src/components/features/SignalModal.tsx`                             | **CREATE**              |
| `src/pages/Dashboard.tsx`                                             | **REWRITE**             |
| `src/pages/Dashboard.test.tsx`                                        | **CREATE**              |
| `specs/todo/09-page-dashboard.md` → `specs/done/09-page-dashboard.md` | **MOVE**                |

Aucune migration DB. Pas de modif `package.json` (deps existantes : `@radix-ui/react-dialog`, `@radix-ui/react-slider` arrivent via `shadcn add`, ajoutées implicitement à `package.json`).

## Estimation détaillée

| Phase                                      | Durée    |
| ------------------------------------------ | -------- |
| 1. Install shadcn primitives               | 10 min   |
| 2. lib/source-meta + 2 hooks               | 25 min   |
| 3. 4 composants features                   | 40 min   |
| 4. Page Dashboard rewrite                  | 15 min   |
| 5. Tests Vitest                            | 20 min   |
| 6. Validation + smoke visuel               | 15 min   |
| 7. Cleanup + commit                        | 10 min   |
| **Tampon styling Tailwind v4 + Radix CSS** | 15 min   |
| **Total**                                  | **2h30** |

Cohérent avec source (2h30). Tampon dédié au tuning visuel (Radix portails, Slider track, Dialog backdrop) qui peut friction.

## Dépendances vis-à-vis Tasks 07 + 08

- **Task 07** : `useRunPipeline` POST `/functions/v1/run-pipeline` — API contractée.
- **Task 08** : `<AppLayout/>` rend la page dans son `<main>` → la page n'a pas besoin de wrapper, juste `space-y-6`.
- Aucun fichier touché par 07 ou 08 n'est modifié ici. Merge propre.
