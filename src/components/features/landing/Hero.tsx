import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

interface HeroProps {
  demoCtaTo: string
  demoCtaLabel: string
}

export function Hero({ demoCtaTo, demoCtaLabel }: HeroProps): React.ReactElement {
  return (
    <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="flex max-w-3xl flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Veille IA scorée par LLM, mémoire 90 jours, BYOK 10 providers
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            La veille IA qui comprend vos critères, pas seulement les mots-clés.
          </h1>
          <p className="text-lg text-slate-600 sm:text-xl">
            Agrégez X, Reddit et arXiv. Scorez chaque signal selon VOS priorités, avec le LLM de
            votre choix (10 providers). Synthétisez en brief 80/20 dans votre langue. Suivez les
            topics qui émergent — pas ceux qui buzzent.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild size="lg" className="gap-2">
              <Link to="/signup">
                Démarrer (essai 14 j)
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link to={demoCtaTo}>
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                {demoCtaLabel}
              </Link>
            </Button>
          </div>
          <p className="text-sm text-slate-500">
            Aucune carte bancaire requise. BYOK ou LLM Maison inclus selon votre offre.
          </p>
        </div>
      </div>
    </section>
  )
}
