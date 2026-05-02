import { useQuery } from '@tanstack/react-query'

import type { ExchangeRates } from '@/lib/pricing'

/**
 * Réponse de l'API publique Frankfurter (taux ECB, gratuite, sans auth).
 * Doc : https://www.frankfurter.app/docs/
 */
interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

/**
 * Taux de fallback (approximations ECB ~ avril 2026) utilisés en
 * `placeholderData` pour que le rendu initial fonctionne même si l'API est
 * lente, et comme `initialData` si la requête échoue côté UI.
 *
 * Garde ces valeurs proches des taux réels — la conversion devise est
 * indicative (pricing factice à la présentation, Stripe charge en EUR).
 */
export const FALLBACK_RATES: ExchangeRates = {
  EUR: 1,
  USD: 1.05,
  GBP: 0.86,
  CHF: 0.95,
  CAD: 1.45,
  AUD: 1.62,
  JPY: 160,
}

/**
 * Récupère les taux de change EUR → autres devises supportées via Frankfurter.
 * - Cache 24 h (`staleTime`) : taux ECB rafraîchis 1x/jour.
 * - GC 7 jours (`gcTime`) : on garde le cache en navigation rapide.
 * - `placeholderData` synchrone : pas d'état undefined côté composants.
 * - 1 retry max : si l'API tombe, on garde les valeurs de fallback sans
 *   bloquer l'UI ni multiplier les appels.
 */
export function useExchangeRates(): ReturnType<typeof useQuery<ExchangeRates>> {
  return useQuery<ExchangeRates>({
    queryKey: ['exchange_rates', 'EUR'],
    queryFn: async () => {
      const res = await fetch('https://api.frankfurter.app/latest?from=EUR')
      if (!res.ok) throw new Error('rates_unavailable')
      const data = (await res.json()) as FrankfurterResponse
      return {
        EUR: 1,
        USD: data.rates.USD ?? FALLBACK_RATES.USD,
        GBP: data.rates.GBP ?? FALLBACK_RATES.GBP,
        CHF: data.rates.CHF ?? FALLBACK_RATES.CHF,
        CAD: data.rates.CAD ?? FALLBACK_RATES.CAD,
        AUD: data.rates.AUD ?? FALLBACK_RATES.AUD,
        JPY: data.rates.JPY ?? FALLBACK_RATES.JPY,
      }
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
    placeholderData: FALLBACK_RATES,
  })
}
