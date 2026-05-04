import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProviderModels } from '@/hooks/useProviderModels'
import { useApiKeys } from '@/hooks/useApiKeys'
import { useLLMProviders } from '@/hooks/useLLMProviders'
import type { LLMProviderId } from '@/lib/providers'

export interface ModelChoice {
  provider: LLMProviderId
  model: string
}

interface Props {
  value: ModelChoice | null
  onChange: (next: ModelChoice | null) => void
  /** Whether to allow clearing (null) — defaults to false (required selection). */
  allowClear?: boolean
}

export function ModelCascadeSelect({ value, onChange, allowClear = false }: Props) {
  const { data: keys } = useApiKeys()
  const { data: models } = useProviderModels()
  const { data: providers = [] } = useLLMProviders()

  const availableProviders = useMemo(() => {
    const withKey = new Set<string>((keys ?? []).map((k) => k.provider))
    const withModels = new Set<string>((models ?? []).map((m) => m.provider))
    return providers.filter((p) => withKey.has(p.id) || withModels.has(p.id) || p.id === 'ollama')
  }, [keys, models, providers])

  const modelsForProvider = useMemo(() => {
    if (!value) return []
    const list = (models ?? []).filter((m) => m.provider === value.provider)
    // Si le modèle sauvegardé n'est pas dans la liste (ex: provider_models pas encore refresh),
    // l'ajouter comme item de secours pour éviter l'affichage du placeholder
    if (value.model && !list.some((m) => m.model_id === value.model)) {
      return [
        { model_id: value.model, display_name: value.model, provider: value.provider },
        ...list,
      ]
    }
    return list
  }, [models, value])

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={value?.provider ?? ''}
        onValueChange={(v) => {
          if (!v && allowClear) {
            onChange(null)
            return
          }
          onChange({ provider: v as LLMProviderId, model: '' })
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Provider…" />
        </SelectTrigger>
        <SelectContent>
          {availableProviders.length === 0 ? (
            <SelectItem value="__empty" disabled>
              Aucun provider configuré
            </SelectItem>
          ) : (
            availableProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <Select
        value={value?.model ?? ''}
        onValueChange={(v) =>
          value ? onChange({ provider: value.provider, model: v }) : undefined
        }
        disabled={!value || modelsForProvider.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              !value
                ? "Choisir provider d'abord"
                : modelsForProvider.length === 0
                  ? 'Refresh models requis'
                  : 'Modèle…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {modelsForProvider.map((m) => (
            <SelectItem key={m.model_id} value={m.model_id}>
              {m.display_name ?? m.model_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
