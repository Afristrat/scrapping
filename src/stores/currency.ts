import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Devises supportées côté présentation. Les prix backend (Stripe, pricing.ts)
 * restent stockés et facturés en EUR — la conversion est purement UI.
 */
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CAD' | 'AUD' | 'JPY'

export interface CurrencyMeta {
  code: CurrencyCode
  symbol: string
  name: string
  flag: string
  /** Locale Intl.NumberFormat associée. */
  locale: string
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', locale: 'fr-FR' },
  { code: 'USD', symbol: '$', name: 'Dollar US', flag: '🇺🇸', locale: 'en-US' },
  { code: 'GBP', symbol: '£', name: 'Livre sterling', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'CHF', symbol: 'CHF', name: 'Franc suisse', flag: '🇨🇭', locale: 'fr-CH' },
  { code: 'CAD', symbol: 'CA$', name: 'Dollar canadien', flag: '🇨🇦', locale: 'fr-CA' },
  { code: 'AUD', symbol: 'A$', name: 'Dollar australien', flag: '🇦🇺', locale: 'en-AU' },
  { code: 'JPY', symbol: '¥', name: 'Yen japonais', flag: '🇯🇵', locale: 'ja-JP' },
]

export const SUPPORTED_CURRENCY_CODES: ReadonlyArray<CurrencyCode> = CURRENCIES.map((c) => c.code)

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCY_CODES as ReadonlyArray<string>).includes(value)
}

/**
 * Détecte la devise initiale en fonction de `navigator.language`.
 * Fallback EUR si l'environnement n'expose pas `navigator` (SSR / tests).
 */
export function detectInitialCurrency(): CurrencyCode {
  if (typeof navigator === 'undefined') return 'EUR'
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('en-us')) return 'USD'
  if (lang.startsWith('en-gb')) return 'GBP'
  if (lang.startsWith('de-ch') || lang.startsWith('fr-ch') || lang.startsWith('it-ch')) return 'CHF'
  if (lang.startsWith('en-ca') || lang.startsWith('fr-ca')) return 'CAD'
  if (lang.startsWith('en-au')) return 'AUD'
  if (lang.startsWith('ja')) return 'JPY'
  return 'EUR'
}

interface CurrencyState {
  currency: CurrencyCode
  setCurrency: (c: CurrencyCode) => void
}

/**
 * Store Zustand persisté sous la clé `kairos-currency`. Détecte la devise
 * initiale via `navigator.language` et la garde dans `localStorage` pour
 * persister le choix utilisateur entre sessions.
 */
export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: detectInitialCurrency(),
      setCurrency: (currency) => set({ currency }),
    }),
    { name: 'kairos-currency' },
  ),
)
