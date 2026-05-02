import { Compass, Home as HomeIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 7.5 — Page 404
// Affiche un message clair et propose un retour vers le dashboard si l'user est
// authentifié, sinon vers la home publique.
// =============================================================================

export default function NotFound(): React.ReactElement {
  const session = useAuthStore((s) => s.session)
  const homeHref = session ? '/dashboard' : '/'
  const homeLabel = session ? 'Retour au dashboard' : 'Retour à l’accueil'

  return (
    <main className="bg-surface text-on-surface flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <KairosLogo className="h-12 w-12 opacity-80" />
        </div>

        <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">Erreur 404</p>
        <h1 className="text-on-surface mt-3 text-3xl font-semibold tracking-[-0.02em]">
          Page introuvable
        </h1>
        <p className="text-on-surface-variant mt-3 text-sm">
          La page que vous cherchez n’existe pas ou a été déplacée. Vérifiez l’adresse ou utilisez
          la navigation pour retrouver votre chemin.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg"
          >
            <Link to={homeHref} className="gap-2">
              <HomeIcon className="h-4 w-4" aria-hidden="true" />
              {homeLabel}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-outline-variant text-on-surface h-11 rounded-lg"
          >
            <Link to="/" className="gap-2">
              <Compass className="h-4 w-4" aria-hidden="true" />
              Explorer Kairos
            </Link>
          </Button>
        </div>

        <p className="text-on-surface-variant mt-10 text-xs">
          Si vous pensez que c’est une erreur, contactez le support à{' '}
          <a href="mailto:support@kairos.example" className="text-primary hover:underline">
            support@kairos.example
          </a>
          .
        </p>
      </div>
    </main>
  )
}
