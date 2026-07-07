// resolve.ts — logique pure de résolution (provider, model) de dispatch-llm.
//
// Isolée du handler HTTP pour être testable sans I/O (pattern parse-score.ts).
//
// Ordre de résolution :
//   1. provider_override + model_override du body (consensus multi-modèles :
//      llm-score-batch envoie un couple par modèle du panel — les ignorer
//      rendait le consensus factice : N appels résolvaient le même modèle).
//   2. settings.model_config[task] (BYOK multi-provider).
//   3. DEFAULT_PROVIDER + DEFAULT_MODEL (OpenRouter first-class).

export const DEFAULT_PROVIDER = 'openrouter'
export const DEFAULT_MODEL = 'openrouter/auto'

export interface ModelConfigEntry {
  provider: string
  model: string
}

export interface SettingsLike {
  model_config?: Record<string, ModelConfigEntry | null> | null
}

export type ResolveSource = 'override' | 'settings' | 'default'

export interface ResolvedModel {
  providerId: string
  modelId: string
  source: ResolveSource
}

export interface ValidatedOverride {
  provider: string | null
  model: string | null
}

export type OverrideValidation =
  | { ok: true; override: ValidatedOverride }
  | { ok: false; detail: string }

// Provider = slug court (mêmes contraintes que providers.ts / user_api_keys.provider).
const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i
// Model id libre (openrouter accepte org/model:variant) mais borné et imprimable.
const MODEL_MAX_LEN = 128

/** true si la chaîne contient un caractère de contrôle (C0 ou DEL). */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return true
  }
  return false
}

/**
 * Valide le couple d'overrides du body. Tout-ou-rien : un override partiel
 * (provider sans model ou l'inverse) est un bug du caller → erreur explicite
 * plutôt qu'une résolution silencieusement bancale.
 */
export function validateOverrides(
  providerOverride: unknown,
  modelOverride: unknown,
): OverrideValidation {
  const hasProvider =
    providerOverride !== undefined && providerOverride !== null && providerOverride !== ''
  const hasModel = modelOverride !== undefined && modelOverride !== null && modelOverride !== ''

  if (!hasProvider && !hasModel) return { ok: true, override: { provider: null, model: null } }
  if (!hasProvider || !hasModel) {
    return {
      ok: false,
      detail: 'provider_override et model_override doivent être fournis ensemble',
    }
  }
  if (typeof providerOverride !== 'string' || !PROVIDER_RE.test(providerOverride)) {
    return { ok: false, detail: 'provider_override invalide (slug attendu)' }
  }
  if (
    typeof modelOverride !== 'string' ||
    modelOverride.length > MODEL_MAX_LEN ||
    hasControlChars(modelOverride)
  ) {
    return { ok: false, detail: `model_override invalide (max ${MODEL_MAX_LEN} chars imprimables)` }
  }
  return { ok: true, override: { provider: providerOverride, model: modelOverride } }
}

/**
 * Résout (provider, model) selon l'ordre override > settings > défaut.
 * Tolère un model_config partiel comme l'implémentation historique
 * (provider seul → model par défaut, et inversement).
 */
export function resolveProviderAndModel(
  settings: SettingsLike,
  task: string,
  override: ValidatedOverride,
): ResolvedModel {
  if (override.provider && override.model) {
    return { providerId: override.provider, modelId: override.model, source: 'override' }
  }

  const taskCfg = settings.model_config?.[task] ?? null
  const providerId: string = taskCfg?.provider ?? DEFAULT_PROVIDER
  const modelId: string = taskCfg?.model || DEFAULT_MODEL
  return { providerId, modelId, source: taskCfg ? 'settings' : 'default' }
}

/**
 * Label de coût écrit dans llm_costs.task (colonne TEXT, CHECK 1-64 chars).
 * Les callers passent un label hiérarchique ('enrich:topic',
 * 'admin_prompt:reddit', …) pour garder l'attribution fine ; à défaut on
 * retombe sur le task de résolution.
 */
export function sanitizeCostTask(costTask: unknown, fallback: string): string {
  if (typeof costTask !== 'string') return fallback
  const trimmed = costTask.trim()
  if (!trimmed || trimmed.length > 64 || hasControlChars(trimmed)) return fallback
  return trimmed
}
