import {
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  Code2,
  Mail,
  Megaphone,
  Newspaper,
  Rocket,
  Scale,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useContactEmail } from '@/hooks/useAppSettings'
import { FALLBACK_RATES, useExchangeRates } from '@/hooks/useExchangeRates'
import {
  ADDONS,
  type AddonId,
  BASE_PRICES,
  type BillingMode,
  computePricing,
  type ExchangeRates,
  priceInCurrency,
  type Segment,
} from '@/lib/pricing'
import { CURRENCIES, type CurrencyCode, useCurrencyStore } from '@/stores/currency'
import { cn } from '@/lib/utils'

interface SegmentDef {
  id: Segment
  name: string
  pitch: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}

const SEGMENTS: SegmentDef[] = [
  {
    id: 'vc_pe',
    name: 'VC / Private Equity IA',
    pitch: 'Deal flow, dues diligences, scoring de fonds.',
    icon: Briefcase,
  },
  {
    id: 'legal',
    name: "Cabinet d'avocats / IA Act",
    pitch: 'Veille EU AI Office, RGPD, conformité.',
    icon: Scale,
  },
  {
    id: 'newsletter',
    name: 'Newsletter / éditeur média',
    pitch: 'Curation de signaux pour vos lecteurs.',
    icon: Newspaper,
  },
  {
    id: 'brand',
    name: 'Brand / Marketing IA',
    pitch: 'Veille marque, sentiment, author reputation.',
    icon: Megaphone,
  },
  {
    id: 'cto_sme',
    name: 'CTO / Tech Lead PME',
    pitch: 'Sweet spot mid-market, RAG, agents, local LLM.',
    icon: Code2,
  },
  {
    id: 'solo',
    name: 'Solo créateur',
    pitch: 'Démarrage 14 j sans carte. Funnel SEO.',
    icon: Rocket,
  },
]

interface AddonDisplay {
  id: AddonId
  description: string
  comingSoon?: boolean
}

const ADDONS_DISPLAY: AddonDisplay[] = [
  { id: 'webhooks', description: 'Notifications temps réel multi-canaux.' },
  { id: 'api_public', description: 'REST + webhooks pour intégrer vos workflows.' },
  { id: 'custom_sources', description: 'RSS, listes privées, scraping ciblé.' },
  { id: 'audit_log', description: "Journal d'événements + export CSV." },
  { id: 'tenant_isolated', description: 'Schéma Postgres dédié, données cloisonnées.' },
  { id: 'selfhost', description: 'Bundle Docker + support déploiement.' },
  { id: 'csm_dedicated', description: 'Customer Success Manager + onboarding sur-mesure.' },
  { id: 'backtest_unlimited', description: '5/mois inclus → illimité.' },
  { id: 'reputation_api', description: 'Score de crédibilité par auteur.', comingSoon: true },
]

interface SkuRow {
  segment: string
  maisonEur: number
  byokEur: number
  /** Suffixe (ex. « /seat/mois », « /mois (3 éditeurs) »). */
  suffix: string
  argument: string
}

const TWELVE_SKUS: SkuRow[] = [
  {
    segment: 'VC / PE IA',
    maisonEur: 599,
    byokEur: 999,
    suffix: '/seat/mois',
    argument: 'Vos deals, votre Opus, votre tenant.',
  },
  {
    segment: "Cabinet d'avocats IA Act",
    maisonEur: 399,
    byokEur: 699,
    suffix: '/seat/mois',
    argument: 'Vos requêtes confidentielles, traçabilité complète.',
  },
  {
    segment: 'Newsletter / éditeurs',
    maisonEur: 499,
    byokEur: 799,
    suffix: '/mois (3 éditeurs)',
    argument: 'Votre rédacteur en chef LLM.',
  },
  {
    segment: 'Brand / Marketing IA',
    maisonEur: 499,
    byokEur: 799,
    suffix: '/seat/mois',
    argument: 'Vos conversations brand restent chez vous.',
  },
  {
    segment: 'CTO / Tech Lead PME',
    maisonEur: 149,
    byokEur: 249,
    suffix: '/seat/mois',
    argument: 'Votre infra LLM, notre intelligence de filtrage.',
  },
  {
    segment: 'Solo créateur',
    maisonEur: 49,
    byokEur: 99,
    suffix: '/mois',
    argument: 'Funnel SEO. Upsell vers Team à 30 j.',
  },
]

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Quelle différence Maison vs BYOK ?',
    a: 'En mode Maison, nous gérons les modèles LLM (Sonnet économique inclus). Vous payez un forfait stable, sans gérer de clés. En BYOK, vous apportez vos propres clés (10 providers : OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama). Souveraineté totale et contrôle des coûts LLM.',
  },
  {
    q: 'Comment fonctionne la dégressivité par seat ?',
    a: 'À partir du 6e siège, -15 % en Maison et -10 % en BYOK sur chaque siège additionnel. À partir du 26e siège, -30 % en Maison et -20 % en BYOK. Au-delà de 100 sièges, contactez-nous pour un tarif négocié.',
  },
  {
    q: 'Et si je veux changer de segment plus tard ?',
    a: 'Vous pouvez basculer de segment à tout moment depuis vos réglages. Le prochain cycle de facturation appliquera le nouveau tarif au prorata. Aucune pénalité, aucun engagement annuel.',
  },
  {
    q: "Que se passe-t-il après l'essai 14 j ?",
    a: "Nous vous prévenons par email 3 jours avant la fin de l'essai. Aucun prélèvement automatique : vous devez explicitement valider votre carte pour démarrer la facturation. Sinon, votre compte bascule en lecture seule.",
  },
]

interface SegmentCardProps {
  segment: SegmentDef
  selected: boolean
  onSelect: (id: Segment) => void
}

function SegmentCard({ segment, selected, onSelect }: SegmentCardProps): React.ReactElement {
  const Icon = segment.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(segment.id)}
      aria-pressed={selected}
      className={cn(
        'relative flex h-full flex-col items-start gap-2 rounded-xl border bg-white p-5 text-left transition-all',
        'hover:border-emerald-300 hover:shadow-sm',
        selected ? 'border-emerald-500 shadow-md ring-2 ring-emerald-200' : 'border-slate-200',
      )}
    >
      {selected ? (
        <span
          className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white"
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-md',
          selected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="font-semibold text-slate-900">{segment.name}</span>
      <span className="text-sm text-slate-500">{segment.pitch}</span>
    </button>
  )
}

interface AddonCardProps {
  id: AddonId
  enabled: boolean
  description: string
  comingSoon?: boolean
  onToggle: (id: AddonId, next: boolean) => void
  currency: CurrencyCode
  rates: ExchangeRates
  locale: string
}

function AddonCard({
  id,
  enabled,
  description,
  comingSoon,
  onToggle,
  currency,
  rates,
  locale,
}: AddonCardProps): React.ReactElement {
  const def = ADDONS[id]
  const periodLabel = def.period === 'monthly' ? '/mois' : '/an'
  const formattedPrice = priceInCurrency(def.price, currency, rates, locale)
  return (
    <button
      type="button"
      onClick={() => {
        if (comingSoon !== true) onToggle(id, !enabled)
      }}
      aria-pressed={enabled}
      disabled={comingSoon === true}
      className={cn(
        'relative flex h-full flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left transition-all',
        comingSoon === true
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-emerald-300 hover:shadow-sm',
        enabled ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="font-medium text-slate-900">{def.label}</span>
        <span
          className={cn(
            'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
            enabled ? 'bg-emerald-600' : 'bg-slate-200',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'block h-4 w-4 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      </div>
      <p className="text-xs text-slate-500">{description}</p>
      <div className="mt-auto flex items-baseline gap-1 pt-2">
        <span className="text-base font-semibold text-slate-900">+{formattedPrice}</span>
        <span className="text-xs text-slate-500">{periodLabel}</span>
      </div>
      {comingSoon === true ? (
        <Badge variant="outline" className="absolute top-3 right-3 border-slate-300 text-slate-500">
          À venir Q4 2026
        </Badge>
      ) : null}
    </button>
  )
}

function defaultSeatsFor(segment: Segment): number {
  if (segment === 'solo') return 1
  return BASE_PRICES[segment].default_seats
}

function getLocaleForCurrency(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.locale ?? 'fr-FR'
}

function buildSignupUrl(
  segment: Segment,
  seats: number,
  mode: BillingMode,
  addons: AddonId[],
): string {
  const params = new URLSearchParams({
    segment,
    seats: String(seats),
    mode,
    next: '/dashboard',
  })
  if (addons.length > 0) params.set('addons', addons.join(','))
  return `/signup?${params.toString()}`
}

export default function PricingPublic(): React.ReactElement {
  const [segment, setSegment] = useState<Segment>('cto_sme')
  const [mode, setMode] = useState<BillingMode>('maison')
  const [seats, setSeats] = useState<number>(defaultSeatsFor('cto_sme'))
  const [addons, setAddons] = useState<AddonId[]>([])
  const [showSkus, setShowSkus] = useState(false)

  const currency = useCurrencyStore((s) => s.currency)
  const { data: rates } = useExchangeRates()
  const safeRates = rates ?? FALLBACK_RATES
  const locale = getLocaleForCurrency(currency)
  const formatAmount = (eur: number): string => priceInCurrency(eur, currency, safeRates, locale)
  const contactEmail = useContactEmail()

  const breakdown = useMemo(
    () => computePricing({ segment, seats, mode, addons }),
    [segment, seats, mode, addons],
  )

  function handleSelectSegment(next: Segment): void {
    setSegment(next)
    // Réinitialise seats au défaut du nouveau segment pour un calcul cohérent.
    setSeats(defaultSeatsFor(next))
  }

  function toggleAddon(id: AddonId, enabled: boolean): void {
    setAddons((prev) => {
      if (enabled) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((a) => a !== id)
    })
  }

  const isSolo = segment === 'solo'
  const isFlat = !BASE_PRICES[segment].per_seat
  const sliderMax = isSolo ? 1 : 25
  const sliderMin = 1
  const sliderDisabled = isSolo
  const seatsTooHigh = seats > 25

  const monthlyLines = breakdown.lines.filter((l) => l.period === 'monthly')
  const yearlyLines = breakdown.lines.filter((l) => l.period === 'yearly')

  const signupHref = buildSignupUrl(segment, seats, mode, addons)

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <Badge className="mb-4 gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <Sparkles className="h-3 w-3" aria-hidden />
              Configurateur live
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Configurez votre stack Kairos
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Choisissez votre profil + seats + mode LLM. Le prix se calcule en temps réel. Essai 14
              j sans carte.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* Colonne gauche — configurateur */}
          <div className="flex flex-col gap-12">
            {/* Section 1 — Segment */}
            <section aria-labelledby="step-segment">
              <div className="mb-5 flex items-baseline gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  1
                </span>
                <h2 id="step-segment" className="text-xl font-semibold text-slate-900">
                  Qui êtes-vous ?
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {SEGMENTS.map((s) => (
                  <SegmentCard
                    key={s.id}
                    segment={s}
                    selected={segment === s.id}
                    onSelect={handleSelectSegment}
                  />
                ))}
              </div>
            </section>

            {/* Section 2 — Seats */}
            <section aria-labelledby="step-seats">
              <div className="mb-5 flex items-baseline gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  2
                </span>
                <h2 id="step-seats" className="text-xl font-semibold text-slate-900">
                  Combien de sièges ?
                </h2>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                {isSolo ? (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">1 utilisateur.</span> Invitez votre
                    équipe en passant sur l'offre Pro (CTO PME, Brand, Newsletter…).
                  </p>
                ) : isFlat ? (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">
                      Forfait flat — 3 éditeurs inclus.
                    </span>{' '}
                    Pour plus d'utilisateurs, contactez-nous.
                  </p>
                ) : (
                  <>
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700">
                        <span className="text-2xl font-semibold text-slate-900">{seats}</span> siège
                        {seats > 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-slate-500">
                        Min 1 · Max 25 (au-delà : nous contacter)
                      </span>
                    </div>
                    <Slider
                      min={sliderMin}
                      max={sliderMax}
                      step={1}
                      value={[seats]}
                      disabled={sliderDisabled}
                      onValueChange={(v) => {
                        const next = v[0]
                        if (typeof next === 'number') setSeats(next)
                      }}
                      aria-label="Nombre de sièges"
                    />
                    <p className="mt-3 text-xs text-slate-500">
                      Dégressivité {mode === 'maison' ? '-15 %' : '-10 %'} à partir du 6e siège,
                      {mode === 'maison' ? ' -30 %' : ' -20 %'} au-delà du 26e.
                    </p>
                  </>
                )}
                {seatsTooHigh ? (
                  <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                    Plus de 25 sièges ?{' '}
                    <a
                      href={`mailto:${contactEmail}?subject=Kairos%20-%20Volume%20%3E%2025%20si%C3%A8ges`}
                      className="font-medium underline underline-offset-2"
                    >
                      Contactez-nous
                    </a>{' '}
                    pour un devis sur-mesure.
                  </p>
                ) : null}
              </div>
            </section>

            {/* Section 3 — Mode LLM */}
            <section aria-labelledby="step-mode">
              <div className="mb-5 flex items-baseline gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  3
                </span>
                <h2 id="step-mode" className="text-xl font-semibold text-slate-900">
                  Mode LLM
                </h2>
              </div>
              <Tabs value={mode} onValueChange={(v) => setMode(v as BillingMode)}>
                <TabsList className="h-11 w-full max-w-xl rounded-full bg-slate-100 p-1">
                  <TabsTrigger
                    value="maison"
                    className="flex-1 rounded-full data-[state=active]:bg-white data-[state=active]:text-emerald-700"
                  >
                    LLM Maison (tout-inclus)
                  </TabsTrigger>
                  <TabsTrigger
                    value="byok"
                    className="flex-1 rounded-full data-[state=active]:bg-white data-[state=active]:text-blue-700"
                  >
                    BYOK (vos clés)
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="maison" className="mt-4">
                  <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    Notre Sonnet économique inclus. Vous payez un forfait stable. Idéal pour
                    démarrer vite, sans gérer de clés ni de monitoring multi-providers.
                  </p>
                </TabsContent>
                <TabsContent value="byok" className="mt-4">
                  <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    Apportez vos clés (10 providers : OpenRouter, Anthropic, OpenAI, Google,
                    Mistral, Groq, Together, DeepSeek, Moonshot, Ollama). Souveraineté + contrôle
                    des coûts LLM.
                  </p>
                </TabsContent>
              </Tabs>
            </section>

            {/* Section 4 — Add-ons */}
            <section aria-labelledby="step-addons">
              <div className="mb-5 flex items-baseline gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  4
                </span>
                <h2 id="step-addons" className="text-xl font-semibold text-slate-900">
                  Add-ons
                </h2>
                <span className="ml-2 text-sm text-slate-500">Cliquez pour activer.</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {ADDONS_DISPLAY.map((a) => (
                  <AddonCard
                    key={a.id}
                    id={a.id}
                    enabled={addons.includes(a.id)}
                    description={a.description}
                    comingSoon={a.comingSoon}
                    onToggle={toggleAddon}
                    currency={currency}
                    rates={safeRates}
                    locale={locale}
                  />
                ))}
              </div>
            </section>

            {/* Section 6 — Tableau 12 SKUs */}
            <section aria-labelledby="skus-table" id="skus">
              <button
                type="button"
                onClick={() => setShowSkus((v) => !v)}
                aria-expanded={showSkus}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
              >
                <span className="font-medium text-slate-900">
                  Voir tous les paliers (12 SKUs détaillés)
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-slate-500 transition-transform',
                    showSkus ? 'rotate-180' : '',
                  )}
                  aria-hidden
                />
              </button>
              {showSkus ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left">
                      <tr>
                        <th id="skus-table" className="px-4 py-3 font-semibold text-slate-900">
                          Segment
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-900">Maison</th>
                        <th className="px-4 py-3 font-semibold text-slate-900">BYOK</th>
                        <th className="px-4 py-3 font-semibold text-slate-900">Argument BYOK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TWELVE_SKUS.map((row) => (
                        <tr key={row.segment} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.segment}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatAmount(row.maisonEur)}
                            {row.suffix}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatAmount(row.byokEur)}
                            {row.suffix}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{row.argument}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            {/* FAQ */}
            <section aria-labelledby="faq" className="border-t border-slate-100 pt-12">
              <h2 id="faq" className="text-2xl font-semibold text-slate-900">
                Questions fréquentes
              </h2>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                {FAQ.map((item) => (
                  <div key={item.q} className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="font-medium text-slate-900">{item.q}</p>
                    <p className="mt-2 text-sm text-slate-600">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Colonne droite — récap sticky */}
          <aside className="lg:sticky lg:top-20 lg:h-fit">
            <div className="rounded-2xl border-2 border-emerald-500 bg-white shadow-lg">
              <div className="border-b border-slate-100 bg-emerald-50/40 p-5">
                <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
                  Récapitulatif
                </p>
                <p className="mt-1 text-sm text-slate-600">{breakdown.base_label}</p>
              </div>

              <div className="flex flex-col gap-3 p-5">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    Mensuel
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                    {monthlyLines.map((line, idx) => (
                      <li
                        key={`${line.label}-${idx}`}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="text-slate-700">{line.label}</span>
                        <span className="shrink-0 font-medium text-slate-900">
                          {formatAmount(line.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-100 pt-3">
                    <span className="text-sm font-semibold text-slate-900">Total mensuel</span>
                    <span className="text-xl font-semibold text-slate-900">
                      {formatAmount(breakdown.total_monthly)}
                    </span>
                  </div>
                </div>

                {yearlyLines.length > 0 ? (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      Annuel (facturé à part)
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                      {yearlyLines.map((line, idx) => (
                        <li
                          key={`${line.label}-y-${idx}`}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <span className="text-slate-700">{line.label}</span>
                          <span className="shrink-0 font-medium text-slate-900">
                            {formatAmount(line.amount)}/an
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-slate-600">Total annualisé</span>
                    <span className="text-base font-semibold text-emerald-700">
                      {formatAmount(breakdown.total_annualized)}/an
                    </span>
                  </div>
                </div>

                <Button asChild size="lg" className="mt-2 w-full gap-2">
                  <Link to={signupHref}>
                    Démarrer l'essai 14 j
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>

                <a
                  href="#skus"
                  onClick={() => setShowSkus(true)}
                  className="text-center text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  Comparer aux 12 SKUs détaillés
                </a>
              </div>

              <div className="border-t border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-xs text-slate-500">
                  Besoin d'un setup sur-mesure ?{' '}
                  <a
                    href={`mailto:${contactEmail}?subject=Kairos%20Enterprise`}
                    className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
                  >
                    <Mail className="h-3 w-3" aria-hidden />
                    Contactez-nous
                  </a>
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
