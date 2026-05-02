import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

export function TagInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setDraft('')
    }
  }

  const remove = (tag: string) => onChange(value.filter((v) => v !== tag))

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          onClick={add}
          className="border-outline-variant gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="bg-surface-container text-on-surface-variant inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-on-surface-variant hover:text-error focus-visible:ring-primary/40 -mr-0.5 rounded-full p-0.5 focus-visible:ring-2 focus-visible:outline-none"
                aria-label={`Retirer ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
