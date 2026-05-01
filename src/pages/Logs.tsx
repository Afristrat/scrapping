import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LLMCostsTable } from '@/components/features/LLMCostsTable'
import { LogsTable } from '@/components/features/LogsTable'
import { useLogs, type LogRow } from '@/hooks/useLogs'
import { useLLMCostsDetailed } from '@/hooks/useLLMCostsDetailed'

const ACTIONS = [
  'all',
  'scrape:x',
  'scrape:reddit',
  'scrape:arxiv',
  'llm:score',
  'llm:score-batch',
  'pipeline:run',
  'purge',
] as const
const STATUSES = ['all', 'ok', 'error', 'degraded', 'start', 'info'] as const

export default function Logs() {
  const { data, isLoading } = useLogs()
  const { data: llmCosts, isLoading: costsLoading } = useLLMCostsDetailed(200)

  const [actionFilter, setActionFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredLogs = useMemo(() => {
    if (!data) return undefined
    let result: LogRow[] = data
    if (actionFilter !== 'all') {
      result = result.filter((r) => r.action === actionFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter)
    }
    return result
  }, [data, actionFilter, statusFilter])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Logs</h2>
        <p className="text-sm text-slate-500">
          Actions recentes du pipeline. Auto-refresh 30s. Purges automatiquement apres 24h.
        </p>
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Activite</TabsTrigger>
          <TabsTrigger value="openrouter">OpenRouter</TabsTrigger>
        </TabsList>

        {/* Onglet Activite */}
        <TabsContent value="activity" className="space-y-4 pt-4">
          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                Action
              </p>
              <div className="flex flex-wrap gap-1">
                {ACTIONS.map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={actionFilter === a ? 'default' : 'outline'}
                    onClick={() => setActionFilter(a)}
                    aria-pressed={actionFilter === a}
                    className="text-xs"
                  >
                    {a === 'all' ? 'Toutes' : a}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                Statut
              </p>
              <div className="flex flex-wrap gap-1">
                {STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={statusFilter === s ? 'default' : 'outline'}
                    onClick={() => setStatusFilter(s)}
                    aria-pressed={statusFilter === s}
                    className="text-xs"
                  >
                    {s === 'all' ? 'Tous' : s}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <LogsTable rows={filteredLogs} isLoading={isLoading} />
        </TabsContent>

        {/* Onglet OpenRouter */}
        <TabsContent value="openrouter" className="pt-4">
          <p className="mb-3 text-sm text-slate-500">
            Derniers appels LLM via OpenRouter. Auto-refresh 30s.
          </p>
          <LLMCostsTable rows={llmCosts} isLoading={costsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
