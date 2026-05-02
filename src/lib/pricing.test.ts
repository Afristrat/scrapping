import { describe, expect, it } from 'vitest'

import {
  ADDONS,
  BASE_PRICES,
  computePricing,
  convertFromEur,
  type ExchangeRates,
  formatEuro,
  formatPrice,
  getBaseLabel,
  priceInCurrency,
} from './pricing'

describe('computePricing — segments forfaitaires (per_seat=false)', () => {
  it('Solo Maison = 49 €', () => {
    const r = computePricing({ segment: 'solo', seats: 1, mode: 'maison', addons: [] })
    expect(r.total_monthly).toBe(49)
    expect(r.base_eur_monthly).toBe(49)
    expect(r.seats_extra_eur_monthly).toBe(0)
    expect(r.seats_discount_pct).toBe(0)
    expect(r.total_annualized).toBe(49 * 12)
  })

  it('Solo BYOK = 99 €', () => {
    const r = computePricing({ segment: 'solo', seats: 1, mode: 'byok', addons: [] })
    expect(r.total_monthly).toBe(99)
    expect(r.base_eur_monthly).toBe(99)
    expect(r.total_annualized).toBe(99 * 12)
  })

  it('Newsletter Maison forfait = 499 € quel que soit le nombre de seats', () => {
    const r1 = computePricing({ segment: 'newsletter', seats: 1, mode: 'maison', addons: [] })
    const r3 = computePricing({ segment: 'newsletter', seats: 3, mode: 'maison', addons: [] })
    const r10 = computePricing({ segment: 'newsletter', seats: 10, mode: 'maison', addons: [] })
    expect(r1.total_monthly).toBe(499)
    expect(r3.total_monthly).toBe(499)
    expect(r10.total_monthly).toBe(499)
    expect(r10.seats_extra_eur_monthly).toBe(0)
  })

  it('Newsletter BYOK forfait = 799 €', () => {
    const r = computePricing({ segment: 'newsletter', seats: 5, mode: 'byok', addons: [] })
    expect(r.total_monthly).toBe(799)
  })
})

describe('computePricing — segments per-seat sans dégressivité (≤ default_seats)', () => {
  it('CTO PME 5 seats Maison = 5 × 149 = 745 €', () => {
    const r = computePricing({ segment: 'cto_sme', seats: 5, mode: 'maison', addons: [] })
    expect(r.total_monthly).toBe(745)
    expect(r.base_eur_monthly).toBe(745)
    expect(r.seats_extra_eur_monthly).toBe(0)
  })

  it('VC 5 seats Maison = 5 × 599 = 2995 €', () => {
    const r = computePricing({ segment: 'vc_pe', seats: 5, mode: 'maison', addons: [] })
    expect(r.total_monthly).toBe(2995)
  })

  it('VC 5 seats BYOK = 5 × 999 = 4995 €', () => {
    const r = computePricing({ segment: 'vc_pe', seats: 5, mode: 'byok', addons: [] })
    expect(r.total_monthly).toBe(4995)
  })

  it('Legal 5 seats Maison = 5 × 399 = 1995 €', () => {
    const r = computePricing({ segment: 'legal', seats: 5, mode: 'maison', addons: [] })
    expect(r.total_monthly).toBe(1995)
  })

  it('Brand 5 seats BYOK = 5 × 799 = 3995 €', () => {
    const r = computePricing({ segment: 'brand', seats: 5, mode: 'byok', addons: [] })
    expect(r.total_monthly).toBe(3995)
  })
})

describe('computePricing — dégressivité palier 6-25 seats', () => {
  it('CTO PME 10 seats Maison : 745 + (5 × 149 × 0,85 arrondi) = 1378 €', () => {
    const r = computePricing({ segment: 'cto_sme', seats: 10, mode: 'maison', addons: [] })
    // fullExtra = 5 × 149 = 745, discount = round(745 × 0,15) = 112, seatsExtra = 633
    // total = 745 + 633 = 1378
    expect(r.seats_discount_pct).toBe(0.15)
    expect(r.seats_discount_eur).toBe(112)
    expect(r.seats_extra_eur_monthly).toBe(633)
    expect(r.total_monthly).toBe(1378)
  })

  it('CTO PME 10 seats BYOK : discount 10 % = 1245 + (1245 × 0,90) = 2366 €', () => {
    const r = computePricing({ segment: 'cto_sme', seats: 10, mode: 'byok', addons: [] })
    // base = 5 × 249 = 1245, fullExtra = 5 × 249 = 1245
    // discount = round(1245 × 0,10) = 125 (124,5 arrondi sup)
    // seatsExtra = 1245 - 125 = 1120
    // total = 1245 + 1120 = 2365
    expect(r.seats_discount_pct).toBe(0.1)
    expect(r.seats_discount_eur).toBe(125)
    expect(r.total_monthly).toBe(2365)
  })

  it('Legal 10 seats Maison : discount 15 % palier 6-25', () => {
    const r = computePricing({ segment: 'legal', seats: 10, mode: 'maison', addons: [] })
    // base = 5 × 399 = 1995, fullExtra = 5 × 399 = 1995
    // discount = round(1995 × 0,15) = 299 (299,25)
    // seatsExtra = 1995 - 299 = 1696
    // total = 1995 + 1696 = 3691
    expect(r.seats_discount_pct).toBe(0.15)
    expect(r.total_monthly).toBe(3691)
  })
})

describe('computePricing — dégressivité palier 26-100 seats', () => {
  it('CTO PME 30 seats Maison : discount 30 %, base 745 + extras', () => {
    const r = computePricing({ segment: 'cto_sme', seats: 30, mode: 'maison', addons: [] })
    // base = 5 × 149 = 745, fullExtra = 25 × 149 = 3725
    // discount = round(3725 × 0,30) = 1118 (1117,5)
    // seatsExtra = 3725 - 1118 = 2607
    // total = 745 + 2607 = 3352
    expect(r.seats_discount_pct).toBe(0.3)
    expect(r.seats_discount_eur).toBe(1118)
    expect(r.total_monthly).toBe(3352)
  })

  it('VC 50 seats BYOK : discount 20 % palier 26-100', () => {
    const r = computePricing({ segment: 'vc_pe', seats: 50, mode: 'byok', addons: [] })
    // base = 5 × 999 = 4995, fullExtra = 45 × 999 = 44955
    // discount = round(44955 × 0,20) = 8991
    // seatsExtra = 44955 - 8991 = 35964
    // total = 4995 + 35964 = 40959
    expect(r.seats_discount_pct).toBe(0.2)
    expect(r.total_monthly).toBe(40959)
  })
})

describe('computePricing — add-ons mensuels', () => {
  it('Add-on webhooks ajoute 49 €/mois', () => {
    const r = computePricing({ segment: 'solo', seats: 1, mode: 'maison', addons: ['webhooks'] })
    expect(r.addons_eur_monthly).toBe(49)
    expect(r.total_monthly).toBe(49 + 49)
  })

  it('Combinaison webhooks + api_public + custom_sources = 49 + 99 + 199 = 347 €/mois', () => {
    const r = computePricing({
      segment: 'solo',
      seats: 1,
      mode: 'maison',
      addons: ['webhooks', 'api_public', 'custom_sources'],
    })
    expect(r.addons_eur_monthly).toBe(49 + 99 + 199)
    expect(r.total_monthly).toBe(49 + 49 + 99 + 199)
  })

  it('Tous les add-ons mensuels cumulés', () => {
    const r = computePricing({
      segment: 'cto_sme',
      seats: 5,
      mode: 'maison',
      addons: [
        'webhooks',
        'api_public',
        'custom_sources',
        'audit_log',
        'tenant_isolated',
        'backtest_unlimited',
        'reputation_api',
      ],
    })
    expect(r.addons_eur_monthly).toBe(49 + 99 + 199 + 149 + 299 + 149 + 199)
  })
})

describe('computePricing — add-ons annuels', () => {
  it('Add-on selfhost 499 €/an n’apparaît pas dans total_monthly', () => {
    const r = computePricing({ segment: 'solo', seats: 1, mode: 'maison', addons: ['selfhost'] })
    expect(r.addons_eur_yearly).toBe(499)
    expect(r.addons_eur_monthly).toBe(0)
    expect(r.total_monthly).toBe(49)
    expect(r.total_annualized).toBe(49 * 12 + 499)
  })

  it('CSM dédié 999 €/an + selfhost 499 €/an = 1498 €/an d’add-ons annuels', () => {
    const r = computePricing({
      segment: 'vc_pe',
      seats: 5,
      mode: 'byok',
      addons: ['selfhost', 'csm_dedicated'],
    })
    expect(r.addons_eur_yearly).toBe(499 + 999)
    expect(r.total_annualized).toBe(4995 * 12 + 1498)
  })
})

describe('computePricing — total annualisé', () => {
  it('Total annualisé = monthly × 12 + add-ons yearly', () => {
    const r = computePricing({
      segment: 'cto_sme',
      seats: 5,
      mode: 'maison',
      addons: ['webhooks', 'selfhost'],
    })
    // monthly = 745 + 49 = 794, yearly = 499
    // annualized = 794 × 12 + 499 = 9528 + 499 = 10027
    expect(r.total_monthly).toBe(794)
    expect(r.total_annualized).toBe(794 * 12 + 499)
  })
})

describe('computePricing — lines de récap', () => {
  it('Inclut le label de base + chaque add-on en lignes séparées', () => {
    const r = computePricing({
      segment: 'cto_sme',
      seats: 5,
      mode: 'maison',
      addons: ['webhooks', 'selfhost'],
    })
    expect(r.lines.length).toBe(3) // base + 2 add-ons
    expect(r.lines[0]?.label).toContain('CTO PME')
    expect(r.lines[1]?.label).toBe('Webhooks Slack/Teams')
    expect(r.lines[1]?.period).toBe('monthly')
    expect(r.lines[2]?.label).toBe('Self-host Docker')
    expect(r.lines[2]?.period).toBe('yearly')
  })

  it('Inclut une ligne « X sièges supplémentaires » si dégressivité', () => {
    const r = computePricing({ segment: 'cto_sme', seats: 12, mode: 'maison', addons: [] })
    expect(r.lines.length).toBe(2) // base + extras
    expect(r.lines[1]?.label).toContain('7 sièges supplémentaires')
    expect(r.lines[1]?.label).toContain('15 %')
  })
})

describe('formatEuro', () => {
  it('Formate sans décimales par défaut, en français', () => {
    const formatted = formatEuro(1234)
    expect(formatted).toContain('1')
    expect(formatted).toContain('234')
    expect(formatted).toContain('€')
  })

  it('Accepte un nombre de décimales personnalisé', () => {
    const formatted = formatEuro(49.5, { decimals: 2 })
    expect(formatted).toContain('49,50')
  })
})

describe('getBaseLabel', () => {
  it('Solo affiche « (1 user) »', () => {
    expect(getBaseLabel('solo', 'maison', 1)).toBe('Solo Maison (1 user)')
  })

  it('Newsletter affiche « (3 éditeurs inclus) »', () => {
    expect(getBaseLabel('newsletter', 'byok', 3)).toBe('Newsletter BYOK (3 éditeurs inclus)')
  })

  it('Autres segments affichent « (N sièges) »', () => {
    expect(getBaseLabel('cto_sme', 'maison', 5)).toBe('CTO PME Maison (5 sièges)')
    expect(getBaseLabel('vc_pe', 'byok', 5)).toBe('VC / PE BYOK (5 sièges)')
  })
})

describe('Constantes pricing', () => {
  it('BASE_PRICES contient bien 6 segments', () => {
    expect(Object.keys(BASE_PRICES)).toHaveLength(6)
  })

  it('ADDONS contient bien 9 add-ons', () => {
    expect(Object.keys(ADDONS)).toHaveLength(9)
  })

  it('Self-host et CSM dédié sont annuels, les autres mensuels', () => {
    expect(ADDONS.selfhost.period).toBe('yearly')
    expect(ADDONS.csm_dedicated.period).toBe('yearly')
    expect(ADDONS.webhooks.period).toBe('monthly')
    expect(ADDONS.api_public.period).toBe('monthly')
  })
})

// ---------------------------------------------------------------------------
// Wave 8.A — Conversion devises
// ---------------------------------------------------------------------------

const TEST_RATES: ExchangeRates = {
  EUR: 1,
  USD: 1.05,
  GBP: 0.86,
  CHF: 0.95,
  CAD: 1.45,
  AUD: 1.62,
  JPY: 160,
}

describe('convertFromEur', () => {
  it('Renvoie le même montant si devise = EUR', () => {
    expect(convertFromEur(49, 'EUR', TEST_RATES)).toBe(49)
  })

  it('Convertit 49 € en USD avec taux 1.05', () => {
    expect(convertFromEur(49, 'USD', TEST_RATES)).toBeCloseTo(51.45, 2)
  })

  it('Convertit 100 € en GBP avec taux 0.86', () => {
    expect(convertFromEur(100, 'GBP', TEST_RATES)).toBeCloseTo(86, 2)
  })

  it('Convertit 200 € en CHF avec taux 0.95', () => {
    expect(convertFromEur(200, 'CHF', TEST_RATES)).toBeCloseTo(190, 2)
  })

  it('Convertit 1000 € en JPY avec taux 160', () => {
    expect(convertFromEur(1000, 'JPY', TEST_RATES)).toBe(160000)
  })

  it('Fallback à 1 (= EUR) si taux manquant', () => {
    const partial = { EUR: 1 } as unknown as ExchangeRates
    expect(convertFromEur(49, 'USD', partial)).toBe(49)
  })
})

describe('formatPrice', () => {
  it('Formate USD en locale en-US sans décimales', () => {
    const formatted = formatPrice(51.45, 'USD', 'en-US')
    expect(formatted).toContain('$')
    expect(formatted).toContain('51')
  })

  it('Formate GBP en locale en-GB', () => {
    const formatted = formatPrice(86, 'GBP', 'en-GB')
    expect(formatted).toContain('£')
    expect(formatted).toContain('86')
  })

  it('JPY sans décimales (devise sans subdivision)', () => {
    const formatted = formatPrice(160, 'JPY', 'ja-JP')
    expect(formatted).toContain('160')
    expect(formatted).not.toContain('.0')
    expect(formatted).not.toContain(',0')
  })

  it('CHF formate en locale suisse', () => {
    const formatted = formatPrice(190, 'CHF', 'fr-CH')
    expect(formatted).toContain('190')
  })
})

describe('priceInCurrency', () => {
  it('Solo Maison 49 € ≈ $51 USD avec taux 1.05', () => {
    const result = priceInCurrency(49, 'USD', TEST_RATES, 'en-US')
    expect(result).toContain('$')
    // 49 × 1.05 = 51.45 → arrondi à 51
    expect(result).toMatch(/51/)
  })

  it('CTO PME 149 € ≈ £128 GBP avec taux 0.86', () => {
    const result = priceInCurrency(149, 'GBP', TEST_RATES, 'en-GB')
    // 149 × 0.86 = 128.14 → arrondi 128
    expect(result).toContain('£')
    expect(result).toMatch(/128/)
  })

  it('VC 599 € ≈ ¥95 840 JPY avec taux 160', () => {
    const result = priceInCurrency(599, 'JPY', TEST_RATES, 'ja-JP')
    // 599 × 160 = 95 840
    expect(result).toMatch(/95.?840/)
  })

  it('EUR reste identique au montant source (rate 1)', () => {
    const result = priceInCurrency(499, 'EUR', TEST_RATES, 'fr-FR')
    expect(result).toContain('499')
    expect(result).toContain('€')
  })
})
