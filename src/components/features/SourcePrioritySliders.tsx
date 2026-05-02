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
  { key: 'arxiv', label: 'arXiv' },
  { key: 'x', label: 'X / Twitter' },
]

export function SourcePrioritySliders({ value, onChange }: Props) {
  return (
    <Card className="bg-surface-container-lowest border-outline-variant">
      <CardHeader>
        <CardTitle className="text-on-surface text-base">Priorité des sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-on-surface-variant text-xs leading-relaxed">
          Poids de chaque source dans le scoring (0 = ignorée, 2 = prioritaire).
        </p>
        {SOURCES.map(({ key, label }) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
                {label}
              </Label>
              <span className="text-on-surface bg-surface-container-high rounded-md px-2 py-0.5 font-mono text-xs">
                {value[key].toFixed(1)}
              </span>
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
