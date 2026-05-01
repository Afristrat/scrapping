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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuration Apify</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* X list IDs */}
        <div className="space-y-1.5">
          <Label>X List IDs</Label>
          <TagInput
            value={value.x_list_ids}
            onChange={(next) => onChange({ ...value, x_list_ids: next })}
            placeholder="ID de liste X"
          />
        </div>

        {/* X max items */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Max items X</Label>
            <span className="font-mono text-sm text-slate-600">{value.x_max_items}</span>
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
        <div className="space-y-1.5">
          <Label>Reddit Actor</Label>
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
        </div>

        {/* Reddit sort */}
        <div className="space-y-1.5">
          <Label>Reddit - Tri</Label>
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
        </div>

        {/* Reddit time filter */}
        <div className="space-y-1.5">
          <Label>Reddit - Filtre temporel</Label>
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
        </div>

        {/* Reddit max per sub */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Max posts par subreddit</Label>
            <span className="font-mono text-sm text-slate-600">{value.reddit_max_per_sub}</span>
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
