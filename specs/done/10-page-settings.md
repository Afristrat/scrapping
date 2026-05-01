# Spec — Page Settings

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/10-page-settings.md`
**Estimation** : 2h · **Bloqué par** : 02 ✅ 03 ✅ 08 ✅
**Dépendances** : `useSettings` (Task 08, déjà créé), bucket `branding` Storage (Task 02, déjà créé)

## Objectif

Page `/settings` form complet : 3 modèles OpenRouter, prompt scoring, sources (subs/categories/queries), branding (nom + primary color + logo upload). Submit `update settings` + invalidate query → header rebrand instantané.

## Décisions clés

1. **react-hook-form + zod** (déjà dans deps) avec `zodResolver`. Schema full settings côté `src/lib/schemas/settings-schema.ts`.
2. **4 sections en cards** verticales (`<Card>` shadcn déjà présente) avec un seul bouton "Enregistrer" en bas qui submit toute la form en une fois.
3. **TagInput** = pas de lib externe — implémentation locale 30 lignes (Input + bouton "Ajouter" → array de strings affichés en `<Badge>` cliquables pour delete). Code dans `src/components/features/TagInput.tsx`.
4. **ColorPicker** = simple `<input type="color">` natif HTML, label "Couleur primaire". Pas de lib.
5. **Logo upload** : `<input type="file" accept="image/*">` → `supabase.storage.from('branding').upload(`${user.id}/logo.png`, file, { upsert: true })` → récupère `getPublicUrl` → stocke dans `branding.logo_url`. Bucket existe déjà (Task 02 RLS migration).
6. **Validation** : nom 1-50 chars, couleur regex `^#[0-9a-f]{6}$`, sources arrays max 20 items, prompt min 10 chars max 2000.
7. **POPULAR_MODELS** statiques dans `src/lib/openrouter-models.ts` (liste du task source) + champ libre via `<Input>` à côté du `<Select>` (style "ou tape un modèle custom").
8. **Test minimal** : 1 fichier `Settings.test.tsx` qui mock `useSettings` + `supabase.from('settings').update`, render le form pré-rempli, submit, assert `update` called avec les bons valeurs. Pas de MSW (gardons cohérent Task 09).
9. **Pas de Textarea shadcn pré-installé** → `bunx shadcn@latest add textarea` (1 primitive). Idem **`select`** : nécessite `bunx shadcn@latest add select`.

## Structure

```
src/
├── lib/
│   ├── openrouter-models.ts       # CREATE — liste statique
│   └── schemas/settings-schema.ts  # CREATE — zod schema
├── components/
│   ├── ui/
│   │   ├── textarea.tsx           # CREATE via shadcn add
│   │   └── select.tsx             # CREATE via shadcn add
│   └── features/
│       ├── TagInput.tsx           # CREATE
│       ├── ModelSelectField.tsx   # CREATE — wrapper RHF
│       └── BrandingForm.tsx       # CREATE — name + color + logo upload
├── hooks/
│   └── useUpdateSettings.ts       # CREATE — TanStack Mutation
└── pages/
    ├── Settings.tsx                # REWRITE
    └── Settings.test.tsx           # CREATE
```

## Code condensé

### `src/lib/openrouter-models.ts`

```ts
export interface OpenRouterModel {
  id: string
  label: string
}

export const POPULAR_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 (rapide, low-cost)' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (qualité)' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
  { id: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (open)' },
  { id: 'openrouter/auto', label: 'Auto (router OpenRouter décide)' },
]
```

### `src/lib/schemas/settings-schema.ts`

```ts
import { z } from 'zod'

export const settingsSchema = z.object({
  model_scraping: z.string().min(1),
  model_scoring: z.string().min(1),
  model_monitoring: z.string().min(1),
  prompt_scoring: z.string().min(10).max(2000),
  reddit_subs: z.array(z.string().min(1).max(50)).max(20),
  arxiv_categories: z.array(z.string().min(1).max(20)).max(20),
  x_queries: z.array(z.string().min(1).max(100)).max(20),
  branding: z.object({
    name: z.string().min(1).max(50),
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo_url: z.string().url().nullable(),
  }),
})

export type SettingsFormValues = z.infer<typeof settingsSchema>
```

### `src/hooks/useUpdateSettings.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation<void, Error, SettingsFormValues>({
    mutationFn: async (values) => {
      const { error } = await supabase.from('settings').update(values).neq('user_id', '__never__')
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Settings sauvegardés')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error('Échec sauvegarde', { description: err.message.slice(0, 200) }),
  })
}
```

> Note : `.update().neq('user_id', '__never__')` est une astuce Supabase pour update ALL accessible rows (RLS limite à 1 = la ligne du user). Plus sûr que `.match({ user_id: <uuid> })` qui dupliquerait `auth.uid()`.

### `src/components/features/TagInput.tsx`

~30 lignes : Input + bouton "+" → onAdd, liste de Badge cliquables → onRemove.

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
        <Button type="button" variant="outline" onClick={add}>
          Ajouter
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-slate-500 hover:text-slate-900"
                aria-label={`Retirer ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
```

### `src/components/features/BrandingForm.tsx`

Section : Input nom + `<input type="color">` + file picker. Upload logo via `supabase.storage.from('branding').upload(${user.id}/logo.png, file, { upsert: true })` puis `getPublicUrl` → `setValue('branding.logo_url', url)`.

### `src/pages/Settings.tsx` (rewrite)

- `useForm<SettingsFormValues>({ resolver: zodResolver(settingsSchema), defaultValues: settings })` — initialiser via `useEffect` quand `useSettings()` data arrive (ou `useForm({ values: settings })` qui re-init auto sur changement).
- 4 cards : Modèles / Prompt / Sources / Branding.
- Bouton "Enregistrer" en bas, `disabled={!isDirty || updateMutation.isPending}`.

### `src/pages/Settings.test.tsx`

Mock `useSettings` retournant defaults DB + mock `useUpdateSettings`. Render → assert section titles présentes + bouton Enregistrer. 1 test optionnel : type dans prompt → submit → mock called avec values.

## Steps

1. `bunx shadcn@latest add textarea select` (idem Task 09 process — bouger `@/` files vers `src/`, trash bogus dir avec `trash`).
2. Créer `lib/openrouter-models.ts`, `lib/schemas/settings-schema.ts`, `hooks/useUpdateSettings.ts`.
3. Créer `components/features/{TagInput, ModelSelectField, BrandingForm}.tsx`.
4. Réécrire `pages/Settings.tsx`.
5. Créer `pages/Settings.test.tsx` (1-2 tests).
6. Validation 4/4 vert, 13+ tests passing.
7. Move spec.

## Non-Goals

- ❌ Diff visuel "ancien vs nouveau" — submit direct.
- ❌ Validation "modèle existe vraiment chez OpenRouter" — V2.
- ❌ Logo crop / resize — upload tel quel < 1MB enforce client-side.
- ❌ Multi-fichier upload (favicon, etc.) — V1 = 1 logo.

## Acceptance grep-testable

- [ ] `bun run typecheck` 0 erreur.
- [ ] `bun run lint` 0 erreur.
- [ ] `bun run test` 13+ passed.
- [ ] `bun run build` OK.
- [ ] `grep -r "console.log" src/pages/Settings.tsx src/components/features/{TagInput,BrandingForm,ModelSelectField}.tsx src/hooks/useUpdateSettings.ts src/lib/schemas/` → vide.
- [ ] `ls src/components/ui/{textarea,select}.tsx` existent (shadcn add).
- [ ] Form pré-rempli avec defaults (test asserte présence du nom branding default).

## Fichiers

- CREATE: `lib/openrouter-models.ts`, `lib/schemas/settings-schema.ts`, `hooks/useUpdateSettings.ts`, 3 features, 2 ui shadcn, `pages/Settings.test.tsx`
- REWRITE: `pages/Settings.tsx`
- MOVE spec
