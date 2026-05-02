/**
 * email-utils — Normalisation d'email avant envoi à Supabase Auth.
 *
 * Pourquoi ce module
 * ------------------
 * Supabase GoTrue applique une regex de validation d'email qui rejette
 * les domaines en format Punycode (`xn--…`) avec `--` consécutifs en
 * milieu de label, alors que ces formats sont parfaitement valides
 * (RFC 3492 IDN). Concrètement, un email comme
 * `a.mansouri@xn--afriquestratgie-mnb.com` (= `afrique-stratégie.com`)
 * est refusé avec « Email address X is invalid ».
 *
 * Le navigateur (auto-fill, gestionnaire de mots de passe) injecte
 * souvent ces emails au format Punycode parce que c'est ce qui est
 * stocké côté DNS. L'utilisateur ne s'en rend pas compte.
 *
 * Pour contourner :
 *   1. On accepte les saisies en Unicode ET en Punycode côté formulaire
 *      (regex zod assouplie via `looseEmailRegex`).
 *   2. Avant envoi à `supabase.auth.signUp` / `signInWithOtp` /
 *      `signInWithPassword`, on convertit le domaine Punycode →
 *      Unicode via l'API URL native du navigateur. Supabase GoTrue
 *      accepte les domaines Unicode, c'est seulement le Punycode qui
 *      coince.
 *
 * Note : `URL` côté navigateur fait la conversion DOM hostname →
 * Unicode quand on accède à `.hostname`. Une astuce : on construit
 * une URL `http://<domain>/` puis on lit `.hostname` qui retourne le
 * domaine ASCII normalisé. Pour obtenir l'Unicode, on utilise un
 * petit décodeur Punycode RFC 3492 (~50 lignes, pas de dep externe).
 */

/**
 * Regex permissive pour la validation côté formulaire.
 * Accepte tout email avec un `@` et un point dans la partie domaine,
 * incluant les caractères Unicode (lettres accentuées).
 *
 * On délègue la validation finale à Supabase GoTrue.
 */
export const looseEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Décode un label Punycode (qui commence par `xn--`) en Unicode.
 * Implémentation RFC 3492 minimale.
 */
function punycodeDecode(input: string): string {
  if (!input.startsWith('xn--')) return input
  const encoded = input.slice(4)
  const base = 36
  const tMin = 1
  const tMax = 26
  const skew = 38
  const damp = 700
  const initialBias = 72
  const initialN = 128

  const lastDelim = encoded.lastIndexOf('-')
  const basicCodePoints = lastDelim > 0 ? encoded.slice(0, lastDelim) : ''
  const output: number[] = []
  for (let i = 0; i < basicCodePoints.length; i++) {
    output.push(basicCodePoints.charCodeAt(i))
  }

  let n = initialN
  let i = 0
  let bias = initialBias
  let pos = lastDelim < 0 ? 0 : lastDelim + 1

  while (pos < encoded.length) {
    const oldI = i
    let w = 1
    for (let k = base; ; k += base) {
      if (pos >= encoded.length) return input // décodage impossible
      const c = encoded.charCodeAt(pos++)
      let digit: number
      if (c >= 48 && c <= 57) digit = c - 22
      else if (c >= 65 && c <= 90) digit = c - 65
      else if (c >= 97 && c <= 122) digit = c - 97
      else return input

      i += digit * w
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
      if (digit < t) break
      w *= base - t
    }

    const out = output.length + 1
    let delta = i - oldI
    delta = oldI === 0 ? Math.floor(delta / damp) : delta >> 1
    delta += Math.floor(delta / out)

    let k = 0
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin))
      k += base
    }
    bias = k + Math.floor(((base - tMin + 1) * delta) / (delta + skew))

    n += Math.floor(i / out)
    i %= out

    output.splice(i, 0, n)
    i++
  }

  return String.fromCodePoint(...output)
}

/**
 * Normalise un email pour Supabase Auth :
 *  - Trim
 *  - Lowercase la partie locale (case-insensitive en pratique côté GoTrue)
 *  - Décode Punycode → Unicode sur chaque label du domaine
 *
 * Si l'input est invalide ou ne contient pas `@`, retourne l'input
 * trim/lowercased tel quel.
 */
export function normalizeEmail(input: string): string {
  const trimmed = input.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 1) return trimmed

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)

  if (!domain.includes('xn--')) {
    return trimmed
  }

  const decodedDomain = domain
    .split('.')
    .map((label) => punycodeDecode(label))
    .join('.')

  return `${local}@${decodedDomain}`
}
