import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Mail,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const CONTACT_EMAIL = 'hello@kairos.ai-mpower.com'

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
      ctaTo: '/pricing',
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
      ctaLabel: 'Contacter les ventes',
      ctaHref: `mailto:${CONTACT_EMAIL}?subject=Kairos%20Enterprise`,
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
      ctaTo: '/pricing',
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
      ctaLabel: 'Contacter les ventes',
      ctaHref: `mailto:${CONTACT_EMAIL}?subject=Kairos%20Enterprise%20BYOK`,
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
  variant?: 'standard' | 'recommended' | 'inverse'
  children?: React.ReactNode
}

function PlanCard({
  plan,
  icon: Icon,
  variant = 'standard',
  children,
}: PlanCardProps): React.ReactElement {
  const ctaVariant = plan.ctaVariant ?? 'default'
  const recommended = variant === 'recommended'
  const inverse = variant === 'inverse'

  const containerClasses = cn(
    'relative flex h-full flex-col gap-5 rounded-2xl p-8 shadow-md transition-shadow',
    inverse && 'bg-inverse-surface text-inverse-on-surface overflow-hidden',
    recommended &&
      'bg-surface-container-lowest border-2 border-primary shadow-lg md:-translate-y-4',
    !inverse && !recommended && 'bg-surface-container-lowest border border-outline-variant',
  )

  const iconWrapClasses = cn(
    'flex h-10 w-10 items-center justify-center rounded-md',
    inverse && 'bg-white/10 text-inverse-primary',
    recommended && 'bg-primary-fixed text-on-primary-fixed',
    !inverse && !recommended && 'bg-surface-container-high text-on-surface-variant',
  )

  const titleClasses = inverse ? 'text-inverse-on-surface' : 'text-on-surface'
  const pitchClasses = inverse ? 'text-white/70' : 'text-on-surface-variant'
  const priceClasses = inverse ? 'text-inverse-on-surface' : 'text-on-surface'
  const featureTextClasses = inverse ? 'text-white/85' : 'text-on-surface'
  const checkClasses = inverse
    ? 'text-primary-fixed-dim'
    : recommended
      ? 'text-primary'
      : 'text-primary'

  return (
    <div className={containerClasses}>
      {recommended && plan.badge ? (
        <span className="bg-primary text-on-primary absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-4 py-1 text-xs font-semibold tracking-[0.05em] uppercase shadow">
          <Star className="h-3 w-3 fill-current" aria-hidden />
          {plan.badge}
        </span>
      ) : null}

      {/* Subtle gradient overlay for inverse plan */}
      {inverse ? (
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-transparent to-transparent"
          aria-hidden
        />
      ) : null}

      <div className="relative z-10 flex items-center gap-3">
        <div className={iconWrapClasses}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className={cn('text-xl font-semibold tracking-[-0.01em]', titleClasses)}>
            {plan.name}
          </h3>
          <p className={cn('text-sm', pitchClasses)}>{plan.pitch}</p>
        </div>
      </div>

      <div className="relative z-10">
        <p className="flex items-baseline gap-1.5">
          <span className={cn('text-3xl font-bold tracking-[-0.02em] sm:text-4xl', priceClasses)}>
            {plan.priceLabel}
          </span>
          {plan.priceSuffix ? (
            <span className={cn('text-sm', pitchClasses)}>{plan.priceSuffix}</span>
          ) : null}
        </p>
        {plan.description ? (
          <p className={cn('mt-2 text-sm leading-relaxed', pitchClasses)}>{plan.description}</p>
        ) : null}
      </div>

      {children ? <div className="relative z-10">{children}</div> : null}

      <ul className="relative z-10 flex flex-col gap-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f} className={cn('flex items-start gap-2', featureTextClasses)}>
            <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', checkClasses)} aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="relative z-10 mt-auto pt-2">
        {plan.ctaTo !== undefined ? (
          <Button
            asChild
            size="lg"
            variant={ctaVariant}
            className={cn(
              'w-full gap-2 rounded-xl',
              recommended && 'bg-primary text-on-primary hover:bg-primary-container shadow-sm',
              inverse &&
                'bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm',
              !inverse &&
                !recommended &&
                ctaVariant === 'outline' &&
                'border-outline text-on-surface',
            )}
          >
            <Link to={plan.ctaTo}>
              {plan.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
        {plan.ctaHref !== undefined ? (
          <Button
            asChild
            size="lg"
            variant={ctaVariant}
            className={cn(
              'w-full gap-2 rounded-xl',
              inverse &&
                'bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm',
              !inverse && ctaVariant === 'outline' && 'border-outline text-on-surface',
            )}
          >
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
    <div className="bg-surface-container-low border-outline-variant flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-on-surface-variant text-[11px] font-semibold tracking-[0.05em] uppercase">
          Nombre de sièges
        </span>
        <span className="text-primary text-base font-semibold">{seats}</span>
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
      <div className="text-on-surface-variant flex justify-between text-xs">
        <span>{MIN_SEATS}</span>
        <span>{MAX_SEATS}+</span>
      </div>
      <div className="bg-primary-container/10 mt-1 flex items-center justify-between gap-3 rounded p-2">
        <span className="text-primary inline-flex items-center gap-1.5 text-sm font-semibold">
          <BadgeCheck className="h-4 w-4" aria-hidden />
          {formatEuro(total)} <span className="font-normal opacity-70">/mois</span>
        </span>
        <span className="text-on-surface-variant text-[11px]">{discountLabel}</span>
      </div>
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
    <section id="pricing" className="bg-surface w-full py-24">
      <div className="mx-auto w-full max-w-[72rem] px-6">
        <div className="mb-16 text-center">
          <p className="text-primary mb-3 text-xs font-semibold tracking-[0.05em] uppercase">
            Tarifs
          </p>
          <h2 className="text-on-surface mb-4 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Choisissez votre stack.
          </h2>
          <p className="text-on-surface-variant mx-auto max-w-2xl text-lg leading-relaxed">
            Optimisez votre veille IA avec nos plans flexibles. Choisissez notre infrastructure LLM
            Maison clé en main, ou utilisez vos propres clés (BYOK) pour un contrôle total des
            coûts.
          </p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as PricingMode)}
          className="mb-12 items-center"
        >
          <TabsList className="bg-surface-variant h-11 rounded-lg p-1 shadow-sm">
            <TabsTrigger
              value="maison"
              className="data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary text-on-surface-variant rounded-md px-5 font-semibold transition-all data-[state=active]:shadow-sm"
            >
              LLM Maison (tout-inclus)
            </TabsTrigger>
            <TabsTrigger
              value="byok"
              className="data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary text-on-surface-variant rounded-md px-5 font-semibold transition-all data-[state=active]:shadow-sm"
            >
              BYOK (vos clés)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maison" className="mt-6">
            <p className="text-on-surface-variant mx-auto max-w-3xl text-center text-sm leading-relaxed">
              <span className="text-on-surface font-semibold">Mode Maison</span> : nous gérons les
              LLM (Haiku ou Sonnet selon palier), vous payez un forfait. Idéal pour démarrer vite,
              sans gérer de clés ni de monitoring multi-providers.
            </p>
          </TabsContent>
          <TabsContent value="byok" className="mt-6">
            <p className="text-on-surface-variant mx-auto max-w-3xl text-center text-sm leading-relaxed">
              <span className="text-on-surface font-semibold">Mode BYOK</span> : vous apportez vos
              clés OpenRouter / Anthropic / OpenAI / Mistral / 6 autres. Vous gardez le contrôle de
              vos modèles et de vos données — recommandé pour cas enterprise et data-sensible.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <PlanCard plan={PRICING[mode].solo} icon={Sparkles} variant="standard" />
          <PlanCard plan={proPlanWithComputedPrice} icon={Users} variant="recommended">
            <ProSeatConfigurator
              seats={seats}
              onChange={setSeats}
              total={proTotal}
              discountLabel={proPlan.seatPricing.discountLabel}
            />
            <p className="text-on-surface-variant -mt-1 text-xs">
              Adapté à VC, avocats, newsletters, brands, CTOs — configurez selon votre profil après
              inscription.
            </p>
          </PlanCard>
          <PlanCard plan={PRICING[mode].enterprise} icon={Building2} variant="inverse" />
        </div>

        <div className="bg-surface-container-lowest border-outline-variant mt-12 flex flex-col items-center gap-4 rounded-2xl border p-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-on-surface text-base font-semibold">
              Vous êtes VC, cabinet d'avocats, éditeur média ou brand ?
            </p>
            <p className="text-on-surface-variant mt-1 text-sm">
              Bundles dédiés (tenant isolé, custom rubrics, CSM). Démo en 30 minutes.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              asChild
              className="bg-primary text-on-primary hover:bg-primary-container gap-2 rounded-xl shadow-sm"
            >
              <Link to="/pricing">
                Configurer ma stack
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-outline text-on-surface bg-surface-container-high hover:bg-surface-container-highest gap-2 rounded-xl"
            >
              <a href={`mailto:${CONTACT_EMAIL}?subject=Kairos%20-%20Demande%20de%20d%C3%A9mo`}>
                <Mail className="h-4 w-4" aria-hidden />
                Contactez-nous
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
