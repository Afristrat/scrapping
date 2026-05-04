import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { DEFAULT_BRANDING, useSettings } from '@/hooks/useSettings'
import { useCommandPalette } from '@/stores/commandPalette'
import { CurrencyPicker } from './CurrencyPicker'
import { OrgSelector } from './OrgSelector'

export function BrandedHeader() {
  const { data: settings } = useSettings()
  const branding = settings?.branding ?? DEFAULT_BRANDING
  const { toggle } = useCommandPalette()

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

      <button
        type="button"
        onClick={toggle}
        className="border-outline-variant text-on-surface-variant hover:bg-surface-container hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors sm:flex"
        aria-label="Ouvrir la palette de commandes (⌘K)"
      >
        <span>Rechercher…</span>
        <kbd className="bg-surface-container rounded px-1 py-0.5 font-mono text-[10px] leading-none">
          ⌘K
        </kbd>
      </button>

      <CurrencyPicker />
    </header>
  )
}
