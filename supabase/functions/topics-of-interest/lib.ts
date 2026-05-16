/**
 * topics-of-interest/lib.ts — Pure helpers (validation, normalization).
 * Pas d'IO, testable sans booter de listener HTTP.
 */

export const SUPPORTED_LANGS = ['fr', 'en', 'ar'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export const SUPPORTED_CRONS = ['daily', 'weekly', 'monthly', 'paused'] as const
export type CollectCron = (typeof SUPPORTED_CRONS)[number]

export const SUPPORTED_STATUSES = ['collecting', 'ready', 'error', 'paused'] as const
export type Status = (typeof SUPPORTED_STATUSES)[number]

const SEED_MIN = 50
const SEED_MAX = 3000
const SEEDS_MIN = 1
const SEEDS_MAX = 5
const NAME_MIN = 1
const NAME_MAX = 120

export interface CreateBody {
  name: string
  seeds: string[]
  lang: Lang
  sector_hint?: string
  scope_profile?: string
  hints_override?: HintsOverride
  collect_cron?: CollectCron
}

export interface PatchBody {
  name?: string
  seeds?: string[]
  lang?: Lang
  sector_hint?: string | null
  scope_profile?: string | null
  hints_override?: HintsOverride | null
  collect_cron?: CollectCron
  status?: Status
}

export interface HintsOverride {
  x_handles?: string[]
  reddit_subs?: string[]
  arxiv_categories?: string[]
  rss_keywords?: string[]
}

export interface ValidationOk<T> {
  ok: true
  body: T
}
export interface ValidationFail {
  ok: false
  error: string
}
export type ValidationResult<T> = ValidationOk<T> | ValidationFail

const SCOPE_PROFILE_RE = /^[a-zA-Z0-9_-]{1,80}$/

export function validateCreateBody(raw: unknown): ValidationResult<CreateBody> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' }
  }
  const obj = raw as Record<string, unknown>

  // name
  if (typeof obj.name !== 'string') return { ok: false, error: 'name_required' }
  const name = obj.name.trim()
  if (name.length < NAME_MIN) return { ok: false, error: 'name_too_short' }
  if (name.length > NAME_MAX) return { ok: false, error: 'name_too_long' }

  // seeds
  const seedsValidation = validateSeedsArray(obj.seeds)
  if (!seedsValidation.ok) return seedsValidation
  const seeds = seedsValidation.value

  // lang
  if (typeof obj.lang !== 'string' || !(SUPPORTED_LANGS as readonly string[]).includes(obj.lang)) {
    return { ok: false, error: 'lang_unsupported' }
  }

  // sector_hint
  let sector_hint: string | undefined
  if (obj.sector_hint !== undefined && obj.sector_hint !== null) {
    if (typeof obj.sector_hint !== 'string') {
      return { ok: false, error: 'sector_hint_must_be_string' }
    }
    sector_hint = obj.sector_hint.slice(0, 200)
  }

  // scope_profile
  let scope_profile: string | undefined
  if (obj.scope_profile !== undefined && obj.scope_profile !== null) {
    if (typeof obj.scope_profile !== 'string') {
      return { ok: false, error: 'scope_profile_must_be_string' }
    }
    const sp = obj.scope_profile.trim()
    if (sp.length === 0) {
      // Empty string = effectively null
    } else if (!SCOPE_PROFILE_RE.test(sp)) {
      return { ok: false, error: 'scope_profile_invalid_chars' }
    } else {
      scope_profile = sp
    }
  }

  // hints_override
  const hintsResult = validateHintsOverride(obj.hints_override)
  if (!hintsResult.ok) return hintsResult
  const hints_override = hintsResult.value

  // collect_cron
  let collect_cron: CollectCron = 'weekly'
  if (obj.collect_cron !== undefined && obj.collect_cron !== null) {
    if (
      typeof obj.collect_cron !== 'string' ||
      !(SUPPORTED_CRONS as readonly string[]).includes(obj.collect_cron)
    ) {
      return { ok: false, error: 'collect_cron_invalid' }
    }
    collect_cron = obj.collect_cron as CollectCron
  }

  return {
    ok: true,
    body: {
      name,
      seeds,
      lang: obj.lang as Lang,
      ...(sector_hint !== undefined ? { sector_hint } : {}),
      ...(scope_profile !== undefined ? { scope_profile } : {}),
      ...(hints_override !== undefined ? { hints_override } : {}),
      collect_cron,
    },
  }
}

export function validatePatchBody(raw: unknown): ValidationResult<PatchBody> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' }
  }
  const obj = raw as Record<string, unknown>
  const patch: PatchBody = {}

  if (obj.name !== undefined) {
    if (typeof obj.name !== 'string') return { ok: false, error: 'name_must_be_string' }
    const n = obj.name.trim()
    if (n.length < NAME_MIN || n.length > NAME_MAX) {
      return { ok: false, error: 'name_length_invalid' }
    }
    patch.name = n
  }

  if (obj.seeds !== undefined) {
    const r = validateSeedsArray(obj.seeds)
    if (!r.ok) return r
    patch.seeds = r.value
  }

  if (obj.lang !== undefined) {
    if (
      typeof obj.lang !== 'string' ||
      !(SUPPORTED_LANGS as readonly string[]).includes(obj.lang)
    ) {
      return { ok: false, error: 'lang_unsupported' }
    }
    patch.lang = obj.lang as Lang
  }

  if (obj.sector_hint !== undefined) {
    if (obj.sector_hint === null) {
      patch.sector_hint = null
    } else if (typeof obj.sector_hint !== 'string') {
      return { ok: false, error: 'sector_hint_must_be_string' }
    } else {
      patch.sector_hint = obj.sector_hint.slice(0, 200)
    }
  }

  if (obj.scope_profile !== undefined) {
    if (obj.scope_profile === null) {
      patch.scope_profile = null
    } else if (typeof obj.scope_profile !== 'string') {
      return { ok: false, error: 'scope_profile_must_be_string' }
    } else {
      const sp = obj.scope_profile.trim()
      if (sp.length === 0) {
        patch.scope_profile = null
      } else if (!SCOPE_PROFILE_RE.test(sp)) {
        return { ok: false, error: 'scope_profile_invalid_chars' }
      } else {
        patch.scope_profile = sp
      }
    }
  }

  if (obj.hints_override !== undefined) {
    if (obj.hints_override === null) {
      patch.hints_override = null
    } else {
      const r = validateHintsOverride(obj.hints_override)
      if (!r.ok) return r
      patch.hints_override = r.value ?? null
    }
  }

  if (obj.collect_cron !== undefined) {
    if (
      typeof obj.collect_cron !== 'string' ||
      !(SUPPORTED_CRONS as readonly string[]).includes(obj.collect_cron)
    ) {
      return { ok: false, error: 'collect_cron_invalid' }
    }
    patch.collect_cron = obj.collect_cron as CollectCron
  }

  if (obj.status !== undefined) {
    if (
      typeof obj.status !== 'string' ||
      !(SUPPORTED_STATUSES as readonly string[]).includes(obj.status)
    ) {
      return { ok: false, error: 'status_invalid' }
    }
    patch.status = obj.status as Status
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'patch_body_empty' }
  }
  return { ok: true, body: patch }
}

interface InternalArrayResult {
  ok: true
  value: string[]
}
function validateSeedsArray(raw: unknown): InternalArrayResult | ValidationFail {
  if (!Array.isArray(raw)) return { ok: false, error: 'seeds_must_be_array' }
  if (raw.length < SEEDS_MIN) return { ok: false, error: 'seeds_too_few' }
  if (raw.length > SEEDS_MAX) return { ok: false, error: 'seeds_too_many' }
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]
    if (typeof s !== 'string') return { ok: false, error: `seeds[${i}]_must_be_string` }
    const trimmed = s.trim()
    if (trimmed.length < SEED_MIN) return { ok: false, error: `seeds[${i}]_too_short` }
    if (trimmed.length > SEED_MAX) return { ok: false, error: `seeds[${i}]_too_long` }
    out.push(trimmed)
  }
  return { ok: true, value: out }
}

interface HintsOverrideValidationResult {
  ok: true
  value?: HintsOverride
}
function validateHintsOverride(raw: unknown): HintsOverrideValidationResult | ValidationFail {
  if (raw === undefined || raw === null) return { ok: true }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'hints_override_must_be_object' }
  }
  const ho = raw as Record<string, unknown>
  const allowed: Array<keyof HintsOverride> = [
    'x_handles',
    'reddit_subs',
    'arxiv_categories',
    'rss_keywords',
  ]
  const normalized: HintsOverride = {}
  for (const f of allowed) {
    const v = ho[f]
    if (v === undefined || v === null) continue
    if (!Array.isArray(v)) return { ok: false, error: `hints_override.${f}_must_be_array` }
    const clean = (v as unknown[])
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 80))
      .slice(0, 20)
    if (clean.length > 0) normalized[f] = clean
  }
  if (Object.keys(normalized).length === 0) return { ok: true }
  return { ok: true, value: normalized }
}

/**
 * Calcule la prochaine next_collect_at en fonction du cron.
 *  - daily : +1 jour
 *  - weekly : +7 jours
 *  - monthly : +30 jours
 *  - paused : null (status devient paused)
 */
export function computeNextCollectAt(cron: CollectCron, fromDate: Date = new Date()): Date | null {
  if (cron === 'paused') return null
  const out = new Date(fromDate)
  const days = cron === 'daily' ? 1 : cron === 'weekly' ? 7 : 30
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

/** Schéma d'identification d'un changement de seeds (déclenche re-embed + purge archive). */
export function seedsChanged(oldSeeds: string[] | null | undefined, newSeeds: string[]): boolean {
  if (!Array.isArray(oldSeeds)) return true
  if (oldSeeds.length !== newSeeds.length) return true
  for (let i = 0; i < oldSeeds.length; i++) {
    if (oldSeeds[i] !== newSeeds[i]) return true
  }
  return false
}
