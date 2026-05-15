/**
 * research-from-seed — Pure helpers (validation, hash, rate limit, scrape
 * routing, top-N selection, internal-call helper).
 *
 * Séparé du handler `Deno.serve` pour rester importable proprement par
 * les tests sans booter de listener HTTP.
 *
 * BYOK strict — aucun modèle imposé. Toute la logique LLM passe par
 * dispatch-llm dans le handler ; ce fichier ne fait que de la mécanique.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Constantes — budgets timeout par étape (ms)
// ---------------------------------------------------------------------------

export const STAGE_TIMEOUTS_MS = {
  research_strategist: 120_000,
  // rubric-architect fait jusqu'à 2 appels LLM (prompt + retry sur
  // schema_validation) sur un prompt riche (4-8 critères + soft_boosts
  // + disqualifiers + calibration_examples). 60s timeoutait sur
  // DeepSeek-v4-flash pour graines politico-sociales complexes
  // (cf. session 2b5e6ec9 2026-05-13). Bumpé à 120s pour permettre
  // le retry sans dépasser le gateway Edge.
  rubric_architect: 120_000,
  scrape: 90_000,
  score: 90_000,
  // signal-synthesizer fait jusqu'à 2 appels LLM (prompt + retry sur
  // validation) sur un prompt riche (30-80 signaux). Sur graines
  // complexes le pipeline réel tape 80-90s — 90s produisait des
  // STAGE_TIMEOUT (cf. session 3293d2ef). Bumpé à 150s pour permettre
  // le retry sans dépasser le gateway Supabase Edge (~150s).
  synthesize: 150_000,
  audit: 60_000,
} as const

export type Stage = keyof typeof STAGE_TIMEOUTS_MS

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SUPPORTED_LANGS = ['fr', 'en', 'ar'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

/**
 * F-Hints-Override 2026-05-15 — hints fournis directement par le caller
 * (Bassira) pour bypass / compléter la stratégie auto. Mergés AVEC les
 * hints émis par research-strategist : on agrège, on ne remplace pas.
 * Permet à Bassira d'imposer des sources niches (Maroc, MENA, etc.) que
 * DeepSeek-v4-flash ne génère pas spontanément. Borne : ≤ 20 entrées
 * par catégorie pour limiter l'amplification scrape.
 */
export interface HintsOverride {
  x_handles?: string[]
  reddit_subs?: string[]
  arxiv_categories?: string[]
  rss_keywords?: string[]
}

export interface RequestBody {
  seed: string
  lang: Lang
  sector_hint?: string
  depth_hint?: 0 | 1 | 2
  output_profile?: string
  hints_override?: HintsOverride
  /**
   * F-Profile 2026-05-15 — nom OU uuid d'un scope_profile pré-curated
   * stocké en DB (table scope_profiles). Fetched + mergé après hints_override.
   * Permet à Bassira de référencer un profil de coverage Maroc/MENA réutilisable.
   */
  scope_profile?: string
}

export interface ApiKeyRow {
  id: string
  name: string
  key_hash: string
  key_prefix: string
  scopes: string[]
  rate_limit_per_min: number
  daily_budget_usd: number | null
  active: boolean
  proxy_user_id: string | null
}

export interface ApiKeyValidation {
  ok: true
  key: ApiKeyRow
}
export interface ApiKeyValidationFail {
  ok: false
  error: 'invalid_api_key' | 'inactive' | 'scope_missing' | 'proxy_user_not_configured'
  status: number
}
export type ApiKeyValidationResult = ApiKeyValidation | ApiKeyValidationFail

// ---------------------------------------------------------------------------
// Body validation
// ---------------------------------------------------------------------------

const SEED_MIN = 50
const SEED_MAX = 3000

export interface BodyValidationOk {
  ok: true
  body: RequestBody
}
export interface BodyValidationFail {
  ok: false
  error: string
}
export type BodyValidationResult = BodyValidationOk | BodyValidationFail

export function validateRequestBody(raw: unknown): BodyValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' }
  }
  const obj = raw as Record<string, unknown>

  const seed = obj.seed
  if (typeof seed !== 'string') return { ok: false, error: 'seed_required' }
  const trimmed = seed.trim()
  if (trimmed.length < SEED_MIN) return { ok: false, error: 'seed_too_short' }
  if (trimmed.length > SEED_MAX) return { ok: false, error: 'seed_too_long' }

  const lang = obj.lang
  if (typeof lang !== 'string' || !(SUPPORTED_LANGS as readonly string[]).includes(lang)) {
    return { ok: false, error: 'lang_unsupported' }
  }

  let sector_hint: string | undefined
  if (obj.sector_hint !== undefined && obj.sector_hint !== null) {
    if (typeof obj.sector_hint !== 'string') {
      return { ok: false, error: 'sector_hint_must_be_string' }
    }
    sector_hint = obj.sector_hint.slice(0, 200)
  }

  let depth_hint: 0 | 1 | 2 | undefined
  if (obj.depth_hint !== undefined && obj.depth_hint !== null) {
    if (
      typeof obj.depth_hint !== 'number' ||
      !Number.isInteger(obj.depth_hint) ||
      obj.depth_hint < 0 ||
      obj.depth_hint > 2
    ) {
      return { ok: false, error: 'depth_hint_invalid' }
    }
    depth_hint = obj.depth_hint as 0 | 1 | 2
  }

  // output_profile : optionnel, accepté brut pour traçabilité côté
  // research_sessions.output_profile (page /admin/api-inbound). Le pipeline
  // continue à forcer 'light' côté signal-synthesizer — ce champ sert
  // uniquement à savoir ce que le caller a demandé.
  let output_profile: string | undefined
  if (obj.output_profile !== undefined && obj.output_profile !== null) {
    if (typeof obj.output_profile !== 'string') {
      return { ok: false, error: 'output_profile_must_be_string' }
    }
    output_profile = obj.output_profile.slice(0, 32)
  }

  // F-Hints-Override 2026-05-15 : validation du hints_override optionnel.
  // Chaque catégorie : array de strings ≤ 20 items, chaque item ≤ 80 chars.
  // Strip @ / r/ prefix sur les handles/subs pour normaliser.
  let hints_override: HintsOverride | undefined
  if (obj.hints_override !== undefined && obj.hints_override !== null) {
    if (typeof obj.hints_override !== 'object' || Array.isArray(obj.hints_override)) {
      return { ok: false, error: 'hints_override_must_be_object' }
    }
    const ho = obj.hints_override as Record<string, unknown>
    const normalized: HintsOverride = {}
    const fields: Array<keyof HintsOverride> = [
      'x_handles',
      'reddit_subs',
      'arxiv_categories',
      'rss_keywords',
    ]
    for (const f of fields) {
      const v = ho[f]
      if (v === undefined || v === null) continue
      if (!Array.isArray(v)) {
        return { ok: false, error: `hints_override.${f}_must_be_array` }
      }
      const clean = (v as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim().replace(/^@/, '').replace(/^r\//i, '').slice(0, 80))
        .slice(0, 20)
      if (clean.length > 0) normalized[f] = clean
    }
    if (Object.keys(normalized).length > 0) hints_override = normalized
  }

  // F-Profile : scope_profile name ou uuid — validation surface seulement
  // (lookup DB fait dans l'orchestrateur, qui retournera 400 scope_profile_not_found
  // si invalide).
  let scope_profile: string | undefined
  if (obj.scope_profile !== undefined && obj.scope_profile !== null) {
    if (typeof obj.scope_profile !== 'string') {
      return { ok: false, error: 'scope_profile_must_be_string' }
    }
    const sp = obj.scope_profile.trim()
    if (sp.length === 0 || sp.length > 80) {
      return { ok: false, error: 'scope_profile_invalid' }
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(sp)) {
      return { ok: false, error: 'scope_profile_invalid_chars' }
    }
    scope_profile = sp
  }

  return {
    ok: true,
    body: {
      seed: trimmed,
      lang: lang as Lang,
      ...(sector_hint !== undefined ? { sector_hint } : {}),
      ...(depth_hint !== undefined ? { depth_hint } : {}),
      ...(output_profile !== undefined ? { output_profile } : {}),
      ...(hints_override !== undefined ? { hints_override } : {}),
      ...(scope_profile !== undefined ? { scope_profile } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// API-key hash + validation
// ---------------------------------------------------------------------------

/**
 * Hash SHA-256 (hex lowercase) — comparé en DB sur public_api_keys.key_hash.
 * Le caller doit passer la clé brute (incluant son préfixe `bsr_`).
 */
export async function hashApiKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Comparaison constant-time pour deux strings de même longueur.
 * Évite les attaques de timing sur la validation de hash.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Valide une clé API publique :
 *   1. Hash + lookup par key_hash.
 *   2. Vérifie active=true.
 *   3. Vérifie 'research-only' présent dans scopes.
 *   4. Touche last_used_at (best-effort, pas bloquant).
 *
 * Le hash en DB est comparé en CONSTANT-TIME malgré l'unique-index pour
 * limiter la surface de timing même si plusieurs hash colliderent (cas pas
 * possible en théorie sha256, mais ceinture+bretelles).
 */
export async function validateApiKey(
  supabase: SupabaseClient,
  providedKey: string,
): Promise<ApiKeyValidationResult> {
  if (typeof providedKey !== 'string' || providedKey.length < 16) {
    return { ok: false, error: 'invalid_api_key', status: 401 }
  }

  const hash = await hashApiKey(providedKey)

  const { data, error } = await supabase
    .from('public_api_keys')
    .select(
      'id, name, key_hash, key_prefix, scopes, rate_limit_per_min, daily_budget_usd, active, proxy_user_id',
    )
    .eq('key_hash', hash)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: 'invalid_api_key', status: 401 }
  }

  const row = data as ApiKeyRow

  // Constant-time confirmation (défensif : si index permet collision théorique).
  if (!constantTimeEquals(row.key_hash, hash)) {
    return { ok: false, error: 'invalid_api_key', status: 401 }
  }

  if (!row.active) {
    return { ok: false, error: 'inactive', status: 401 }
  }

  if (!Array.isArray(row.scopes) || !row.scopes.includes('research-only')) {
    return { ok: false, error: 'scope_missing', status: 403 }
  }

  if (!row.proxy_user_id) {
    return { ok: false, error: 'proxy_user_not_configured', status: 500 }
  }

  // Best-effort : touche last_used_at sans bloquer le pipeline si ça rate.
  supabase
    .from('public_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(
      () => {},
      () => {},
    )

  return { ok: true, key: row }
}

// ---------------------------------------------------------------------------
// Rate limit sliding window 60s
// ---------------------------------------------------------------------------

/**
 * Sliding-window rate limit : enregistre un hit, compte les hits des 60
 * dernières secondes pour cette clé, retourne true si sous la limite.
 *
 * Ordre volontaire : on RECORD AVANT de count, ainsi le hit courant est
 * toujours inclus dans le compte (limite atteinte = rejet du hit courant).
 *
 * Returns true if allowed, false if rate-limited.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  apiKeyId: string,
  limitPerMin: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const nowIso = new Date(nowMs).toISOString()
  const windowStartIso = new Date(nowMs - 60_000).toISOString()

  // Record current hit (best-effort — si insert fail on bloque par sécurité)
  const insertRes = await supabase
    .from('public_api_rate_hits')
    .insert({ api_key_id: apiKeyId, hit_at: nowIso })

  if (insertRes.error) {
    // Si on ne peut pas tracer le hit on refuse plutôt que d'ouvrir un trou.
    return false
  }

  const { count, error } = await supabase
    .from('public_api_rate_hits')
    .select('api_key_id', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('hit_at', windowStartIso)

  if (error) return false
  if (typeof count !== 'number') return false

  return count <= limitPerMin
}

// ---------------------------------------------------------------------------
// Internal call helper (pour appeler les autres edge fns de Kairos)
// ---------------------------------------------------------------------------

export interface InternalCallOk<T> {
  ok: true
  status: number
  data: T
  durationMs: number
}
export interface InternalCallErr {
  ok: false
  status: number
  error: string
  detail?: string
  /**
   * Detailed validation errors propagated from the upstream edge fn.
   * Populated when the upstream body carries an `errors` array (typical
   * of rubric-architect schema_validation_failed or signal-synthesizer
   * validation_failed_after_retry). Lets the orchestrator surface the
   * exact failure cause to the Bassira frontend without forcing the
   * operator to dig in Edge logs.
   */
  errors?: unknown[]
  durationMs: number
}
export type InternalCallResult<T> = InternalCallOk<T> | InternalCallErr

/**
 * Appel HTTP vers une edge fn interne, avec timeout strict + propagation
 * du JSON body. Pas de retry implicite ici — le caller décide selon le
 * type de l'étape (idempotence partielle).
 */
export async function callInternal<T>(
  url: string,
  body: unknown,
  serviceJwt: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  extraHeaders: Record<string, string> = {},
): Promise<InternalCallResult<T>> {
  const startedAt = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceJwt}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    clearTimeout(timer)

    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null
    } catch {
      parsed = null
    }

    if (!res.ok) {
      const errBody = parsed as { error?: string; detail?: string; errors?: unknown[] } | null
      return {
        ok: false,
        status: res.status,
        error: errBody?.error ?? `http_${res.status}`,
        detail: errBody?.detail,
        errors: Array.isArray(errBody?.errors) ? errBody.errors : undefined,
        durationMs: Date.now() - startedAt,
      }
    }

    return {
      ok: true,
      status: res.status,
      data: parsed as T,
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    clearTimeout(timer)
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      error: isAbort ? 'timeout' : 'fetch_failed',
      detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
      durationMs: Date.now() - startedAt,
    }
  }
}

// ---------------------------------------------------------------------------
// Scrape routing — research_strategy → liste de jobs scrapers
// ---------------------------------------------------------------------------

interface SubjectXHandle {
  handle: string
  lang?: string
  confident?: boolean
}
interface SubjectRedditHint {
  sub: string
  confident?: boolean
}
interface SubjectShape {
  id: string
  rss_keywords?: unknown
  x_handles_hint?: unknown
  reddit_subs_hint?: unknown
  arxiv_categories_hint?: unknown
}

export type ScraperName = 'rss' | 'x' | 'reddit' | 'arxiv'

export interface ScrapeJob {
  scraper: ScraperName
  body: Record<string, unknown>
}

/**
 * Route les subjects de la research_strategy vers les bons scrapers en
 * agrégeant les hints. Un même scraper appelé une seule fois avec l'union
 * des hints = limite la latence et évite les doublons.
 *
 * V1 : on ignore le scrape "web" (Perplexity) — délégué à US-K07 séparé
 * ou a ajouter en V2. Documenté dans research-from-seed/README.md.
 *
 * @returns liste de jobs vide si la stratégie n'a aucun hint exploitable.
 */
export function buildScrapeJobs(strategy: Record<string, unknown>): ScrapeJob[] {
  const subjects = Array.isArray(strategy.subjects) ? (strategy.subjects as SubjectShape[]) : []

  const xHandles = new Set<string>()
  const redditSubs = new Set<string>()
  const arxivCategories = new Set<string>()
  const rssKeywords = new Set<string>()

  for (const s of subjects) {
    if (!s || typeof s !== 'object') continue

    if (Array.isArray(s.x_handles_hint)) {
      for (const h of s.x_handles_hint as SubjectXHandle[]) {
        if (h && typeof h === 'object' && typeof h.handle === 'string') {
          // Strip leading @ and whitespace ; les listes Apify attendent l'ID
          // de liste, mais en V1 on passe les handles tels quels — Bassira
          // pré-mappe ses listes côté infra.
          const cleaned = h.handle.replace(/^@/, '').trim()
          if (cleaned.length > 0) xHandles.add(cleaned)
        }
      }
    }

    if (Array.isArray(s.reddit_subs_hint)) {
      for (const r of s.reddit_subs_hint as SubjectRedditHint[]) {
        if (r && typeof r === 'object' && typeof r.sub === 'string') {
          const cleaned = r.sub.replace(/^r\//i, '').trim()
          if (cleaned.length > 0) redditSubs.add(cleaned)
        }
      }
    }

    if (Array.isArray(s.arxiv_categories_hint)) {
      for (const c of s.arxiv_categories_hint as unknown[]) {
        if (typeof c === 'string' && c.trim().length > 0) {
          arxivCategories.add(c.trim())
        }
      }
    }

    if (Array.isArray(s.rss_keywords)) {
      for (const k of s.rss_keywords as unknown[]) {
        if (typeof k === 'string' && k.trim().length > 0) {
          rssKeywords.add(k.trim())
        }
      }
    }
  }

  const jobs: ScrapeJob[] = []

  // RSS : V1 = pas de feed lookup (mode session attend feed_urls). On émet
  // un job RSS UNIQUEMENT si on a au moins un keyword (sinon scraper-rss
  // refusera). Pour rester safe en V1 on skip RSS sans feed_urls explicites.
  // → Acceptable car la spec autorise V1 minimal sur web/RSS sans feeds.
  // (Note future : Bassira passera ses propres feed_urls via body si besoin.)

  if (xHandles.size > 0) {
    jobs.push({
      scraper: 'x',
      body: {
        listIds: Array.from(xHandles).slice(0, 10),
      },
    })
  }

  if (redditSubs.size > 0) {
    jobs.push({
      scraper: 'reddit',
      body: {
        subs: Array.from(redditSubs).slice(0, 12),
      },
    })
  }

  if (arxivCategories.size > 0) {
    jobs.push({
      scraper: 'arxiv',
      body: {
        categories: Array.from(arxivCategories).slice(0, 5),
      },
    })
  }

  return jobs
}

// ---------------------------------------------------------------------------
// F-Hints-Override + F-Profile + F7b helpers (coverage augmentation)
// ---------------------------------------------------------------------------

/**
 * Convertit un HintsOverride en ScrapeJob[]. Format identique à
 * buildScrapeJobs sortie : un job par scraper avec body adapté.
 * RSS skip (V1, cf. note dans buildScrapeJobs).
 */
export function hintsOverrideToJobs(h: HintsOverride): ScrapeJob[] {
  const jobs: ScrapeJob[] = []
  if (Array.isArray(h.x_handles) && h.x_handles.length > 0) {
    jobs.push({ scraper: 'x', body: { listIds: h.x_handles.slice(0, 10) } })
  }
  if (Array.isArray(h.reddit_subs) && h.reddit_subs.length > 0) {
    jobs.push({ scraper: 'reddit', body: { subs: h.reddit_subs.slice(0, 12) } })
  }
  if (Array.isArray(h.arxiv_categories) && h.arxiv_categories.length > 0) {
    jobs.push({ scraper: 'arxiv', body: { categories: h.arxiv_categories.slice(0, 5) } })
  }
  return jobs
}

/**
 * Merge deux ScrapeJob[] par scraper name. Pour chaque scraper, dédupe
 * et union les listes (listIds / subs / categories). Préserve l'ordre
 * des items du premier arg, puis ajoute les nouveaux du second.
 * Cap aux mêmes limites que buildScrapeJobs (10 x_handles / 12 subs / 5 cats).
 */
export function mergeScrapeJobs(a: ScrapeJob[], b: ScrapeJob[]): ScrapeJob[] {
  const byScraper = new Map<ScraperName, Record<string, unknown>>()
  for (const j of [...a, ...b]) {
    const existing = byScraper.get(j.scraper)
    if (!existing) {
      byScraper.set(j.scraper, { ...j.body })
      continue
    }
    // Merge arrays présents dans body. On connaît les clés : listIds, subs, categories.
    for (const key of ['listIds', 'subs', 'categories'] as const) {
      const av = (existing[key] as unknown[] | undefined) ?? []
      const bv = (j.body[key] as unknown[] | undefined) ?? []
      if (av.length === 0 && bv.length === 0) continue
      const set = new Set<string>()
      for (const x of [...av, ...bv]) {
        if (typeof x === 'string' && x.trim().length > 0) set.add(x.trim())
      }
      const cap = key === 'listIds' ? 10 : key === 'subs' ? 12 : 5
      existing[key] = Array.from(set).slice(0, cap)
    }
  }
  const out: ScrapeJob[] = []
  for (const [scraper, body] of byScraper.entries()) {
    out.push({ scraper, body })
  }
  return out
}

/**
 * F-Profile 2026-05-15 — résout un nom OU uuid de scope_profile vers
 * son HintsOverride. Lookup par name d'abord (more user-friendly), uuid
 * sinon. Retourne null si introuvable.
 */
export async function fetchScopeProfile(
  supabase: SupabaseClient,
  profileRef: string,
): Promise<HintsOverride | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileRef)
  const column = isUuid ? 'id' : 'name'
  const { data, error } = await supabase
    .from('scope_profiles')
    .select('x_handles, reddit_subs, arxiv_categories, rss_keywords, active')
    .eq(column, profileRef)
    .eq('active', true)
    .maybeSingle()
  if (error || !data) return null
  const out: HintsOverride = {}
  if (Array.isArray(data.x_handles) && data.x_handles.length > 0) out.x_handles = data.x_handles
  if (Array.isArray(data.reddit_subs) && data.reddit_subs.length > 0)
    out.reddit_subs = data.reddit_subs
  if (Array.isArray(data.arxiv_categories) && data.arxiv_categories.length > 0)
    out.arxiv_categories = data.arxiv_categories
  if (Array.isArray(data.rss_keywords) && data.rss_keywords.length > 0)
    out.rss_keywords = data.rss_keywords
  return Object.keys(out).length > 0 ? out : null
}

/**
 * F7b 2026-05-15 — fetch les configs scraping par défaut du proxy_user
 * (Amine), à utiliser quand la stratégie + override + profile produisent 0 jobs.
 * Garantit qu'on lance toujours AU MOINS quelques scrapers en pire cas.
 */
export async function fetchProxyUserSettings(
  supabase: SupabaseClient,
  proxyUserId: string,
): Promise<HintsOverride | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('x_queries, reddit_subs, arxiv_categories')
    .eq('user_id', proxyUserId)
    .maybeSingle()
  if (error || !data) return null
  const out: HintsOverride = {}
  // x_queries côté settings sont des queries de recherche, pas des list_ids.
  // Le scraper-x les accepte via le même paramètre listIds (cf. UI Settings).
  if (Array.isArray(data.x_queries) && data.x_queries.length > 0) out.x_handles = data.x_queries
  if (Array.isArray(data.reddit_subs) && data.reddit_subs.length > 0)
    out.reddit_subs = data.reddit_subs
  if (Array.isArray(data.arxiv_categories) && data.arxiv_categories.length > 0)
    out.arxiv_categories = data.arxiv_categories
  return Object.keys(out).length > 0 ? out : null
}

// ---------------------------------------------------------------------------
// Top-N signal selection (pour scoring + synth)
// ---------------------------------------------------------------------------

export interface ScoredSignalLike {
  id: string
  score?: number
  disqualified?: boolean
}

/**
 * Filtre les signaux disqualified=true et trie par score décroissant,
 * tronque à `limit`. Stable : signaux sans score finissent en bas.
 */
export function selectTopSignals<T extends ScoredSignalLike>(signals: T[], limit = 50): T[] {
  const retained = signals.filter((s) => s && s.disqualified !== true)
  retained.sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : -1
    const sb = typeof b.score === 'number' ? b.score : -1
    return sb - sa
  })
  return retained.slice(0, Math.max(0, limit))
}

// ---------------------------------------------------------------------------
// CORS — whitelist stricte (pas de `*` pour endpoint public à coût LLM)
// ---------------------------------------------------------------------------

/**
 * Whitelist origin :
 *   - https://prospectives.ai-mpower.com   (Bassira prod)
 *   - https://<sub>.ai-mpower.com           (Bassira staging/preview)
 *   - http://localhost:<port>              (dev local)
 *
 * Retourne l'origine si autorisée (à reflect dans Access-Control-Allow-Origin),
 * sinon null (le caller renvoie 403/CORS-fail).
 */
export function resolveCorsOrigin(origin: string | null): string | null {
  if (!origin) return null
  if (origin === 'https://prospectives.ai-mpower.com') return origin
  if (/^https:\/\/[a-z0-9-]+\.ai-mpower\.com$/i.test(origin)) return origin
  if (/^http:\/\/localhost(:\d+)?$/i.test(origin)) return origin
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return origin
  return null
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = resolveCorsOrigin(origin)
  if (!allowed) {
    // Pas de header Access-Control-Allow-Origin → le browser bloquera.
    return {
      Vary: 'Origin',
      'Access-Control-Allow-Headers': 'content-type, x-api-key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'content-type, x-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
