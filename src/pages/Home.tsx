import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { FAQSection } from '@/components/features/landing/FAQSection'
import { Hero } from '@/components/features/landing/Hero'
import { MoatsSection } from '@/components/features/landing/MoatsSection'
import { PersonasSection } from '@/components/features/landing/PersonasSection'
import { PricingTable } from '@/components/features/landing/PricingTable'
import { ProblemSection } from '@/components/features/landing/ProblemSection'
import { SolutionSteps } from '@/components/features/landing/SolutionSteps'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

export default function Home(): React.ReactElement {
  const session = useAuthStore((s) => s.session)
  const demoCtaTo = session ? '/dashboard' : '/login?next=/dashboard'
  const demoCtaLabel = session ? 'Aller au dashboard' : 'Voir la démo'

  return (
    <div className="flex flex-col">
      <Hero demoCtaTo={demoCtaTo} demoCtaLabel={demoCtaLabel} />
      <ProblemSection />
      <SolutionSteps />
      <MoatsSection />
      <PersonasSection />
      <PricingTable />
      <FAQSection />

      {/* Final CTA — bandeau emerald sombre */}
      <section className="bg-inverse-surface text-inverse-on-surface relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-transparent to-transparent"
          aria-hidden
        />
        <div className="relative mx-auto flex w-full max-w-[72rem] flex-col items-start gap-6 px-6 py-20 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              Prêt à donner à votre équipe une longueur d'avance&nbsp;?
            </h2>
            <p className="mt-3 text-base text-white/70 sm:text-lg">
              Démarrez en quelques minutes — branchez vos sources, votre clé LLM (ou prenez la
              nôtre), lancez le premier run.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="bg-primary text-on-primary hover:bg-primary-container gap-2 rounded-2xl px-6 py-3 shadow-xl"
          >
            <Link to="/signup">
              Démarrer (essai 14 j)
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
