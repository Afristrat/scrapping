import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { DEFAULT_BRANDING, useSettings } from '@/hooks/useSettings'

export function BrandedHeader() {
  const { data: settings } = useSettings()
  const branding = settings?.branding ?? DEFAULT_BRANDING

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', branding.primary)
  }, [branding.primary])

  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-6">
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 rounded object-cover"
        />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded text-white"
          style={{ backgroundColor: branding.primary }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <h1 className="text-lg font-semibold text-slate-900">{branding.name}</h1>
    </header>
  )
}
