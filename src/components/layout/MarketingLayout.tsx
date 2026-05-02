import { Link, Outlet } from 'react-router-dom'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { Button } from '@/components/ui/button'
import { useAppName } from '@/hooks/useAppName'
import { useAuthStore } from '@/stores/auth'

const GITHUB_URL = 'https://github.com/Afristrat/scrapping'
const CONTACT_EMAIL = 'hello@kairos.ai-mpower.com'

function GithubIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      width={16}
      height={16}
    >
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.51-3.79-1.51-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 .03 1.96-.81 2.32-1.52-.81-.21-1.65-.86-1.65-2.21 0-.49.18-.89.48-1.21-.05-.21-.21-1.04.05-2.18 0 0 .39-.13 1.27.46.37-.1.76-.16 1.16-.16.4 0 .79.06 1.16.16.88-.59 1.27-.46 1.27-.46.26 1.14.1 1.97.05 2.18.3.32.48.72.48 1.21 0 1.35-.84 2-1.65 2.21.5.43.97 1.27.97 2.43v3.6c0 .3.21.65.78.54 4.46-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  )
}

export function MarketingLayout(): React.ReactElement {
  const session = useAuthStore((s) => s.session)
  const appName = useAppName()

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
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
            >
              <GithubIcon className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          <div className="flex items-center gap-3">
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
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-inverse-primary inline-flex items-center gap-1.5 transition-colors"
                  >
                    <GithubIcon className="h-4 w-4" />
                    GitHub
                  </a>
                </li>
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
                    href={`mailto:${CONTACT_EMAIL}`}
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
