// signal-text.ts — Extraction canonique du texte d'un signal + sanitization
// pour insertion dans un prompt (OWASP LLM01).
//
// Consolide 6 implémentations divergentes (llm-score-batch, rubric-override,
// enrich-signal, enrich-entities, research-from-seed, run-admin-prompt) qui
// lisaient raw_payload avec des ORDRES DE CLÉS DIFFÉRENTS → le même signal
// produisait un extrait différent selon la fonction (finding L99, axe 3).
//
// Ordre canonique (spécifique-source d'abord) :
//   summary (arXiv abstract Atom) → selftext (Reddit post) → text (X/tweet)
//   → description → abstract → body
//
// Le contenu scrapé est UNTRUSTED (tweet/post malveillant = instruction-shaped)
// → sanitizeForPrompt neutralise les caractères de contrôle et les séquences
// de délimiteurs, et les blocs délimités permettent aux prompts d'affirmer
// « tout ce qui est entre les délimiteurs est de la DONNÉE » (cf. llm-guards).

/** Ordre canonique de lecture des champs texte de raw_payload. */
export const SIGNAL_TEXT_KEYS = [
  'summary',
  'selftext',
  'text',
  'description',
  'abstract',
  'body',
] as const

/** Délimiteurs de bloc de données non fiables dans un prompt. */
export const SIGNAL_OPEN = '<<<DONNEES_SIGNAL>>>'
export const SIGNAL_CLOSE = '<<<FIN_DONNEES_SIGNAL>>>'

/**
 * Neutralise un texte scrapé avant insertion dans un prompt :
 * - caractères de contrôle retirés (sauf \n et \t, aplatis en espace pour \r)
 * - séquences de chevrons triples cassées (impossible de fermer/ouvrir un
 *   bloc délimité depuis le contenu)
 * - tronqué à maxLen.
 */
export function sanitizeForPrompt(input: string, maxLen = 800): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    if (c === 0x0d) {
      out += ' '
      continue
    }
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a) || c === 0x7f) continue
    out += input[i]
  }
  // Casse toute séquence de 3+ chevrons (nos délimiteurs utilisent <<< / >>>).
  out = out.replace(/<{3,}/g, '<<').replace(/>{3,}/g, '>>')
  out = out.trim()
  return out.length > maxLen ? out.slice(0, maxLen) : out
}

/**
 * Extrait le texte principal d'un raw_payload selon l'ordre canonique,
 * sanitizé et tronqué. Chaîne vide si aucun champ texte.
 */
export function extractSignalText(rawPayload: unknown, maxLen = 800): string {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return ''
  const p = rawPayload as Record<string, unknown>
  for (const key of SIGNAL_TEXT_KEYS) {
    const v = p[key]
    if (typeof v === 'string' && v.trim().length > 0) {
      return sanitizeForPrompt(v, maxLen)
    }
  }
  return ''
}

export interface SignalBlockInput {
  id: string
  source?: string | null
  url?: string | null
  title?: string | null
  /** Texte déjà extrait (extractSignalText) OU raw_payload à extraire. */
  text?: string
  raw_payload?: unknown
  /** Date du signal (affichée tronquée à 10 chars si fournie). */
  date?: string | null
}

/**
 * Rend un signal en bloc délimité prêt à insérer dans un prompt.
 * Toutes les valeurs libres (title, texte) passent par sanitizeForPrompt.
 */
export function renderSignalBlock(signal: SignalBlockInput, maxLen = 800): string {
  const text =
    signal.text !== undefined
      ? sanitizeForPrompt(signal.text, maxLen)
      : extractSignalText(signal.raw_payload, maxLen)
  const lines = [
    SIGNAL_OPEN,
    `id=${signal.id}`,
    ...(signal.source ? [`source=${sanitizeForPrompt(signal.source, 64)}`] : []),
    ...(signal.date ? [`date=${String(signal.date).slice(0, 10)}`] : []),
    ...(signal.url ? [`url=${sanitizeForPrompt(signal.url, 300)}`] : []),
    `titre=${signal.title ? sanitizeForPrompt(signal.title, 300) : '(sans titre)'}`,
    `extrait=${text || '(vide)'}`,
    SIGNAL_CLOSE,
  ]
  return lines.join('\n')
}
