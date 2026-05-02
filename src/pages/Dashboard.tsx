import { useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Filters } from '@/components/features/Filters'
import { PurgeButton } from '@/components/features/PurgeButton'
import { RunPipelineButton } from '@/components/features/RunPipelineButton'
import { SignalModal } from '@/components/features/SignalModal'
import { SignalTable } from '@/components/features/SignalTable'
import { TopicsWidget } from '@/components/features/TopicsWidget'
import { useRealtimeSignals } from '@/hooks/useRealtimeSignals'
import { useRescoreSignalsBulk } from '@/hooks/useRescoreSignals'
import { useRubrics } from '@/hooks/useRubrics'
import { useSettings } from '@/hooks/useSettings'
import { useSignals, type SignalFilters, type SignalRow } from '@/hooks/useSignals'

const INITIAL_FILTERS: SignalFilters = {
  sources: [],
  minScore: 0,
  period: 'all',
  sortBy: 'score',
}

export default function Dashboard() {
  const [filters, setFilters] = useState<SignalFilters>(INITIAL_FILTERS)
  const [selected, setSelected] = useState<SignalRow | null>(null)
  // Set d'ids dont la cellule Score doit flasher après un bulk re-score.
  // Vidé après ~2s par effect côté <SignalTable>.
  const [flashedIds, setFlashedIds] = useState<ReadonlySet<string>>(new Set())

  useRealtimeSignals()
  const { data: rows, isLoading } = useSignals(filters)
  const { data: settings } = useSettings()
  const { data: rubrics } = useRubrics()
  const rescoreBulk = useRescoreSignalsBulk()

  // Lookup du nom de la rubrique active — passé en prop à SignalTable
  // pour enrichir le tooltip de chaque <ScoreCell>. La dépendance est
  // l'objet `settings` complet (cf. react-hooks/preserve-manual-memoization),
  // le compilateur React préfère ne pas dépendre d'un sous-champ optionnel.
  const activeRubricName = useMemo(() => {
    if (!settings?.active_rubric_id || !rubrics) return null
    return rubrics.find((r) => r.id === settings.active_rubric_id)?.name ?? null
  }, [settings, rubrics])

  // Cible du bouton « Re-scorer les N à 0 » : tous les signaux affichés
  // dont le score est null (pas scoré) OU exactement 0 (très probable bug
  // historique : parser cassé, batch manqué, etc.). On prend les ids dans
  // l'ordre de la liste pour préserver la priorité du tri courant.
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
          // Reset après 2s (la cellule a déjà fini son animation à ~1.5s).
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

      <Filters value={filters} onChange={setFilters} />

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
