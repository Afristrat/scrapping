import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApiKeyProvider } from '@/lib/schemas/api-key-schema'

/**
 * Statut renvoyé par la edge fn `validate-api-key`.
 *
 * - 'verified'      : 2xx — la clé est valide
 * - 'invalid'       : 401/403 — clé refusée
 * - 'rate_limited'  : 429 — provider sature, on ne sait pas dire
 * - 'unreachable'   : timeout / DNS / 5xx — réseau
 */
export type ValidationStatus = 'verified' | 'invalid' | 'rate_limited' | 'unreachable'

export interface ValidationResult {
  ok: boolean
  provider: string
  status: ValidationStatus
  detail?: string
  models_count?: number
  latency_ms: number
}

export interface ValidateApiKeyInput {
  provider: ApiKeyProvider
  api_key: string
  base_url?: string
}

/**
 * Mutation qui ping un provider externe avec une clé pour vérifier sa validité.
 * NE STOCKE PAS la clé — c'est juste un test (utilisé avant `useUpsertApiKey`
 * pour pré-valider, ou via le bouton « Tester » de la UI).
 *
 * Côté backend, l'edge fn ne logge JAMAIS la clé (même tronquée). Seuls
 * `provider` + `status` apparaissent dans `audit_log`.
 */
export function useValidateApiKey() {
  return useMutation<ValidationResult, Error, ValidateApiKeyInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke('validate-api-key', {
        body: input,
      })
      if (error) throw new Error(error.message ?? 'validate_api_key_failed')
      const payload = data as ValidationResult | { error?: string }
      if (payload && 'status' in payload) {
        return payload
      }
      throw new Error(
        ((payload as { error?: string })?.error ?? 'validate_api_key_unknown_response').slice(
          0,
          200,
        ),
      )
    },
  })
}

/**
 * Convertit le statut runtime de la validation vers le statut DB
 * (`user_api_keys.validation_status` accepte uniquement `valid|invalid|unknown`).
 *
 * - 'verified'        → 'valid'
 * - 'invalid'         → 'invalid'
 * - 'rate_limited'    → 'unknown'  (pas concluant — on ne marque pas mauvais)
 * - 'unreachable'     → 'unknown'  (réseau — on ne marque pas mauvais)
 */
export function toDbValidationStatus(s: ValidationStatus): 'valid' | 'invalid' | 'unknown' {
  if (s === 'verified') return 'valid'
  if (s === 'invalid') return 'invalid'
  return 'unknown'
}
