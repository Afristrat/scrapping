/**
 * Wave 10.0 — Words of Estimative Probability (PDB style).
 *
 * Échelle normée inspirée du President's Daily Brief (Sherman Kent, 1964) +
 * adaptations Cochrane / GRADE / GIEC. Utilisée par le LLM digest pour tagger
 * chaque insight clé du brief stratégique. Rendue côté frontend via
 * `ConfidenceBadge`.
 *
 * Ce module est en `.ts` (pas `.tsx`) pour pouvoir être importé depuis n'importe
 * où (hooks, utils, tests) sans problème react-refresh.
 */

export type ConfidenceLevel =
  | 'almost-certain'
  | 'very-likely'
  | 'likely'
  | 'possible'
  | 'speculative'

export interface ConfidenceLevelMeta {
  level: ConfidenceLevel
  label: { fr: string; en: string; es: string }
  /** Aliases reconnus dans le markdown LLM brut (case-insensitive). */
  aliases: string[]
  description: { fr: string; en: string; es: string }
  /** Probabilité indicative (pour tooltip / docs). */
  probability: { min: number; max: number }
}

export const CONFIDENCE_LEVELS: ConfidenceLevelMeta[] = [
  {
    level: 'almost-certain',
    label: { fr: 'Quasi-certain', en: 'Almost certain', es: 'Casi seguro' },
    aliases: ['quasi-certain', 'almost certain', 'almost-certain', 'casi seguro'],
    description: {
      fr: '≥ 90 % — corroboré ≥3 sources distinctes ET score moyen ≥ 80.',
      en: '≥ 90 % — corroborated by ≥3 distinct sources AND avg score ≥ 80.',
      es: '≥ 90 % — corroborado por ≥3 fuentes distintas Y score medio ≥ 80.',
    },
    probability: { min: 0.9, max: 1 },
  },
  {
    level: 'very-likely',
    label: { fr: 'Très probable', en: 'Very likely', es: 'Muy probable' },
    aliases: ['très probable', 'tres probable', 'very likely', 'very-likely', 'muy probable'],
    description: {
      fr: '75-90 % — 2 sources OU score moyen ≥ 85.',
      en: '75-90 % — 2 sources OR avg score ≥ 85.',
      es: '75-90 % — 2 fuentes O score medio ≥ 85.',
    },
    probability: { min: 0.75, max: 0.9 },
  },
  {
    level: 'likely',
    label: { fr: 'Probable', en: 'Likely', es: 'Probable' },
    aliases: ['probable', 'likely'],
    description: {
      fr: '55-75 % — 1 source avec auteur réputé OU score 70-85.',
      en: '55-75 % — 1 source with reputable author OR score 70-85.',
      es: '55-75 % — 1 fuente con autor reputado O score 70-85.',
    },
    probability: { min: 0.55, max: 0.75 },
  },
  {
    level: 'possible',
    label: { fr: 'Possible', en: 'Possible', es: 'Posible' },
    aliases: ['possible', 'posible'],
    description: {
      fr: '35-55 % — 1 source, score 60-70.',
      en: '35-55 % — 1 source, score 60-70.',
      es: '35-55 % — 1 fuente, score 60-70.',
    },
    probability: { min: 0.35, max: 0.55 },
  },
  {
    level: 'speculative',
    label: { fr: 'Spéculatif', en: 'Speculative', es: 'Especulativo' },
    aliases: ['spéculatif', 'speculatif', 'speculative', 'especulativo'],
    description: {
      fr: '< 35 % — rumeur, score < 60 ou source unique faible.',
      en: '< 35 % — rumor, score < 60 or weak single source.',
      es: '< 35 % — rumor, score < 60 o fuente única débil.',
    },
    probability: { min: 0, max: 0.35 },
  },
]

/**
 * Détecte le niveau de confiance depuis un tag brut (insensible à la casse,
 * accents tolérés). Accepte les formats `[Tag]` ou `Tag` (avec/sans crochets).
 * Retourne null si pas de match.
 */
export function detectConfidenceLevel(rawTag: string): ConfidenceLevel | null {
  const normalized = rawTag.toLowerCase().trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  for (const meta of CONFIDENCE_LEVELS) {
    if (meta.aliases.includes(normalized)) return meta.level
  }
  return null
}
