import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import type { SourcePriority } from '@/lib/schemas/settings-schema'

interface Props {
  value: SourcePriority
  onChange: (next: SourcePriority) => void
}

const SOURCES: Array<{ key: keyof SourcePriority; label: string }> = [
  { key: 'reddit', label: 'Reddit' },
  { key: 'arxiv', label: 'Arxiv' },
  { key: 'x', label: 'X / Twitter' },
]

export function SourcePrioritySliders({ value, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Priorite des sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">
          Poids de chaque source dans le scoring (0 = ignore, 2 = prioritaire).
        </p>
        {SOURCES.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{label}</Label>
              <span className="font-mono text-sm text-slate-600">{value[key].toFixed(1)}</span>
            </div>
            <Slider
              value={[value[key]]}
              min={0}
              max={2}
              step={0.1}
              onValueChange={(v) => onChange({ ...value, [key]: v[0] })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
