import { useProviderModels } from '@/hooks/useProviderModels'

export interface BacktestCostEstimate {
  estimatedCost: number
  tokensIn: number
  tokensOut: number
}

/**
 * Estime le coût d'un backtest avant de le lancer.
 *
 * Formule :
 *   tokensIn  = signalCount * (rubricPrompt.length / 4 + 200)
 *   tokensOut = signalCount * 100
 *   cost      = (tokensIn / 1_000_000) * pricing_input + (tokensOut / 1_000_000) * pricing_output
 *
 * Retourne des valeurs à 0 si le modèle est introuvable ou si le pricing est absent.
 * La conversion de devise est faite par le composant via useFormatCost.
 */
export function useBacktestCostEstimate(
  rubricPrompt: string,
  modelId: string,
  signalCount: number,
): BacktestCostEstimate {
  const { data: models } = useProviderModels()

  const tokensIn = Math.round(signalCount * (rubricPrompt.length / 4 + 200))
  const tokensOut = signalCount * 100

  const model = (models ?? []).find((m) => m.model_id === modelId)
  const pricingIn = model?.pricing_input_per_1m ?? 0
  const pricingOut = model?.pricing_output_per_1m ?? 0

  const estimatedCost =
    (tokensIn / 1_000_000) * pricingIn + (tokensOut / 1_000_000) * pricingOut

  return { estimatedCost, tokensIn, tokensOut }
}
