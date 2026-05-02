import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Server } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  BASE_PRICES,
  type BillingMode,
  computePricing,
  formatEuro,
  type Segment,
} from '@/lib/pricing'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 7.5 — Onboarding étape 3 : configurateur (seats + mode billing).
// Récupère le segment depuis la query string posée par OnboardingProfile.
// Ne mute aucune donnée Supabase ici : on calcule le prix à la volée et on
// délègue le checkout à l'écran suivant (ou directement au flow Stripe).
// =============================================================================

const SEGMENT_NAMES: Record<Segment, string> = {
  solo: 'Solo / Indépendant',
  cto_sme: 'CTO / PME',
  newsletter: 'Newsletter',
  brand: 'Brand / Marketing',
  legal: 'Avocats / Compliance',
  vc_pe: 'VC / PE',
}

function isValidSegment(value: string | null): value is Segment {
  return value !== null && value in BASE_PRICES
}

export default function OnboardingConfigurator(): React.ReactElement {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const segmentParam = searchParams.get('segment')
  const segment: Segment = isValidSegment(segmentParam) ? segmentParam : 'cto_sme'

  const segmentPricing = BASE_PRICES[segment]
  const [seats, setSeats] = useState<number>(segmentPricing.default_seats)
  const [mode, setMode] = useState<BillingMode>('maison')

  const breakdown = useMemo(
    () => computePricing({ segment, seats, mode, addons: [] }),
    [segment, seats, mode],
  )

  const onContinue = (): void => {
    const params = new URLSearchParams({
      segment,
      seats: String(seats),
      mode,
    })
    navigate(`/onboarding/first-run?${params.toString()}`)
  }

  return (
    <div>
      <header>
        <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">Étape 3/4</p>
        <h1 className="text-on-surface mt-2 text-2xl font-semibold tracking-[-0.01em]">
          Configurez votre offre
        </h1>
        <p className="text-on-surface-variant mt-2 text-sm">
          Profil sélectionné&nbsp;:{' '}
          <span className="text-on-surface font-medium">{SEGMENT_NAMES[segment]}</span>. Ajustez le
          nombre de sièges et choisissez votre mode de facturation LLM.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Slider seats */}
          <section
            className={cn(
              'border-outline-variant bg-surface-container-low rounded-xl border p-6',
              !segmentPricing.per_seat && 'opacity-60',
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-on-surface text-sm font-semibold">Nombre de sièges</h2>
              <span className="text-primary text-2xl font-semibold tabular-nums">
                {segmentPricing.per_seat ? seats : segmentPricing.default_seats}
              </span>
            </div>
            <p className="text-on-surface-variant mt-1 text-xs">
              {segmentPricing.per_seat
                ? `Inclus : ${segmentPricing.default_seats} sièges. Sièges supplémentaires dégressifs.`
                : 'Forfait flat — sièges inclus dans l’offre, indépendant du nombre d’utilisateurs.'}
            </p>
            <div className="mt-5">
              <Slider
                value={[segmentPricing.per_seat ? seats : segmentPricing.default_seats]}
                min={segmentPricing.default_seats}
                max={100}
                step={1}
                onValueChange={(vals: number[]) => {
                  if (segmentPricing.per_seat && typeof vals[0] === 'number') {
                    setSeats(vals[0])
                  }
                }}
                disabled={!segmentPricing.per_seat}
                aria-label="Nombre de sièges"
              />
              <div className="text-on-surface-variant mt-2 flex justify-between text-[11px] tabular-nums">
                <span>{segmentPricing.default_seats}</span>
                <span>25</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
          </section>

          {/* Toggle mode */}
          <section className="border-outline-variant bg-surface-container-low rounded-xl border p-6">
            <h2 className="text-on-surface text-sm font-semibold">Mode de facturation LLM</h2>
            <p className="text-on-surface-variant mt-1 text-xs">
              Maison&nbsp;: nous gérons les clés et facturons forfaitairement. BYOK&nbsp;: vos clés,
              votre quota — nous facturons l’orchestration.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeCard
                icon={Server}
                title="Maison"
                price={segmentPricing.maison}
                hint="LLM gérés par Kairos"
                active={mode === 'maison'}
                onSelect={() => setMode('maison')}
              />
              <ModeCard
                icon={KeyRound}
                title="BYOK"
                price={segmentPricing.byok}
                hint="Vos propres clés API"
                active={mode === 'byok'}
                onSelect={() => setMode('byok')}
              />
            </div>
          </section>
        </div>

        {/* Récap pricing live */}
        <aside
          className="border-outline-variant bg-surface-container-lowest h-fit rounded-xl border p-6 shadow-sm"
          aria-live="polite"
        >
          <h2 className="text-on-surface-variant text-xs font-semibold tracking-[0.12em] uppercase">
            Récapitulatif
          </h2>
          <p className="text-on-surface mt-3 text-3xl font-semibold tabular-nums">
            {formatEuro(breakdown.total_monthly)}
            <span className="text-on-surface-variant ml-1 text-sm font-normal">/ mois</span>
          </p>
          <p className="text-on-surface-variant mt-1 text-xs">
            Soit {formatEuro(breakdown.total_annualized)} sur 12 mois.
          </p>
          <ul className="border-outline-variant mt-5 space-y-2 border-t pt-4 text-xs">
            {breakdown.lines.map((line, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className="text-on-surface-variant">{line.label}</span>
                <span className="text-on-surface tabular-nums">
                  {formatEuro(line.amount)}
                  <span className="text-on-surface-variant">
                    {line.period === 'monthly' ? ' /mo' : ' /an'}
                  </span>
                </span>
              </li>
            ))}
            {breakdown.seats_discount_pct > 0 && (
              <li className="text-primary flex justify-between gap-3 font-medium">
                <span>Remise sièges</span>
                <span className="tabular-nums">-{formatEuro(breakdown.seats_discount_eur)}</span>
              </li>
            )}
          </ul>
          <p className="text-on-surface-variant mt-5 text-[11px]">
            Essai 14 jours sans carte bancaire. Annulation possible à tout moment.
          </p>
        </aside>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => navigate('/onboarding/profile')}
          className="text-on-surface-variant h-11 gap-2 rounded-lg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour
        </Button>
        <Button
          onClick={onContinue}
          className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg px-6 font-medium"
        >
          Continuer
        </Button>
      </div>
    </div>
  )
}

interface ModeCardProps {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  price: number
  hint: string
  active: boolean
  onSelect: () => void
}

function ModeCard({
  icon: Icon,
  title,
  price,
  hint,
  active,
  onSelect,
}: ModeCardProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
        active
          ? 'border-primary bg-primary-fixed/30 shadow-sm'
          : 'border-outline-variant bg-surface-container-lowest hover:border-primary/60 hover:bg-surface-container-low',
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden={true} />
      </span>
      <span className="text-on-surface text-sm font-semibold">{title}</span>
      <span className="text-on-surface-variant text-xs">{hint}</span>
      <span className="text-on-surface mt-1 text-base font-semibold tabular-nums">
        {formatEuro(price)}
        <span className="text-on-surface-variant text-xs font-normal"> / mois</span>
      </span>
    </button>
  )
}
