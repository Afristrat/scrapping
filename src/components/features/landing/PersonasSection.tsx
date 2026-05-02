import { Briefcase, Code2, Megaphone, Newspaper, Rocket, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { FALLBACK_RATES, useExchangeRates } from '@/hooks/useExchangeRates'
import { type ExchangeRates, priceInCurrency } from '@/lib/pricing'
import { CURRENCIES, type CurrencyCode, useCurrencyStore } from '@/stores/currency'

interface Persona {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  segment: string
  headline: string
  subline: string
  maisonLabel: string
  /** Prix Maison en EUR (converti à l'affichage). */
  maisonPriceEur: number
  byokLabel: string
  /** Prix BYOK en EUR (converti à l'affichage). */
  byokPriceEur: number
  /** Solo card est légèrement déclassée visuellement. */
  muted?: boolean
  /** Note additionnelle (essai 14 j sur Solo par exemple). */
  note?: string
}

const PERSONAS: Persona[] = [
  {
    icon: Briefcase,
    segment: 'VC / Private equity IA',
    headline: 'Ne ratez plus un deal qui démarre sur arXiv.',
    subline:
      'Sources tier 1 IA, alertes lifecycle, suivi de cohortes de chercheurs, mémoire des acteurs émergents.',
    maisonLabel: 'Maison (Sonnet inclus)',
    maisonPriceEur: 599,
    byokLabel: 'BYOK (votre Opus)',
    byokPriceEur: 999,
  },
  {
    icon: Scale,
    segment: "Cabinet d'avocats / IA Act",
    headline: 'Anticipez la réglementation, ne la suivez pas.',
    subline:
      'Sources EU AI Office, AAAI, FAccT. Cross-source corroboration. Audit log et export PDF.',
    maisonLabel: 'Maison',
    maisonPriceEur: 399,
    byokLabel: 'BYOK',
    byokPriceEur: 699,
  },
  {
    icon: Newspaper,
    segment: 'Newsletter / éditeurs IA',
    headline: 'Publiez avant TechCrunch.',
    subline:
      'Backtest illimité de vos grilles éditoriales, webhooks Slack/Teams, API read+write, branding white-label.',
    maisonLabel: 'Maison (3 sièges)',
    maisonPriceEur: 499,
    byokLabel: 'BYOK (3 sièges)',
    byokPriceEur: 799,
  },
  {
    icon: Megaphone,
    segment: 'Brand / Marketing IA-corp',
    headline: 'Vos conversations brand restent dans VOTRE infra.',
    subline:
      'Author reputation, sentiment, alerting Slack temps réel. Tenant isolé et rubriques confidentielles.',
    maisonLabel: 'Maison',
    maisonPriceEur: 499,
    byokLabel: 'BYOK',
    byokPriceEur: 799,
  },
  {
    icon: Code2,
    segment: 'CTO / Tech Lead PME',
    headline: 'Validez vos choix techno avant 6 mois de dev.',
    subline:
      'Rubriques RAG / agents / local LLM curatées, intégration Ollama / vLLM auto-hosted en BYOK.',
    maisonLabel: 'Maison (5 sièges)',
    maisonPriceEur: 149,
    byokLabel: 'BYOK (5 sièges)',
    byokPriceEur: 249,
  },
  {
    icon: Rocket,
    segment: 'Solo créateur IA',
    headline: 'Votre clé, votre choix de modèle.',
    subline:
      "Une rubrique, 100 signaux/jour, mémoire 30 j. Funnel d'entrée pour découvrir l'outil.",
    maisonLabel: 'Maison Haiku',
    maisonPriceEur: 49,
    byokLabel: 'BYOK',
    byokPriceEur: 99,
    muted: true,
    note: 'Essai 14 j sans carte requise.',
  },
]

function getLocaleForCurrency(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.locale ?? 'fr-FR'
}

interface PersonaCardProps {
  persona: Persona
  currency: CurrencyCode
  rates: ExchangeRates
}

function PersonaCard({ persona, currency, rates }: PersonaCardProps): React.ReactElement {
  const {
    icon: Icon,
    segment,
    headline,
    subline,
    maisonLabel,
    maisonPriceEur,
    byokLabel,
    byokPriceEur,
    muted,
    note,
  } = persona
  const locale = getLocaleForCurrency(currency)
  const maisonPrice = priceInCurrency(maisonPriceEur, currency, rates, locale)
  const byokPrice = priceInCurrency(byokPriceEur, currency, rates, locale)
  const iconWrapClasses = muted
    ? 'bg-surface-container-highest text-on-surface-variant'
    : 'bg-primary-fixed text-on-primary-fixed'
  const segmentBadgeClasses = muted
    ? 'bg-surface-variant text-on-surface-variant'
    : 'bg-surface-container text-primary-container'

  return (
    <article className="bg-surface-container-lowest border-outline-variant hover:border-primary-fixed-dim group flex h-full flex-col rounded-xl border p-6 transition-all duration-300 hover:shadow-md">
      <div
        className={`mb-6 flex h-12 w-12 items-center justify-center rounded-lg ${iconWrapClasses}`}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="mb-6 flex-grow">
        <span
          className={`mb-4 inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.05em] uppercase ${segmentBadgeClasses}`}
        >
          {segment}
        </span>
        <h3 className="text-on-surface group-hover:text-primary mb-3 text-xl font-semibold tracking-[-0.01em] transition-colors">
          {headline}
        </h3>
        <p className="text-on-surface-variant text-sm leading-relaxed">{subline}</p>
      </div>
      <div className="border-outline-variant mt-auto border-t pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-on-surface-variant text-sm">{maisonLabel}</span>
          <span className="text-on-surface text-base font-semibold">{maisonPrice}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-on-surface-variant text-sm">{byokLabel}</span>
          <span className="text-on-surface text-base font-semibold">{byokPrice}</span>
        </div>
        {note ? (
          <p className="text-primary mt-3 text-center text-[11px] font-semibold tracking-[0.05em] uppercase">
            {note}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export function PersonasSection(): React.ReactElement {
  const currency = useCurrencyStore((s) => s.currency)
  const { data: rates } = useExchangeRates()
  const safeRates = rates ?? FALLBACK_RATES

  return (
    <section
      id="personas"
      className="bg-surface-container-low border-outline-variant border-b py-24"
    >
      <div className="mx-auto w-full max-w-[72rem] px-6">
        <div className="mb-16 text-center">
          <p className="text-on-surface-variant mb-3 text-xs font-semibold tracking-[0.05em] uppercase">
            Pour qui
          </p>
          <h2 className="text-on-surface mb-4 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            6 façons de capturer la valeur.
          </h2>
          <p className="text-on-surface-variant mx-auto max-w-2xl text-lg leading-relaxed">
            Kairos s'adapte à votre métier. Le tarif suit la valeur que vous capturez. Choisissez le
            mode Maison (LLM inclus) ou BYOK (vos clés, votre stack).
          </p>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p) => (
            <PersonaCard key={p.segment} persona={p} currency={currency} rates={safeRates} />
          ))}
        </div>

        <div className="bg-surface-container-lowest border-outline-variant flex flex-col items-center justify-between gap-6 rounded-xl border p-8 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-on-surface text-lg font-semibold">
              Vous ne vous reconnaissez pas dans une de ces 6 cartes ?
            </p>
            <p className="text-on-surface-variant mt-1 text-sm">
              Nous construisons des solutions sur-mesure pour les cas d'usage atypiques.
            </p>
          </div>
          <Button
            asChild
            className="bg-primary text-on-primary hover:bg-primary-container gap-2 rounded-xl shadow-sm"
          >
            <Link to="/pricing">
              Décrivez-nous votre cas
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
