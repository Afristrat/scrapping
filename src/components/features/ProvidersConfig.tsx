import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApiKeys, useUpsertApiKey, useDeleteApiKey } from '@/hooks/useApiKeys'
import { useProviderModels, useRefreshModels } from '@/hooks/useProviderModels'
import { LLM_PROVIDERS, type LLMProviderId } from '@/lib/providers'
import type { UserApiKey } from '@/lib/schemas/api-key-schema'
import { cn } from '@/lib/utils'

export function ProvidersConfig() {
  const { data: keys } = useApiKeys()
  const { data: models } = useProviderModels()
  const [open, setOpen] = useState<LLMProviderId | null>(null)

  const keyByProvider = useMemo(() => {
    const m = new Map<string, UserApiKey>()
    for (const k of keys ?? []) m.set(k.provider, k)
    return m
  }, [keys])

  const modelsCountByProvider = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of models ?? []) m.set(x.provider, (m.get(x.provider) ?? 0) + 1)
    return m
  }, [models])

  return (
    <div className="space-y-2">
      {LLM_PROVIDERS.map((p) => {
        const key = keyByProvider.get(p.id)
        const isOpen = open === p.id
        const count = modelsCountByProvider.get(p.id) ?? 0

        return (
          <div key={p.id} className="rounded-lg border bg-card">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : p.id)}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/40"
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-sm font-semibold">{p.label}</span>
                {key && key.validation_status === 'valid' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                )}
                {key && key.validation_status === 'invalid' && (
                  <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">
                  {key ? key.masked_key : 'pas de clé'}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    count > 0 ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {count} modèles
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t px-3 py-3">
                {p.hint && <p className="text-xs text-muted-foreground">{p.hint}</p>}
                <ProviderEditor provider={p.id} existingKey={key} overridable={p.baseURLOverridable} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface EditorProps {
  provider: LLMProviderId
  existingKey: UserApiKey | undefined
  overridable: boolean
}

function ProviderEditor({ provider, existingKey, overridable }: EditorProps) {
  const [rawKey, setRawKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(existingKey?.base_url ?? '')
  const upsert = useUpsertApiKey()
  const remove = useDeleteApiKey()
  const refresh = useRefreshModels()

  const handleSave = async () => {
    if (!rawKey.trim() && !overridable) return
    await upsert.mutateAsync({ provider, rawKey: rawKey.trim() || existingKey?.masked_key || '' })
    setRawKey('')
  }

  const handleRefresh = () => {
    refresh.mutate({ provider, baseUrl: overridable && baseUrl ? baseUrl : undefined })
  }

  const handleDelete = () => {
    if (!existingKey) return
    if (!confirm(`Supprimer la clé ${provider} ?`)) return
    remove.mutate({ id: existingKey.id })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${provider}-key`} className="text-xs">
          API Key
        </Label>
        <Input
          id={`${provider}-key`}
          type="password"
          placeholder={existingKey ? `(actuelle: ${existingKey.masked_key})` : 'sk-...'}
          value={rawKey}
          onChange={(e) => setRawKey(e.target.value)}
        />
      </div>

      {overridable && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${provider}-baseurl`} className="text-xs">
            Base URL
          </Label>
          <Input
            id={`${provider}-baseurl`}
            type="url"
            placeholder="http://localhost:11434/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending || !rawKey.trim()}>
          {upsert.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refresh.isPending || (!existingKey && !overridable)}
        >
          <RefreshCw className={cn('h-3 w-3', refresh.isPending && 'animate-spin')} />
          {refresh.isPending ? 'Refresh…' : 'Refresh models'}
        </Button>
        {existingKey && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={handleDelete}
            disabled={remove.isPending}
          >
            Supprimer
          </Button>
        )}
        {existingKey?.last_validated_at && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            validée {new Date(existingKey.last_validated_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  )
}
