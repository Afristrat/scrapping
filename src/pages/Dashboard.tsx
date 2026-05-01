import { useState } from 'react'
import { Filters } from '@/components/features/Filters'
import { PurgeButton } from '@/components/features/PurgeButton'
import { RunPipelineButton } from '@/components/features/RunPipelineButton'
import { SignalModal } from '@/components/features/SignalModal'
import { SignalTable } from '@/components/features/SignalTable'
import { TopicsWidget } from '@/components/features/TopicsWidget'
import { useRealtimeSignals } from '@/hooks/useRealtimeSignals'
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

  useRealtimeSignals()
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
        <div className="flex items-center gap-2">
          <PurgeButton />
          <RunPipelineButton />
        </div>
      </div>

      <TopicsWidget />

      <Filters value={filters} onChange={setFilters} />

      <SignalTable rows={rows} isLoading={isLoading} onRowClick={setSelected} />

      <SignalModal signal={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
