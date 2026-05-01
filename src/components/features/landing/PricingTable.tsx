import { ArrowRight, Building2, Check, Mail, Sparkles, Star, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const CONTACT_EMAIL = 'hello@zlatan-scrap.com'

type PricingMode = 'maison' | 'byok'

interface SeatPricing {
  /** Prix par seat sous le seuil de dégressivité (1-5). */
  base: number
  /** Prix par seat au-delà du seuil avec discount appliqué (6-25). */
  discounted: number
  /** Nombre de seats facturés au tarif `base`. */
  baseSeatThreshold: number
  /** Description du discount affichée sous le slider. */
  discountLabel: string
}

interface PlanContent {
  badge?: string
  recommended?: boolean
  name: string
  pitch: string
  priceLabel: string
  priceSuffix?: string
  description?: string
  features: string[]
  ctaLabel: string
  ctaTo?: string
  ctaHref?: string
  ctaVariant?: 'default' | 'outline' | 'secondary'
}

interface PricingByMode {
  solo: PlanContent
  pro: PlanContent & { seatPricing: SeatPricing }
  enterprise: PlanContent
}

const PRICING: Record<PricingMode, PricingByMode> = {
  maison: {
    solo: {
      name: 'Solo',
      pitch: "Pour découvrir l'outil en autonomie.",
      priceLabel: '49 €',
      priceSuffix: '/mois',
      description: 'LLM Maison Haiku inclus. Essai 14 j sans carte bancaire.',
      features: [
        '1 utilisateur, 100 signaux / jour',
        '1 rubric de scoring',
        'Memory topics 30 jours',
        'BYOK 10 providers (option)',
        'Cascade {{run:<source>}}',
        'Support communauté',
      ],
      ctaLabel: 'Démarrer (essai 14 j)',
      ctaTo: '/signup?next=/dashboard',
      ctaVariant: 'outline',
    },
    pro: {
      name: 'Pro',
      pitch: 'Toutes les équipes — VC, avocats, éditeurs, brand, CTO.',
      recommended: true,
      badge: 'Recommandé',
      priceLabel: 'à partir de 399 €',
      priceSuffix: '/mois',
      description: '5 seats inclus. LLM Maison Sonnet inclus. Configurez selon votre profil.',
      features: [
        "5 seats inclus, jusqu'à 25 (slider ci-dessus)",
        'Multi-LLM consensus (à venir)',
        'Sources illimitées (X, Reddit, arXiv, custom)',
        'Memory topics 365 jours',
        'API read + write, webhooks',
        'Backtest 5 / mois',
        'Support email 48 h',
      ],
      ctaLabel: 'Configurer mon offre',
      ctaTo: '/signup?next=/dashboard',
      ctaVariant: 'default',
      seatPricing: {
        base: 399,
        discounted: 149 * 0.85,
        baseSeatThreshold: 5,
        discountLabel: '5 seats inclus · +149 €/seat additionnel · -15 % au-delà du 6e seat',
      },
    },
    enterprise: {
      name: 'Enterprise',
      pitch: 'Pour les organisations qui exigent souveraineté et SLA.',
      priceLabel: 'Sur devis',
      priceSuffix: '',
      description: "À partir d'environ 6 000 €/mois selon usage et seats.",
      features: [
        'Tenant isolé OU self-host Docker',
        'BYOK Opus / Sonnet (au choix par tâche)',
        'Author Reputation API',
        'Custom rubrics confidentielles',
        'Audit log + compliance pack',
        'CSM dédié, onboarding sur-mesure',
        'SLA 99,9 %',
      ],
      ctaLabel: 'Contactez-nous',
      ctaHref: `mailto:${CONTACT_EMAIL}?subject=zlatan-scrap%20Enterprise`,
      ctaVariant: 'outline',
    },
  },
  byok: {
    solo: {
      name: 'Solo',
      pitch: 'Vos clés, votre choix de modèle.',
      priceLabel: '99 €',
      priceSuffix: '/mois',
      description: 'BYOK 10 providers. Vous payez votre conso LLM directement à votre provider.',
      features: [
        '1 utilisateur, 100 signaux / jour',
        '1 rubric de scoring',
        'Memory topics 30 jours',
        'BYOK 10 providers (Anthropic, OpenAI, Mistral…)',
        'Cascade {{run:<source>}}',
        'Support communauté',
      ],
      ctaLabel: 'Démarrer (essai 14 j)',
      ctaTo: '/signup?next=/dashboard',
      ctaVariant: 'outline',
    },
    pro: {
      name: 'Pro',
      pitch: 'Souveraineté + équipe — VC, avocats, éditeurs, brand.',
      recommended: true,
      badge: 'Recommandé',
      priceLabel: 'à partir de 699 €',
      priceSuffix: '/mois',
      description: '5 seats inclus. BYOK Sonnet / Opus selon votre stack.',
      features: [
        "5 seats inclus, jusqu'à 25 (slider ci-dessus)",
        'BYOK 10 providers, 1 modèle par tâche',
        'Multi-LLM consensus (à venir)',
        'Sources illimitées (X, Reddit, arXiv, custom)',
        'Memory topics 365 jours',
        'API read + write, webhooks',
        'Backtest 5 / mois',
        'Support email 48 h',
      ],
      ctaLabel: 'Configurer mon offre',
      ctaTo: '/signup?next=/dashboard',
      ctaVariant: 'default',
      seatPricing: {
        base: 699,
        discounted: 249 * 0.9,
        baseSeatThreshold: 5,
        discountLabel: '5 seats inclus · +249 €/seat additionnel · -10 % au-delà du 6e seat',
      },
    },
    enterprise: {
      name: 'Enterprise',
      pitch: 'BYOK enterprise + tenant isolé ou self-host.',
      priceLabel: 'Sur devis',
      priceSuffix: '',
      description: "À partir d'environ 6 000 €/mois selon usage et seats.",
      features: [
        'Tenant isolé OU self-host Docker',
        'BYOK Opus / Sonnet, intégration K8s / Ollama / vLLM',
        'Author Reputation API',
        'Custom rubrics confidentielles',
        'Audit log + compliance pack',
        'CSM dédié, onboarding sur-mesure',
        'SLA 99,9 %',
      ],
      ctaLabel: 'Contactez-nous',
      ctaHref: `mailto:${CONTACT_EMAIL}?subject=zlatan-scrap%20Enterprise%20BYOK`,
      ctaVariant: 'outline',
    },
  },
}

const MIN_SEATS = 5
const MAX_SEATS = 25

function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

function computeProTotal(seats: number, seatPricing: SeatPricing): number {
  const { base, discounted, baseSeatThreshold } = seatPricing
  if (seats <= baseSeatThreshold) {
    return base
  }
  const additional = seats - baseSeatThreshold
  return base + additional * discounted
}

interface PlanCardProps {
  plan: PlanContent
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  children?: React.ReactNode
}

function PlanCard({ plan, icon: Icon, children }: PlanCardProps): React.ReactElement {
  const ctaVariant = plan.ctaVariant ?? 'default'
  const recommended = plan.recommended === true

  return (
    <div
      className={cn(
        'relative flex h-full flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm transition-shadow',
        recommended
          ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500/20'
          : 'border-slate-200',
      )}
    >
      {plan.badge ? (
        <Badge
          className={cn(
            'absolute -top-3 left-6 gap-1',
            recommended ? 'bg-emerald-600 text-white hover:bg-emerald-600' : '',
          )}
        >
          {recommended ? <Star className="h-3 w-3" aria-hidden /> : null}
          {plan.badge}
        </Badge>
      ) : null}

      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md',
            recommended ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
          <p className="text-sm text-slate-500">{plan.pitch}</p>
        </div>
      </div>

      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight text-slate-900">
            {plan.priceLabel}
          </span>
          {plan.priceSuffix ? (
            <span className="text-sm text-slate-500">{plan.priceSuffix}</span>
          ) : null}
        </p>
        {plan.description ? (
          <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
        ) : null}
      </div>

      {children}

      <ul className="flex flex-col gap-2 text-sm text-slate-700">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                recommended ? 'text-emerald-600' : 'text-slate-500',
              )}
              aria-hidden
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">
        {plan.ctaTo !== undefined ? (
          <Button asChild size="lg" variant={ctaVariant} className="w-full gap-2">
            <Link to={plan.ctaTo}>
              {plan.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
        {plan.ctaHref !== undefined ? (
          <Button asChild size="lg" variant={ctaVariant} className="w-full gap-2">
            <a href={plan.ctaHref}>
              <Mail className="h-4 w-4" aria-hidden />
              {plan.ctaLabel}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

interface ProSeatConfiguratorProps {
  seats: number
  onChange: (seats: number) => void
  total: number
  discountLabel: string
}

function ProSeatConfigurator({
  seats,
  onChange,
  total,
  discountLabel,
}: ProSeatConfiguratorProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">
          Seats : <span className="font-semibold text-slate-900">{seats}</span>
        </span>
        <span className="text-sm font-semibold text-emerald-700">
          {formatEuro(total)}
          <span className="text-xs font-normal text-slate-500"> /mois</span>
        </span>
      </div>
      <Slider
        min={MIN_SEATS}
        max={MAX_SEATS}
        step={1}
        value={[seats]}
        onValueChange={(v) => {
          const next = v[0]
          if (typeof next === 'number') {
            onChange(next)
          }
        }}
        aria-label="Nombre de seats"
      />
      <p className="text-xs text-slate-500">{discountLabel}</p>
    </div>
  )
}

export function PricingTable(): React.ReactElement {
  const [mode, setMode] = useState<PricingMode>('maison')
  const [seats, setSeats] = useState<number>(MIN_SEATS)

  const proPlan = PRICING[mode].pro
  const proTotal = useMemo(
    () => computeProTotal(seats, proPlan.seatPricing),
    [seats, proPlan.seatPricing],
  )

  const proPlanWithComputedPrice: PlanContent = {
    ...proPlan,
    priceLabel: formatEuro(proTotal),
    priceSuffix: '/mois',
    description:
      seats === MIN_SEATS
        ? proPlan.description
        : `${seats} seats configurés · base ${formatEuro(proPlan.seatPricing.base)} + ${seats - MIN_SEATS} seat${seats - MIN_SEATS > 1 ? 's' : ''} additionnel${seats - MIN_SEATS > 1 ? 's' : ''} avec dégressivité.`,
  }

  return (
    <section id="pricing" className="border-b border-slate-100 bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold tracking-wider text-blue-700 uppercase">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Trois paliers visibles. Un configurateur sous le capot.
          </h2>
          <p className="mt-3 text-slate-600">
            Choisissez votre mode — Maison ou BYOK — puis ajustez la taille de votre équipe. Le
            tarif s'adapte. Les 12 SKUs détaillés (par segment et seats) émergent du configurateur
            après inscription.
          </p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as PricingMode)}
          className="mb-8 items-center"
        >
          <TabsList className="h-11 rounded-full bg-slate-200/70 p-1">
            <TabsTrigger
              value="maison"
              className="rounded-full px-5 data-[state=active]:bg-white data-[state=active]:text-emerald-700"
            >
              LLM Maison (tout-inclus)
            </TabsTrigger>
            <TabsTrigger
              value="byok"
              className="rounded-full px-5 data-[state=active]:bg-white data-[state=active]:text-blue-700"
            >
              BYOK (apportez vos clés)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maison" className="mt-6">
            <p className="mx-auto max-w-3xl text-center text-sm text-slate-600">
              <span className="font-medium text-slate-800">Mode Maison</span> : nous gérons les LLM
              (Haiku ou Sonnet selon palier), vous payez un forfait. Idéal pour démarrer vite, sans
              gérer de clés ni de monitoring multi-providers.
            </p>
          </TabsContent>
          <TabsContent value="byok" className="mt-6">
            <p className="mx-auto max-w-3xl text-center text-sm text-slate-600">
              <span className="font-medium text-slate-800">Mode BYOK</span> : vous apportez vos clés
              OpenRouter / Anthropic / OpenAI / Mistral / 6 autres. Vous gardez le contrôle de vos
              modèles et de vos données — recommandé pour cas enterprise et data-sensible.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PlanCard plan={PRICING[mode].solo} icon={Sparkles} />
          <PlanCard plan={proPlanWithComputedPrice} icon={Users}>
            <ProSeatConfigurator
              seats={seats}
              onChange={setSeats}
              total={proTotal}
              discountLabel={proPlan.seatPricing.discountLabel}
            />
            <p className="-mt-1 text-xs text-slate-500">
              Adapté à VC, avocats, newsletters, brands, CTOs — configurez selon votre profil après
              inscription.
            </p>
          </PlanCard>
          <PlanCard plan={PRICING[mode].enterprise} icon={Building2} />
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Vous êtes VC, cabinet d'avocats, éditeur média ou brand ?
            </p>
            <p className="text-sm text-slate-600">
              Nous proposons des bundles dédiés (tenant isolé, custom rubrics, CSM). Démo en 30
              minutes.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <a href={`mailto:${CONTACT_EMAIL}?subject=zlatan-scrap%20-%20Demande%20de%20d%C3%A9mo`}>
              <Mail className="h-4 w-4" aria-hidden />
              Contactez-nous pour une démo
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
