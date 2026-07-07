// llm-json.ts — Parse tolérant des sorties JSON de LLM (BYOK-safe).
//
// Consolide 7 copies divergentes du même besoin (enrich.ts, ner.ts,
// suggest.ts, auditor.ts, rubric-override.ts, research-strategist/lib.ts,
// rubric-architect/index.ts) : certains modèles BYOK (DeepSeek, Qwen, parfois
// GPT) enveloppent le JSON de fences markdown, de balises chain-of-thought
// (<thinking>…), de BOM/zero-width, ou de texte hors JSON. On strip TOUT avant
// JSON.parse, sans jamais supposer que le modèle obéit.
//
// NB : `_shared/parse-score.ts` (réponses de scoring, sémantique score/faux
// zéro) reste un module distinct — ici c'est le parsing générique objet/array.

/** Balises de bruit émises par certains modèles autour du JSON. */
const XML_NOISE_TAGS = ['tool_call', 'thinking', 'scratchpad', 'reasoning', 'reflection']

const NOISE_BLOCK_RE = new RegExp(
  `<(${XML_NOISE_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`,
  'gi',
)
const NOISE_ORPHAN_RE = new RegExp(`</?(${XML_NOISE_TAGS.join('|')})\\b[^>]*/?>`, 'gi')

/** Purge les blocs de CoT/tool-call ET leur contenu, puis les balises orphelines. */
export function stripXmlNoise(s: string): string {
  return s.replace(NOISE_BLOCK_RE, '').replace(NOISE_ORPHAN_RE, '')
}

/** Strip caractères de contrôle (sauf \n, \r, \t — valides en JSON). */
export function stripControlChars(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) continue
    out += s[i]
  }
  return out
}

/** Strip BOM + zero-width (ZWSP/ZWNJ/ZWJ/BOM interne). */
export function stripInvisible(s: string): string {
  return s.replace(/^﻿/, '').replace(/[​-‍﻿]/g, '')
}

/** Strip fences markdown ```json … ``` en tête/queue. */
export function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

/** Pipeline de sanitization complet avant JSON.parse. */
export function sanitizeLlmJson(s: string): string {
  return stripFences(stripControlChars(stripInvisible(stripXmlNoise(s)))).trim()
}

/**
 * Extrait le premier bloc JSON équilibré ({…} ou […], le premier des deux)
 * — string-aware (ignore les accolades dans les chaînes). null si absent.
 */
export function extractBalancedJson(s: string): string | null {
  const iObj = s.indexOf('{')
  const iArr = s.indexOf('[')
  let start: number
  if (iObj === -1 && iArr === -1) return null
  if (iObj === -1) start = iArr
  else if (iArr === -1) start = iObj
  else start = Math.min(iObj, iArr)

  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

export type LlmJsonErrorCode = 'empty_response' | 'no_json' | 'invalid_json'

export class LlmJsonError extends Error {
  readonly code: LlmJsonErrorCode
  constructor(code: LlmJsonErrorCode) {
    super(code)
    this.name = 'LlmJsonError'
    this.code = code
  }
}

/**
 * Parse la sortie LLM : sanitize → JSON.parse direct → sinon premier bloc
 * équilibré. Lève LlmJsonError (le caller décide : skip, retry, log) —
 * jamais de fallback silencieux vers une valeur par défaut ici.
 */
export function parseLlmJson(raw: string): unknown {
  if (!raw || typeof raw !== 'string') throw new LlmJsonError('empty_response')
  const cleaned = sanitizeLlmJson(raw)
  if (!cleaned) throw new LlmJsonError('empty_response')
  try {
    return JSON.parse(cleaned)
  } catch {
    const block = extractBalancedJson(cleaned)
    if (block === null) throw new LlmJsonError('no_json')
    try {
      return JSON.parse(block)
    } catch {
      throw new LlmJsonError('invalid_json')
    }
  }
}

/** Variante non-levante pour les parseurs à dégradation douce. */
export function parseLlmJsonSafe(raw: string): unknown | null {
  try {
    return parseLlmJson(raw)
  } catch {
    return null
  }
}
