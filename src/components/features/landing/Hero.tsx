import { ArrowRight, BadgeCheck, BookOpen, PlayCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

interface HeroProps {
  demoCtaTo: string
  demoCtaLabel: string
}

export function Hero({ demoCtaTo, demoCtaLabel }: HeroProps): React.ReactElement {
  return (
    <section className="bg-surface relative overflow-hidden">
      {/* Halo subtil de fond — accent emerald pour le hero Kairos */}
      <div
        className="from-primary-fixed/30 via-surface to-surface pointer-events-none absolute inset-0 bg-gradient-to-b"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[72rem] px-6 py-20 sm:py-28">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="bg-surface-container-low text-on-surface-variant border-outline-variant inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.02em]">
            <Sparkles className="text-primary h-3.5 w-3.5" aria-hidden="true" />
            Veille IA scorée par LLM · mémoire 90 jours · BYOK 10 providers
          </span>

          <h1 className="text-on-surface mx-auto max-w-4xl text-4xl font-bold tracking-[-0.02em] sm:text-5xl lg:text-6xl">
            La veille IA qui comprend vos critères, pas seulement les mots-clés.
          </h1>

          <p className="text-on-surface-variant mx-auto max-w-2xl text-lg leading-relaxed sm:text-xl">
            Agrégez X, Reddit et arXiv. Scorez chaque signal selon VOS priorités, avec le LLM de
            votre choix (10 providers). Synthétisez en brief 80/20 dans votre langue. Suivez les
            topics qui émergent — pas ceux qui buzzent.
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-primary text-on-primary hover:bg-primary-container gap-2 rounded-2xl px-6 py-3 shadow-xl"
            >
              <Link to="/signup">
                Démarrer l'essai 14 jours
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-container-highest gap-2 rounded-xl px-6 py-3"
            >
              <Link to={demoCtaTo}>
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                {demoCtaLabel}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-on-surface-variant hover:text-primary gap-2 rounded-xl"
            >
              <Link to="/case-studies">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Voir nos case studies
              </Link>
            </Button>
          </div>

          <p className="text-on-surface-variant inline-flex items-center gap-1.5 text-sm">
            <BadgeCheck className="text-primary h-4 w-4" aria-hidden="true" />
            Aucune carte bancaire requise. BYOK ou LLM Maison inclus selon votre offre.
          </p>
        </div>

        {/* Visuel placeholder — bandeau gradient évoquant le dashboard */}
        <div className="bg-surface-container border-outline-variant relative mx-auto mt-16 flex h-56 w-full max-w-5xl items-center justify-center overflow-hidden rounded-2xl border shadow-md sm:h-64">
          <div
            className="from-surface-container-high to-surface-container absolute inset-0 bg-gradient-to-br opacity-70"
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 50%, var(--primary-fixed) 0%, transparent 35%), radial-gradient(circle at 80% 50%, var(--secondary-fixed-dim) 0%, transparent 40%)',
            }}
            aria-hidden
          />
          <span className="text-on-surface-variant relative z-10 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.05em] uppercase">
            <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
            Aperçu de l'interface de veille Kairos
          </span>
        </div>
      </div>
    </section>
  )
}
