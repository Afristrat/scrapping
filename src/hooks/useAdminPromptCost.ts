/**
 * useAdminPromptCost.ts - Estimation du cout d'un run admin prompt avant
 * de l'executer (Cost Guard).
 *
 * Strategie :
 *   - tokens_estimes = chars / 4 (heuristique standard OpenAI)
 *   - prompt_tokens   = system_prompt + user_prompt_template (tel quel,
 *                       sans substitution car les vars dynamiques sont
 *                       imprevisibles cote front)
 *   - completion_tokens = DEFAULT_COMPLETION_TOKENS (max_tokens cote edge fn)
 *   - cost = prompt_tokens * pricing_input + completion_tokens * pricing_output
 *
 *   - todaySpent  = somme des llm_costs.cost du jour (UTC)
 *   - dailyBudget = settings.daily_budget_usd
 *   - exceedsBudget = (todaySpent + estimatedCost) > dailyBudget
 *
 * Le modele utilise = settings.model_config.monitoring (run-admin-prompt
 * passe task='monitoring' a dispatch-llm). Si non configure, on utilise un
 * fallback prudent (anthropic/claude-haiku-4.5 chez OpenRouter).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useSettings } from '@/hooks/useSettings'
import { useProviderModels, type ProviderModel } from '@/hooks/useProviderModels'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { AdminPrompt } from '@/hooks/useAdminPrompts'

export const DEFAULT_COMPLETION_TOKENS = 2500
export const CHARS_PER_TOKEN = 4

const FALLBACK_PRICING_INPUT_PER_1M = 1 // $/1M tokens, prudent
const FALLBACK_PRICING_OUTPUT_PER_1M = 5

export interface CostEstimate {
  estimatedCost: number
  promptTokens: number
  completionTokens: number
  modelUsed: string | null
  providerUsed: string | null
  pricingFound: boolean
  todaySpent: number
  dailyBudget: number
  exceedsBudget: boolean
}

/**
 * Estime tokens et cout d'un prompt admin pour le modele "monitoring"
 * configure dans settings.model_config.
 */
export function estimateRunCost(
  prompt: AdminPrompt,
  modelInfo: { provider: string | null; model: string | null; pricing: ProviderModel | null },
): {
  estimatedCost: number
  promptTokens: number
  completionTokens: number
  pricingFound: boolean
} {
  const totalChars =
    (prompt.system_prompt?.length ?? 0) + (prompt.user_prompt_template?.length ?? 0)
  const promptTokens = Math.ceil(totalChars / CHARS_PER_TOKEN)
  const completionTokens = DEFAULT_COMPLETION_TOKENS

  const pricing = modelInfo.pricing
  const inputPer1M =
    pricing?.pricing_input_per_1m != null
      ? Number(pricing.pricing_input_per_1m)
      : FALLBACK_PRICING_INPUT_PER_1M
  const outputPer1M =
    pricing?.pricing_output_per_1m != null
      ? Number(pricing.pricing_output_per_1m)
      : FALLBACK_PRICING_OUTPUT_PER_1M

  const cost =
    (promptTokens / 1_000_000) * inputPer1M + (completionTokens / 1_000_000) * outputPer1M

  return {
    estimatedCost: cost,
    promptTokens,
    completionTokens,
    pricingFound: pricing?.pricing_input_per_1m != null,
  }
}

/**
 * Hook React renvoyant l'estimation complete avec todaySpent et budget.
 * Tant que les dependances chargent, retourne `null`.
 */
export function useEstimateRunCost(prompt: AdminPrompt | null): CostEstimate | null {
  const { data: settings } = useSettings()
  const { data: providerModels } = useProviderModels()
  const { data: todaySpent } = useTodayLLMCost()

  return useMemo(() => {
    if (!prompt || !settings) return null

    const monitoring = settings.model_config?.monitoring ?? null
    const provider = monitoring?.provider ?? null
    const model = monitoring?.model ?? null

    const pricing =
      provider && model
        ? ((providerModels ?? []).find((pm) => pm.provider === provider && pm.model_id === model) ??
          null)
        : null

    const { estimatedCost, promptTokens, completionTokens, pricingFound } = estimateRunCost(
      prompt,
      { provider, model, pricing },
    )

    const dailyBudget = Number(settings.daily_budget_usd ?? 0)
    const spent = todaySpent ?? 0
    const exceedsBudget = dailyBudget > 0 && spent + estimatedCost > dailyBudget

    return {
      estimatedCost,
      promptTokens,
      completionTokens,
      modelUsed: model,
      providerUsed: provider,
      pricingFound,
      todaySpent: spent,
      dailyBudget,
      exceedsBudget,
    }
  }, [prompt, settings, providerModels, todaySpent])
}

/**
 * Total cost depense par l'org courante aujourd'hui (UTC).
 * RLS + filtre explicite `org_id` garantissent qu'on ne lit que les lignes
 * de l'org active.
 */
function useTodayLLMCost() {
  const orgId = useCurrentOrgId()
  return useQuery<number>({
    queryKey: ['llm_costs', 'today', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date()
      start.setUTCHours(0, 0, 0, 0)
      const { data, error } = await supabase
        .from('llm_costs')
        .select('cost')
        .eq('org_id', orgId ?? '')
        .gte('ts', start.toISOString())
      if (error) throw error
      const rows = (data ?? []) as Array<{ cost: number | string | null }>
      return rows.reduce((acc, r) => acc + Number(r.cost ?? 0), 0)
    },
  })
}

/**
 * Formatage standard "$0.1234" — affiche au moins 4 decimales pour les
 * couts sub-cent typiques d'un run.
 */
export function formatCostUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost < 0) return '$0.0000'
  return `$${cost.toFixed(4)}`
}
