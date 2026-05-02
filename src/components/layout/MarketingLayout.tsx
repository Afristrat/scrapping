import { Link, Outlet } from 'react-router-dom'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { CurrencyPicker } from '@/components/layout/CurrencyPicker'
import { Button } from '@/components/ui/button'
import { useAppName } from '@/hooks/useAppName'
import { useContactEmail } from '@/hooks/useAppSettings'
import { useAuthStore } from '@/stores/auth'

export function MarketingLayout(): React.ReactElement {
  const session = useAuthStore((s) => s.session)
  const appName = useAppName()
  const contactEmail = useContactEmail()

  return (
    <div className="bg-surface text-on-surface flex min-h-screen flex-col">
      <header className="bg-surface-container-lowest/80 border-outline-variant text-on-surface sticky top-0 z-40 border-b shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[72rem] items-center justify-between px-6">
          <Link
            to="/"
            className="text-on-surface flex items-center gap-2 text-xl font-semibold tracking-tight"
          >
            <KairosLogo className="h-8 w-8 rounded" />
            <span>{appName}</span>
          </Link>

          <nav className="text-on-surface-variant hidden items-center gap-6 md:flex">
            <a
              href="/#pricing"
              className="hover:text-primary text-sm font-medium transition-colors"
            >
              Tarifs
            </a>
            <Link
              to="/case-studies"
              className="hover:text-primary text-sm font-medium transition-colors"
            >
              Case studies
            </Link>
            <Link to="/blog" className="hover:text-primary text-sm font-medium transition-colors">
              Blog
            </Link>
            <a href="/#faq" className="hover:text-primary text-sm font-medium transition-colors">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <CurrencyPicker />
            {session ? (
              <Button
                asChild
                size="sm"
                className="bg-primary text-on-primary hover:bg-primary-container rounded-xl shadow-sm"
              >
                <Link to="/dashboard">Aller au dashboard</Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-on-surface-variant hover:text-primary hidden sm:inline-flex"
                >
                  <Link to="/login">Se connecter</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-primary text-on-primary hover:bg-primary-container rounded-xl shadow-sm"
                >
                  <Link to="/signup">Démarrer</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-inverse-surface text-inverse-on-surface border-t border-white/10">
        <div className="mx-auto w-full max-w-[72rem] px-6 py-14">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <Link
                to="/"
                className="text-inverse-on-surface flex items-center gap-2 text-lg font-semibold tracking-tight"
              >
                <KairosLogo className="h-8 w-8 rounded" />
                <span>{appName}</span>
              </Link>
              <p className="mt-4 max-w-sm text-sm text-white/70">
                La veille IA qui comprend vos critères. Scoring LLM custom, cascade transversale,
                mémoire 90 jours — pour votre équipe ou votre organisation.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.05em] text-white/50 uppercase">
                Produit
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-white/70">
                <li>
                  <a href="/#pricing" className="hover:text-inverse-primary transition-colors">
                    Tarifs
                  </a>
                </li>
                <li>
                  <a href="/#faq" className="hover:text-inverse-primary transition-colors">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link to="/login" className="hover:text-inverse-primary transition-colors">
                    Se connecter
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-inverse-primary transition-colors">
                    Démarrer (essai 14 j)
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.05em] text-white/50 uppercase">
                Ressources
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-white/70">
                <li>
                  <a href="#" className="hover:text-inverse-primary transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <Link to="/blog" className="hover:text-inverse-primary transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/case-studies" className="hover:text-inverse-primary transition-colors">
                    Case studies
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="hover:text-inverse-primary transition-colors"
                  >
                    Nous contacter
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center">
            <p>
              © {new Date().getFullYear()} {appName} — Veille IA pour les équipes exigeantes.
            </p>
            <p>Precision in every moment.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
