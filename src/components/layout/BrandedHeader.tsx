import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { DEFAULT_BRANDING, useSettings } from '@/hooks/useSettings'
import { CurrencyPicker } from './CurrencyPicker'
import { OrgSelector } from './OrgSelector'

export function BrandedHeader() {
  const { data: settings } = useSettings()
  const branding = settings?.branding ?? DEFAULT_BRANDING

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', branding.primary)
  }, [branding.primary])

  return (
    <header className="bg-surface-container-lowest border-outline-variant flex h-14 items-center gap-3 border-b px-6">
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 rounded-lg object-cover"
        />
      ) : (
        <div
          className="text-on-primary flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: branding.primary }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <h1 className="text-on-surface text-lg font-bold tracking-tight">{branding.name}</h1>

      <div className="bg-outline-variant ml-3 h-6 w-px" aria-hidden="true" />
      <OrgSelector />

      <div className="flex-1" />
      <CurrencyPicker />
    </header>
  )
}
