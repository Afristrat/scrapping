import { useState } from 'react'
import { type Control, Controller, type FieldPath, useWatch } from 'react-hook-form'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { POPULAR_MODELS } from '@/lib/openrouter-models'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

interface Props {
  control: Control<SettingsFormValues>
  name: FieldPath<SettingsFormValues> & ('model_scraping' | 'model_scoring' | 'model_monitoring')
  label: string
}

export function ModelSelectField({ control, name, label }: Props) {
  const watchedValue = useWatch({ control, name })
  const initialValue = typeof watchedValue === 'string' ? watchedValue : ''
  const initialIsInPopular = POPULAR_MODELS.some((m) => m.id === initialValue)
  const [customMode, setCustomMode] = useState(!initialIsInPopular && Boolean(initialValue))

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const isInPopular = POPULAR_MODELS.some((m) => m.id === field.value)

        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${name}-input`} className="text-sm font-medium text-slate-700">
                {label}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCustomMode((v) => !v)}
                className="h-6 gap-1 px-2 text-xs text-slate-600 hover:text-slate-900"
              >
                <Pencil className="h-3 w-3" />
                {customMode ? 'Liste' : 'Custom'}
              </Button>
            </div>

            {customMode ? (
              <Input
                id={`${name}-input`}
                placeholder="ex: anthropic/claude-opus-4.7 ou meta-llama/llama-3.1-405b"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="font-mono text-sm"
              />
            ) : (
              <Select
                value={isInPopular ? field.value : POPULAR_MODELS[0].id}
                onValueChange={(val) => field.onChange(val)}
              >
                <SelectTrigger id={`${name}-input`} className="w-full">
                  <SelectValue placeholder="Choisir un modèle…" />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span>{m.label}</span>
                        <span className="text-xs text-slate-500">
                          {m.costHint === 'low' ? '$' : m.costHint === 'medium' ? '$$' : '$$$'}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <p className="text-xs text-slate-500">
              {customMode
                ? 'Saisis un ID exact tel que sur openrouter.ai/models (ex: anthropic/claude-opus-4.7).'
                : `ID OpenRouter actuel : `}
              {!customMode && <code className="font-mono text-slate-700">{field.value}</code>}
            </p>

            {fieldState.error && <p className="text-xs text-red-500">{fieldState.error.message}</p>}
          </div>
        )
      }}
    />
  )
}
