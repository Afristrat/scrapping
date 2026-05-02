/**
 * Logique de calcul de pricing pour le configurateur public `/pricing`.
 *
 * Source unique de vérité : `docs/strategy/2026-05-02-moats-and-value-capture.md`
 * § 3 « Pricing optimal par segment » et § 5 « Add-ons modulaires ».
 *
 * Toute la logique tourne côté client (pas d'appel API). Les prix retournés
 * par cette lib alimentent le récap live et la query string envoyée à
 * `/signup` ou `create-checkout-session`.
 */

import type { CurrencyCode } from '@/stores/currency'

export type Segment = 'vc_pe' | 'legal' | 'newsletter' | 'brand' | 'cto_sme' | 'solo'
export type BillingMode = 'maison' | 'byok'

interface SegmentPricing {
  /** Prix « Maison » en € pour 1 seat (ou forfait flat si `per_seat=false`). */
  maison: number
  /** Prix « BYOK » en € pour 1 seat (ou forfait flat si `per_seat=false`). */
  byok: number
  /** Tarification au seat ? Si `false`, prix flat indépendant du nombre d'utilisateurs. */
  per_seat: boolean
  /** Nombre de seats inclus dans l'offre de base. */
  default_seats: number
}

export const BASE_PRICES: Record<Segment, SegmentPricing> = {
  solo: { maison: 49, byok: 99, per_seat: false, default_seats: 1 },
  cto_sme: { maison: 149, byok: 249, per_seat: true, default_seats: 5 },
  newsletter: { maison: 499, byok: 799, per_seat: false, default_seats: 3 },
  brand: { maison: 499, byok: 799, per_seat: true, default_seats: 5 },
  legal: { maison: 399, byok: 699, per_seat: true, default_seats: 5 },
  vc_pe: { maison: 599, byok: 999, per_seat: true, default_seats: 5 },
}

/** Dégressivité par seat additionnel — cf. doc stratégique § 4. */
export const DISCOUNT = {
  maison: { '6_25': 0.15, '26_100': 0.3 },
  byok: { '6_25': 0.1, '26_100': 0.2 },
} as const

interface AddonDef {
  label: string
  price: number
  period: 'monthly' | 'yearly'
}

export const ADDONS = {
  webhooks: { label: 'Webhooks Slack/Teams', price: 49, period: 'monthly' },
  api_public: { label: 'API publique read+write', price: 99, period: 'monthly' },
  custom_sources: { label: 'Custom sources', price: 199, period: 'monthly' },
  audit_log: { label: 'Audit log + Compliance', price: 149, period: 'monthly' },
  tenant_isolated: { label: 'Tenant isolé', price: 299, period: 'monthly' },
  selfhost: { label: 'Self-host Docker', price: 499, period: 'yearly' },
  csm_dedicated: { label: 'CSM dédié', price: 999, period: 'yearly' },
  backtest_unlimited: { label: 'Backtest illimité', price: 149, period: 'monthly' },
  reputation_api: { label: 'Author Reputation API', price: 199, period: 'monthly' },
} as const satisfies Record<string, AddonDef>

export type AddonId = keyof typeof ADDONS

export interface PricingInput {
  segment: Segment
  seats: number
  mode: BillingMode
  addons: AddonId[]
}

export interface PricingLine {
  label: string
  amount: number
  period: 'monthly' | 'yearly'
}

export interface PricingBreakdown {
  base_eur_monthly: number
  base_label: string
  seats_extra_eur_monthly: number
  seats_discount_pct: number
  seats_discount_eur: number
  addons_eur_monthly: number
  addons_eur_yearly: number
  total_monthly: number
  total_annualized: number
  lines: PricingLine[]
}

const SEGMENT_NAMES: Record<Segment, string> = {
  solo: 'Solo',
  cto_sme: 'CTO PME',
  newsletter: 'Newsletter',
  brand: 'Brand',
  legal: 'Legal IA Act',
  vc_pe: 'VC / PE',
}

export function getBaseLabel(segment: Segment, mode: BillingMode, default_seats: number): string {
  const segName = SEGMENT_NAMES[segment]
  const modeName = mode === 'maison' ? 'Maison' : 'BYOK'
  if (segment === 'newsletter') return `${segName} ${modeName} (3 éditeurs inclus)`
  if (segment === 'solo') return `${segName} ${modeName} (1 user)`
  return `${segName} ${modeName} (${default_seats} sièges)`
}

/**
 * Calcule le breakdown pricing complet pour une combinaison
 * segment / seats / mode / add-ons.
 *
 * - Pour les segments `per_seat=false` (Solo, Newsletter), `seats` est ignoré
 *   pour le tarif de base (forfait flat).
 * - La dégressivité ne s'applique que pour les segments `per_seat=true`,
 *   au-delà de `default_seats` (5 par défaut), selon les paliers 6-25 / 26-100.
 */
export function computePricing(input: PricingInput): PricingBreakdown {
  const base = BASE_PRICES[input.segment]
  const seatPrice = input.mode === 'maison' ? base.maison : base.byok

  let baseTotal: number
  let seatsExtra = 0
  let discountPct = 0
  let discountAmt = 0

  if (!base.per_seat) {
    baseTotal = seatPrice
  } else {
    const baseSeats = base.default_seats
    baseTotal = baseSeats * seatPrice

    if (input.seats > baseSeats) {
      const extraSeats = input.seats - baseSeats
      if (input.seats <= 25) {
        discountPct = DISCOUNT[input.mode]['6_25']
      } else {
        discountPct = DISCOUNT[input.mode]['26_100']
      }
      const fullExtra = extraSeats * seatPrice
      discountAmt = Math.round(fullExtra * discountPct)
      seatsExtra = fullExtra - discountAmt
    }
  }

  const addonsMonthly = input.addons
    .filter((a) => ADDONS[a].period === 'monthly')
    .reduce((sum, a) => sum + ADDONS[a].price, 0)
  const addonsYearly = input.addons
    .filter((a) => ADDONS[a].period === 'yearly')
    .reduce((sum, a) => sum + ADDONS[a].price, 0)

  const totalMonthly = baseTotal + seatsExtra + addonsMonthly
  const totalAnnualized = totalMonthly * 12 + addonsYearly

  const baseLabel = getBaseLabel(input.segment, input.mode, base.default_seats)
  const lines: PricingLine[] = [{ label: baseLabel, amount: baseTotal, period: 'monthly' }]

  if (seatsExtra > 0) {
    const extraSeats = input.seats - base.default_seats
    lines.push({
      label: `${extraSeats} siège${extraSeats > 1 ? 's' : ''} supplémentaire${extraSeats > 1 ? 's' : ''} (-${Math.round(discountPct * 100)} %)`,
      amount: seatsExtra,
      period: 'monthly',
    })
  }

  for (const a of input.addons) {
    const ad = ADDONS[a]
    lines.push({ label: ad.label, amount: ad.price, period: ad.period })
  }

  return {
    base_eur_monthly: baseTotal,
    base_label: baseLabel,
    seats_extra_eur_monthly: seatsExtra,
    seats_discount_pct: discountPct,
    seats_discount_eur: discountAmt,
    addons_eur_monthly: addonsMonthly,
    addons_eur_yearly: addonsYearly,
    total_monthly: totalMonthly,
    total_annualized: totalAnnualized,
    lines,
  }
}

/** Formate un montant en euros pour l'affichage français. */
export function formatEuro(amount: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 0
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

// ---------------------------------------------------------------------------
// Wave 8.A — Conversion devises pour l'affichage public.
//
// Les prix sont stockés et facturés en EUR (Stripe). Les helpers ci-dessous
// servent UNIQUEMENT pour la présentation : on convertit à la volée les
// montants EUR vers la devise choisie par le visiteur, en utilisant les taux
// récupérés depuis Frankfurter (cf. `useExchangeRates`).
// ---------------------------------------------------------------------------

export type ExchangeRates = Record<CurrencyCode, number>

/**
 * Convertit un montant EUR vers la devise cible. Si le taux est absent, on
 * tombe sur 1 (= EUR) pour éviter un NaN à l'affichage.
 */
export function convertFromEur(
  amountEur: number,
  targetCurrency: CurrencyCode,
  rates: ExchangeRates,
): number {
  const rate = rates[targetCurrency] ?? 1
  return amountEur * rate
}

/**
 * Formate un montant déjà converti dans une devise. Le yen japonais n'utilise
 * pas de décimales — toutes les autres devises supportées sont arrondies à
 * l'entier (cohérent avec `formatEuro`).
 */
export function formatPrice(amount: number, currency: CurrencyCode, locale = 'fr-FR'): string {
  const decimals = currency === 'JPY' ? 0 : 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/**
 * Wrapper pratique : convertit `amountEur` vers `currency` en utilisant
 * `rates`, puis formate dans la locale fournie. Permet d'écrire
 * `priceInCurrency(49, 'USD', rates)` directement dans le JSX.
 */
export function priceInCurrency(
  amountEur: number,
  currency: CurrencyCode,
  rates: ExchangeRates,
  locale = 'fr-FR',
): string {
  const converted = convertFromEur(amountEur, currency, rates)
  return formatPrice(converted, currency, locale)
}
