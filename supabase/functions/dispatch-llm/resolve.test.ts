// Tests Deno — resolve.ts (résolution provider/model + overrides + cost_task)
//
// Exécution : deno test --allow-env --node-modules-dir=auto supabase/functions/dispatch-llm/resolve.test.ts

import { assertEquals } from 'jsr:@std/assert@1'
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  resolveProviderAndModel,
  sanitizeCostTask,
  validateOverrides,
  type SettingsLike,
} from './resolve.ts'

const NO_OVERRIDE = { provider: null, model: null }

// ─── validateOverrides ───────────────────────────────────────────────────────

Deno.test('validateOverrides : absents → ok sans override', () => {
  const v = validateOverrides(undefined, undefined)
  assertEquals(v, { ok: true, override: NO_OVERRIDE })
})

Deno.test('validateOverrides : chaînes vides → traitées comme absentes', () => {
  const v = validateOverrides('', '')
  assertEquals(v, { ok: true, override: NO_OVERRIDE })
})

Deno.test('validateOverrides : couple valide → accepté', () => {
  const v = validateOverrides('anthropic', 'claude-haiku-4-5')
  assertEquals(v, { ok: true, override: { provider: 'anthropic', model: 'claude-haiku-4-5' } })
})

Deno.test('validateOverrides : model openrouter avec / et : → accepté', () => {
  const v = validateOverrides('openrouter', 'deepseek/deepseek-chat-v3:free')
  assertEquals(v.ok, true)
})

Deno.test('validateOverrides : partiel (provider seul) → rejeté', () => {
  const v = validateOverrides('anthropic', undefined)
  assertEquals(v.ok, false)
})

Deno.test('validateOverrides : partiel (model seul) → rejeté', () => {
  const v = validateOverrides(undefined, 'gpt-4o')
  assertEquals(v.ok, false)
})

Deno.test('validateOverrides : provider non-slug → rejeté', () => {
  assertEquals(validateOverrides('anthro pic', 'model-x').ok, false)
  assertEquals(validateOverrides('anthropic;DROP', 'model-x').ok, false)
  assertEquals(validateOverrides(42, 'model-x').ok, false)
})

Deno.test('validateOverrides : model trop long ou avec contrôle → rejeté', () => {
  assertEquals(validateOverrides('openrouter', 'x'.repeat(129)).ok, false)
  assertEquals(validateOverrides('openrouter', 'model\nx').ok, false)
})

// ─── resolveProviderAndModel ─────────────────────────────────────────────────

Deno.test('resolve : override prioritaire sur settings', () => {
  const settings: SettingsLike = {
    model_config: { scoring: { provider: 'openai', model: 'gpt-4o-mini' } },
  }
  const r = resolveProviderAndModel(settings, 'scoring', {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
  })
  assertEquals(r, { providerId: 'anthropic', modelId: 'claude-haiku-4-5', source: 'override' })
})

Deno.test('resolve : settings.model_config[task] sans override', () => {
  const settings: SettingsLike = {
    model_config: { scoring: { provider: 'openai', model: 'gpt-4o-mini' } },
  }
  const r = resolveProviderAndModel(settings, 'scoring', NO_OVERRIDE)
  assertEquals(r, { providerId: 'openai', modelId: 'gpt-4o-mini', source: 'settings' })
})

Deno.test('resolve : ni override ni config → défauts OpenRouter', () => {
  const r = resolveProviderAndModel({ model_config: null }, 'digest', NO_OVERRIDE)
  assertEquals(r, { providerId: DEFAULT_PROVIDER, modelId: DEFAULT_MODEL, source: 'default' })
})

Deno.test('resolve : config task null → défauts', () => {
  const settings: SettingsLike = { model_config: { digest: null } }
  const r = resolveProviderAndModel(settings, 'digest', NO_OVERRIDE)
  assertEquals(r, { providerId: DEFAULT_PROVIDER, modelId: DEFAULT_MODEL, source: 'default' })
})

Deno.test('resolve : config partielle (model vide) → model par défaut, provider gardé', () => {
  const settings: SettingsLike = {
    model_config: { scoring: { provider: 'groq', model: '' } },
  }
  const r = resolveProviderAndModel(settings, 'scoring', NO_OVERRIDE)
  assertEquals(r, { providerId: 'groq', modelId: DEFAULT_MODEL, source: 'settings' })
})

// ─── sanitizeCostTask ────────────────────────────────────────────────────────

Deno.test('sanitizeCostTask : label valide → gardé (trimé)', () => {
  assertEquals(sanitizeCostTask(' enrich:topic ', 'enrichment'), 'enrich:topic')
})

Deno.test('sanitizeCostTask : absent / non-string / vide → fallback', () => {
  assertEquals(sanitizeCostTask(undefined, 'scoring'), 'scoring')
  assertEquals(sanitizeCostTask(42, 'scoring'), 'scoring')
  assertEquals(sanitizeCostTask('   ', 'scoring'), 'scoring')
})

Deno.test('sanitizeCostTask : > 64 chars ou contrôle → fallback', () => {
  assertEquals(sanitizeCostTask('x'.repeat(65), 'scoring'), 'scoring')
  assertEquals(sanitizeCostTask('bad\tlabel', 'scoring'), 'scoring')
})
