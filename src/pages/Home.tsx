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

      {/* Final CTA */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Prêt à donner à votre équipe une longueur d'avance ?
            </h2>
            <p className="mt-2 text-slate-300">
              Démarrez en quelques minutes — branchez vos sources, votre clé LLM (ou prenez la
              nôtre), lancez le premier run.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary" className="gap-2">
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
