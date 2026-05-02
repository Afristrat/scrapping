import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagInput } from '@/components/features/TagInput'
import type { ApifyConfig } from '@/lib/schemas/settings-schema'

interface Props {
  value: ApifyConfig
  onChange: (next: ApifyConfig) => void
}

const REDDIT_SORT_OPTIONS = ['hot', 'new', 'top', 'rising', 'relevance'] as const
const REDDIT_TIME_OPTIONS = ['hour', 'day', 'week', 'month', 'year', 'all'] as const

export function ApifyConfigForm({ value, onChange }: Props) {
  return (
    <Card className="bg-surface-container-lowest border-outline-variant">
      <CardHeader>
        <CardTitle className="text-on-surface text-base">Configuration Apify</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* X list IDs */}
        <FieldGroup label="X List IDs">
          <TagInput
            value={value.x_list_ids}
            onChange={(next) => onChange({ ...value, x_list_ids: next })}
            placeholder="ID de liste X"
          />
        </FieldGroup>

        {/* X max items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
              Max items X
            </Label>
            <span className="text-on-surface bg-surface-container-high rounded-md px-2 py-0.5 font-mono text-xs">
              {value.x_max_items}
            </span>
          </div>
          <Slider
            value={[value.x_max_items]}
            min={10}
            max={500}
            step={10}
            onValueChange={(v) => onChange({ ...value, x_max_items: v[0] })}
          />
        </div>

        {/* Reddit actor */}
        <FieldGroup label="Reddit Actor">
          <Select
            value={value.reddit_actor}
            onValueChange={(v) => onChange({ ...value, reddit_actor: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automation-lab/reddit-scraper">
                automation-lab/reddit-scraper
              </SelectItem>
              <SelectItem value="trudax/reddit-scraper">trudax/reddit-scraper</SelectItem>
            </SelectContent>
          </Select>
        </FieldGroup>

        {/* Reddit sort */}
        <FieldGroup label="Reddit — Tri">
          <Select
            value={value.reddit_sort}
            onValueChange={(v) =>
              onChange({ ...value, reddit_sort: v as ApifyConfig['reddit_sort'] })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REDDIT_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>

        {/* Reddit time filter */}
        <FieldGroup label="Reddit — Filtre temporel">
          <Select
            value={value.reddit_time_filter}
            onValueChange={(v) =>
              onChange({ ...value, reddit_time_filter: v as ApifyConfig['reddit_time_filter'] })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REDDIT_TIME_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>

        {/* Reddit max per sub */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
              Max posts par subreddit
            </Label>
            <span className="text-on-surface bg-surface-container-high rounded-md px-2 py-0.5 font-mono text-xs">
              {value.reddit_max_per_sub}
            </span>
          </div>
          <Slider
            value={[value.reddit_max_per_sub]}
            min={1}
            max={100}
            step={1}
            onValueChange={(v) => onChange({ ...value, reddit_max_per_sub: v[0] })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
        {label}
      </Label>
      {children}
    </div>
  )
}
