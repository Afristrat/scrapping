import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardFilters } from '@/components/features/DashboardFilters'
import { INITIAL_SIGNAL_FILTERS, isFiltersEmpty, type SignalFilters } from '@/lib/signal-filters'
import { PurgeButton } from '@/components/features/PurgeButton'
import { RunPipelineButton } from '@/components/features/RunPipelineButton'
import { SignalModal } from '@/components/features/SignalModal'
import { SignalTable } from '@/components/features/SignalTable'
import { TopicsWidget } from '@/components/features/TopicsWidget'
import { useRealtimeSignals } from '@/hooks/useRealtimeSignals'
import { useRescoreSignalsBulk } from '@/hooks/useRescoreSignals'
import { useRubrics } from '@/hooks/useRubrics'
import { useSettings } from '@/hooks/useSettings'
import {
  useSignals,
  type SignalFilters as LegacySignalFilters,
  type SignalRow,
} from '@/hooks/useSignals'
import { useSignalsEnriched, type EnrichedSignal } from '@/hooks/useSignalsEnriched'

// ---------------------------------------------------------------------------
// Helpers URL ↔ SignalFilters
// ---------------------------------------------------------------------------

/**
 * Sérialise les filtres enrichis dans les URL search params.
 * Format : ?topics=llm,agents&sources=reddit,x&score=70&window=168
 */
function filtersToSearchParams(f: SignalFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.topicSlugs.length > 0) p.set('topics', f.topicSlugs.join(','))
  if (f.personaKeys.length > 0) p.set('personas', f.personaKeys.join(','))
  if (f.sources.length > 0) p.set('sources', f.sources.join(','))
  if (f.minScore !== null && f.minScore > 0) p.set('score', String(f.minScore))
  if (f.windowHours !== null) p.set('window', String(f.windowHours))
  return p
}

/** Désérialise les URL search params en SignalFilters enrichis. */
function searchParamsToFilters(p: URLSearchParams): SignalFilters {
  const topicsRaw = p.get('topics')
  const personasRaw = p.get('personas')
  const sourcesRaw = p.get('sources')
  const scoreRaw = p.get('score')
  const windowRaw = p.get('window')

  return {
    topicSlugs: topicsRaw ? topicsRaw.split(',').filter(Boolean) : [],
    personaKeys: personasRaw ? personasRaw.split(',').filter(Boolean) : [],
    sources: sourcesRaw ? sourcesRaw.split(',').filter(Boolean) : [],
    minScore: scoreRaw ? Number(scoreRaw) || null : null,
    windowHours: windowRaw ? Number(windowRaw) || null : null,
  }
}

// ---------------------------------------------------------------------------
// Filtres legacy (existant) — inchangés
// ---------------------------------------------------------------------------

const LEGACY_FILTERS: LegacySignalFilters = {
  sources: [],
  minScore: 0,
  period: 'all',
  sortBy: 'score',
}

// ---------------------------------------------------------------------------
// Conversion EnrichedSignal → SignalRow (pour compatibilité SignalTable)
// ---------------------------------------------------------------------------

function enrichedToSignalRow(s: EnrichedSignal): SignalRow {
  return {
    id: s.id,
    source: s.source as SignalRow['source'],
    external_id: s.external_id,
    url: s.url,
    title: s.title,
    raw_payload: s.raw_payload,
    scraped_at: s.scraped_at,
    signal_date: s.scraped_at,
    score: s.score,
    reasoning: s.reasoning,
    model_used: s.model_used,
    cost: null,
    scored_at: null,
  }
}

// ---------------------------------------------------------------------------
// Page Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Filtres enrichis — synchronisés avec l'URL
  const [enrichedFilters, setEnrichedFilters] = useState<SignalFilters>(() =>
    searchParamsToFilters(searchParams),
  )

  // État modal signal sélectionné
  const [selected, setSelected] = useState<SignalRow | null>(null)

  // Set d'ids dont la cellule Score doit flasher après un bulk re-score.
  const [flashedIds, setFlashedIds] = useState<ReadonlySet<string>>(new Set())

  // Synchronise l'URL quand les filtres changent
  useEffect(() => {
    const next = filtersToSearchParams(enrichedFilters)
    // Comparaison superficielle pour éviter les boucles infinies
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [enrichedFilters, searchParams, setSearchParams])

  const handleFiltersChange = useCallback((f: SignalFilters) => {
    setEnrichedFilters(f)
  }, [])

  const handleFiltersReset = useCallback(() => {
    setEnrichedFilters(INITIAL_SIGNAL_FILTERS)
  }, [])

  useRealtimeSignals()

  const filtersActive = !isFiltersEmpty(enrichedFilters)

  // Quand les filtres enrichis sont actifs, on utilise useSignalsEnriched.
  // Sinon, on garde useSignals (comportement existant sans régression).
  const { data: legacyRows, isLoading: legacyLoading } = useSignals(LEGACY_FILTERS)
  const { data: enrichedRows, isLoading: enrichedLoading } = useSignalsEnriched(
    filtersActive
      ? {
          topicSlugs:
            enrichedFilters.topicSlugs.length > 0 ? enrichedFilters.topicSlugs : undefined,
          personaKeys:
            enrichedFilters.personaKeys.length > 0 ? enrichedFilters.personaKeys : undefined,
          sources: enrichedFilters.sources.length > 0 ? enrichedFilters.sources : undefined,
          minScore: enrichedFilters.minScore ?? undefined,
          windowHours: enrichedFilters.windowHours ?? undefined,
        }
      : {},
  )

  const rows: SignalRow[] | undefined = filtersActive
    ? (enrichedRows ?? []).map(enrichedToSignalRow)
    : legacyRows

  const isLoading = filtersActive ? enrichedLoading : legacyLoading

  const { data: settings } = useSettings()
  const { data: rubrics } = useRubrics()
  const rescoreBulk = useRescoreSignalsBulk()

  const activeRubricName = useMemo(() => {
    if (!settings?.active_rubric_id || !rubrics) return null
    return rubrics.find((r) => r.id === settings.active_rubric_id)?.name ?? null
  }, [settings, rubrics])

  const zeroOrUnscoredIds = useMemo(
    () => (rows ?? []).filter((r) => r.score === null || r.score === 0).map((r) => r.id),
    [rows],
  )

  const handleRescoreAllZeros = (): void => {
    if (zeroOrUnscoredIds.length === 0) return
    rescoreBulk.mutate(
      { ids: zeroOrUnscoredIds },
      {
        onSuccess: () => {
          setFlashedIds(new Set(zeroOrUnscoredIds))
          window.setTimeout(() => setFlashedIds(new Set()), 2000)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-on-surface text-3xl font-bold tracking-tight">Signaux</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows
              ? `${rows.length} résultats — analyse et priorisation des flux entrants.`
              : 'Chargement…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {zeroOrUnscoredIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRescoreAllZeros}
              disabled={rescoreBulk.isPending}
              className="border-tertiary text-tertiary hover:bg-tertiary-fixed/50 gap-1.5"
              title="Relance le scoring LLM pour tous les signaux affichés non scorés ou à 0"
            >
              {rescoreBulk.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {zeroOrUnscoredIds.length > 1
                ? `Re-scorer ${zeroOrUnscoredIds.length} signaux à 0`
                : `Re-scorer le signal à 0`}
            </Button>
          )}
          <PurgeButton />
          <RunPipelineButton />
        </div>
      </header>

      <TopicsWidget />

      {/* Panneau de filtres topic + persona + source (S-10B.2) */}
      <DashboardFilters
        filters={enrichedFilters}
        onChange={handleFiltersChange}
        onReset={handleFiltersReset}
        resultCount={rows?.length}
      />

      <SignalTable
        rows={rows}
        isLoading={isLoading}
        onRowClick={setSelected}
        activeRubricName={activeRubricName}
        flashedSignalIds={flashedIds}
      />

      <SignalModal signal={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
