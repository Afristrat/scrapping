import { useCallback } from 'react'

import { CURRENCIES, useCurrencyStore } from '@/stores/currency'
import { useExchangeRates, FALLBACK_RATES } from '@/hooks/useExchangeRates'

/**
 * Helper de formatting des coûts USD vers la devise choisie par l'utilisateur.
 *
 * Pourquoi ce hook
 * -----------------
 * Les providers LLM (OpenAI, Anthropic, Mistral, etc.) facturent en USD.
 * Tous les coûts persistés en DB (`llm_costs.cost`, `provider_models.pricing_*`)
 * sont en USD. Mais l'utilisateur a un picker de devise dans le header
 * (`CurrencyPicker`) — la page /costs doit respecter ce choix sinon ça
 * surprend.
 *
 * Pipeline de conversion :
 *   USD → EUR via /api Frankfurter (taux ECB, base EUR)  →  devise choisie
 *
 * Frankfurter expose `rates.X` = "combien de X pour 1 EUR". Donc :
 *   eur = usd / rates.USD
 *   target = eur * rates[currency]
 *
 * @returns Fonction `(usdValue, decimals?) → string`. Decimals par défaut 4.
 */
export function useFormatCost(): (usdValue: number, decimals?: number) => string {
  const currency = useCurrencyStore((s) => s.currency)
  const { data: rates } = useExchangeRates()
  const effectiveRates = rates ?? FALLBACK_RATES
  const meta = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0]

  return useCallback(
    (usdValue: number, decimals = 4) => {
      // USD → EUR (rates est `from EUR`, donc rates.USD = combien USD pour 1 EUR)
      const eur = effectiveRates.USD > 0 ? usdValue / effectiveRates.USD : usdValue
      // EUR → devise cible
      const targetValue = eur * (effectiveRates[currency] ?? 1)
      return new Intl.NumberFormat(meta.locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(targetValue)
    },
    [currency, effectiveRates, meta.locale],
  )
}
