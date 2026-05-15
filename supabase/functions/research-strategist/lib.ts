/**
 * research-strategist — pure helpers (validation, sanitization, schema check,
 * prompt builders). Séparé du handler `Deno.serve` pour rester importable
 * proprement par les tests sans booter de listener HTTP.
 *
 * BYOK strict — no model imposed. Resolution via dispatch-llm + user
 * settings (settings.model_config['enrichment']).
 */

const SEED_MIN = 50
const SEED_MAX = 3000
export const SUPPORTED_LANGS = ['fr', 'en', 'ar'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export interface RequestBody {
  seed: string
  lang: Lang
  sector_hint?: string
}

// ---------------------------------------------------------------------------
// Validation des inputs (corps de requête)
// ---------------------------------------------------------------------------

export interface ValidationFailure {
  ok: false
  error: string
}
export interface ValidationOk {
  ok: true
  body: RequestBody
}
export type ValidationResult = ValidationOk | ValidationFailure

export function validateRequestBody(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
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

  return {
    ok: true,
    body: {
      seed: trimmed,
      lang: lang as Lang,
      ...(sector_hint !== undefined ? { sector_hint } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Sanitization de la sortie LLM
// ---------------------------------------------------------------------------

/**
 * Purge contre BYOK : certains modèles (DeepSeek, Qwen, parfois GPT) lâchent
 * des balises de chain-of-thought ou tool-call autour du JSON. On strip avant
 * le JSON.parse, jamais en supposant que le modèle obéit (critique BYOK).
 */
const XML_NOISE_TAGS = ['tool_call', 'thinking', 'scratchpad', 'reasoning', 'reflection']

export function stripXmlNoise(s: string): string {
  let out = s
  for (const tag of XML_NOISE_TAGS) {
    const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, 'gi')
    out = out.replace(re, '')
    // balises orphelines auto-fermantes ou non-fermées
    const orphan = new RegExp(`</?${tag}[^>]*>`, 'gi')
    out = out.replace(orphan, '')
  }
  return out
}

/** Strip caractères de contrôle (sauf \n, \r, \t qui sont valides en JSON). */
export function stripControlChars(s: string): string {
  // deno-lint-ignore no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/** Pipeline de sanitization complet pour content LLM avant JSON.parse. */
export function sanitizeLlmJsonContent(s: string): string {
  let out = stripXmlNoise(s)
  out = stripControlChars(out)
  // strip ```json ... ``` fences si présents
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  return out.trim()
}

/**
 * Extrait le 1er bloc JSON équilibré du contenu, pour le cas où le modèle
 * ajoute un préambule ou un suffixe malgré response_format=json_object.
 * Retourne null si pas trouvé.
 */
export function extractJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\' && inStr) {
      escape = true
      continue
    }
    if (c === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Validation du schema research_strategy retourné par le LLM
// ---------------------------------------------------------------------------

const VALID_ANGLES = new Set([
  'actors',
  'metrics',
  'precedents',
  'counter',
  'weak-signals',
  'context',
  'velocity',
  'second-order',
])

export interface SchemaError {
  ok: false
  error: string
  detail?: string
}
export interface SchemaOk {
  ok: true
  strategy: Record<string, unknown>
}
export type SchemaResult = SchemaOk | SchemaError

export function validateResearchStrategy(parsed: unknown): SchemaResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'schema_root_not_object' }
  }
  const obj = parsed as Record<string, unknown>

  // domain
  if (typeof obj.domain !== 'string' || obj.domain.length === 0) {
    return { ok: false, error: 'schema_domain_invalid' }
  }
  // geo_scope
  if (typeof obj.geo_scope !== 'string' || obj.geo_scope.length === 0) {
    return { ok: false, error: 'schema_geo_scope_invalid' }
  }
  // language_mix
  if (
    !Array.isArray(obj.language_mix) ||
    obj.language_mix.length === 0 ||
    !obj.language_mix.every((l) => typeof l === 'string')
  ) {
    return { ok: false, error: 'schema_language_mix_invalid' }
  }

  // subjects
  if (!Array.isArray(obj.subjects)) {
    return { ok: false, error: 'schema_subjects_not_array' }
  }
  if (obj.subjects.length < 3) {
    return { ok: false, error: 'schema_subjects_too_few', detail: `count=${obj.subjects.length}` }
  }
  if (obj.subjects.length > 12) {
    return { ok: false, error: 'schema_subjects_too_many', detail: `count=${obj.subjects.length}` }
  }

  for (let i = 0; i < obj.subjects.length; i++) {
    const s = obj.subjects[i]
    if (!s || typeof s !== 'object') {
      return { ok: false, error: 'schema_subject_not_object', detail: `idx=${i}` }
    }
    const sub = s as Record<string, unknown>
    if (typeof sub.id !== 'string' || sub.id.length === 0) {
      return { ok: false, error: 'schema_subject_id_invalid', detail: `idx=${i}` }
    }
    if (typeof sub.title !== 'string' || sub.title.length === 0) {
      return { ok: false, error: 'schema_subject_title_invalid', detail: `idx=${i}` }
    }
    if (typeof sub.angle !== 'string' || !VALID_ANGLES.has(sub.angle)) {
      return { ok: false, error: 'schema_subject_angle_invalid', detail: `idx=${i}` }
    }
    if (!Array.isArray(sub.sub_queries)) {
      return { ok: false, error: 'schema_subject_sub_queries_invalid', detail: `idx=${i}` }
    }
  }

  // tensions
  if (!Array.isArray(obj.tensions)) {
    return { ok: false, error: 'schema_tensions_not_array' }
  }
  // blind_spots
  if (!Array.isArray(obj.blind_spots)) {
    return { ok: false, error: 'schema_blind_spots_not_array' }
  }

  // recursion_budget
  if (typeof obj.recursion_budget !== 'number' || !Number.isInteger(obj.recursion_budget)) {
    return { ok: false, error: 'schema_recursion_budget_not_int' }
  }
  if (obj.recursion_budget < 0 || obj.recursion_budget > 2) {
    return {
      ok: false,
      error: 'schema_recursion_budget_out_of_range',
      detail: `value=${obj.recursion_budget}`,
    }
  }

  return { ok: true, strategy: obj }
}

/**
 * F7a 2026-05-15 — compte les subjects qui ont AU MOINS UN hint
 * exploitable parmi (x_handles_hint, reddit_subs_hint, arxiv_categories_hint,
 * rss_keywords). Sert à détecter le cas où DeepSeek-v4-flash passe la
 * validation schema mais émet des hints vides (observé sur sessions
 * 2ea72654 etc. — hints:{} sur 5/5 subjects).
 *
 * Retourne { withHints, total }. Le caller décide si retry est nécessaire.
 */
export function countSubjectsWithHints(strategy: Record<string, unknown>): {
  withHints: number
  total: number
} {
  const subjects = Array.isArray(strategy.subjects)
    ? (strategy.subjects as Array<Record<string, unknown>>)
    : []
  let withHints = 0
  for (const s of subjects) {
    if (!s || typeof s !== 'object') continue
    const x = Array.isArray(s.x_handles_hint) ? s.x_handles_hint.length : 0
    const r = Array.isArray(s.reddit_subs_hint) ? s.reddit_subs_hint.length : 0
    const a = Array.isArray(s.arxiv_categories_hint) ? s.arxiv_categories_hint.length : 0
    const k = Array.isArray(s.rss_keywords) ? s.rss_keywords.length : 0
    if (x + r + a + k > 0) withHints++
  }
  return { withHints, total: subjects.length }
}

// ---------------------------------------------------------------------------
// System prompt — source de vérité : docs/kairos-bassira-research-prompts.md
//                                    section "PROMPT 1 — research-strategist"
// ---------------------------------------------------------------------------

export function buildSystemPrompt(lang: Lang): string {
  return `Tu es un architecte de stratégie de recherche prospective. Ton rôle n'est
pas de résumer la graine, mais de la DÉCOMPOSER en axes de recherche
orthogonaux qui maximisent la diversité des signaux récupérés en aval.

MÉTHODOLOGIE OBLIGATOIRE :
1. Lis la graine. Identifie le DOMAINE (politique/finance/santé/cyber/marché/
   géopolitique/social/scientifique/produit/...) et le PÉRIMÈTRE GÉOGRAPHIQUE
   (Maroc / MENA / Afrique / Europe / monde). Ces deux dimensions cadrent
   le mix linguistique attendu.

2. Liste les ANGLES pertinents parmi les 8 disponibles :
   - actors          : qui décide, qui résiste, qui arbitre
   - metrics         : indicateurs chiffrés invoqués par les acteurs
   - precedents      : événements analogues passés (3 dernières années max)
   - counter         : positions opposées à la lecture dominante
   - weak-signals    : signaux faibles, niches, secteurs informels
   - context         : structure de fond (réglementaire, démographique...)
   - velocity        : signes que la situation accélère ou ralentit
   - second-order    : conséquences indirectes peu discutées
   Choisis 4-7 angles. Aucun doublon. Si la graine est étroite, force-toi
   à inclure counter + weak-signals (anti-echo-chamber).

3. Pour CHAQUE angle, formule UN sujet de recherche concret. Ne pas
   redonder, ne pas paraphraser la graine.

4. ÉVALUATION DE LA COMPLEXITÉ : si la graine est large/floue, demande
   plus de subjects (jusqu'à 12). Si la graine est précise/étroite, 3
   subjects suffisent. Adaptatif, pas un quota fixe.

5. Pour chaque sujet, propose des SOURCES diversifiées en LANGUE :
   - sub_queries en ${lang} ET dans la langue dominante du périmètre
     géographique (FR pour Maroc, AR si la graine touche l'opinion
     publique arabe, EN pour signaux internationaux ou techniques).
   - Les hints (X handles, subs, ArXiv) doivent être DIVERSIFIÉS en
     langue. Un sujet Maroc avec UNIQUEMENT des handles francophones
     est un anti-pattern.

6. IDENTIFIE les TENSIONS connues entre subjects. Une tension = deux
   sujets dont les signaux vont probablement se contredire. C'est un
   atout, pas un défaut. Liste explicite (peut être vide).

7. IDENTIFIE les BLIND-SPOTS prévisibles. Quels angles risquent d'être
   sous-couverts par les sources mainstream ? À utiliser en aval pour
   forcer le scrape vers ces zones.

8. RECOMMANDE un budget de récursion : depth_max ∈ {0, 1, 2}. Une graine
   simple → 0. Une graine complexe avec tensions explicites → 2.

INTERDICTIONS :
- Pas de hint inventé (handle X qui n'existe pas, sub Reddit fictif).
- Pas de subject vague ("contexte général", "actualité du sujet").
- Pas de sub_queries génériques ("X 2026"). Toujours acteur+verbe+contexte.
- Pas de couverture homogène : si tous les subjects pointent les mêmes
  sources, échec de mission.

SCHEMA OUTPUT :
{
  "domain": "string (politique|finance|santé|...|autre)",
  "geo_scope": "string (MA|DZ|TN|MENA|MENA+EU|EU|world|other)",
  "language_mix": ["fr", "ar", "en"],
  "subjects": [
    {
      "id": "s_001",
      "title": "string 5-15 mots",
      "angle": "actors|metrics|precedents|counter|weak-signals|context|velocity|second-order",
      "rationale": "20-40 mots, justification de l'angle pour CETTE graine",
      "sub_queries": [
        { "q": "string requête", "lang": "fr|en|ar" }
      ],
      "rss_keywords": ["lower-case", "bigrammes acceptés"],
      "x_handles_hint": [
        { "handle": "@xxx", "lang": "fr|en|ar", "confident": true }
      ],
      "reddit_subs_hint": [
        { "sub": "name", "confident": true }
      ],
      "arxiv_categories_hint": ["cs.AI"],
      "expected_signal_volume": "low|medium|high",
      "confidence": 0.0
    }
  ],
  "tensions": [
    {
      "between": ["s_001", "s_002"],
      "nature": "string 10-20 mots",
      "exploit_in_synthesis": true
    }
  ],
  "blind_spots": [
    {
      "description": "string 10-20 mots",
      "mitigation_query": "string requête de compensation"
    }
  ],
  "recursion_budget": 0
}

CONTRAINTES DE SORTIE :
- JSON STRICT uniquement. Aucun préambule, aucune justification hors-JSON.
- INTERDIT : balises <tool_call>, <thinking>, <scratchpad>, markdown, fences.
- Langue de sortie pour les champs textuels (rationale, nature, description) : ${lang}.
- Si ${lang}=fr, accents obligatoires PARTOUT y compris majuscules (É, È, À, Ç).`
}

export function buildUserMessage(body: RequestBody): string {
  return JSON.stringify(
    {
      seed: body.seed,
      lang: body.lang,
      sector_hint: body.sector_hint ?? null,
    },
    null,
    2,
  )
}
