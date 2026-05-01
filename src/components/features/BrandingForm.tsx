import { useRef } from 'react'
import { type Control, Controller, type UseFormSetValue } from 'react-hook-form'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import type { SettingsFormValues } from '@/lib/schemas/settings-schema'

interface Props {
  control: Control<SettingsFormValues>
  setValue: UseFormSetValue<SettingsFormValues>
}

export function BrandingForm({ control, setValue }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = async (file: File) => {
    if (file.size > 1_000_000) {
      toast.error('Logo trop lourd', { description: 'Max 1 MB' })
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Utilisateur non authentifié')
      return
    }

    const { error } = await supabase.storage
      .from('branding')
      .upload(`${user.id}/logo.png`, file, { upsert: true })

    if (error) {
      toast.error('Upload échoué', { description: error.message })
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('branding').getPublicUrl(`${user.id}/logo.png`)

    setValue('branding.logo_url', publicUrl, { shouldDirty: true })
    toast.success('Logo mis à jour')
  }

  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="branding.name"
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <Label htmlFor="branding-name">Nom de l&apos;application</Label>
            <Input id="branding-name" placeholder="Mon Dashboard" {...field} />
            {fieldState.error && <p className="text-xs text-red-500">{fieldState.error.message}</p>}
          </div>
        )}
      />

      <Controller
        control={control}
        name="branding.primary"
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <Label htmlFor="branding-color">Couleur primaire</Label>
            <div className="flex items-center gap-2">
              <input
                id="branding-color"
                type="color"
                className="h-9 w-12 cursor-pointer rounded-md border border-slate-200 p-1"
                {...field}
              />
              <Input
                className="w-28 font-mono"
                placeholder="#3b82f6"
                value={field.value}
                onChange={field.onChange}
              />
            </div>
            {fieldState.error && <p className="text-xs text-red-500">{fieldState.error.message}</p>}
          </div>
        )}
      />

      <div className="space-y-1.5">
        <Label htmlFor="branding-logo">Logo (PNG / JPG, max 1 MB)</Label>
        <input
          id="branding-logo"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleLogoUpload(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm hover:bg-slate-50"
        >
          Choisir un fichier…
        </button>
      </div>
    </div>
  )
}
