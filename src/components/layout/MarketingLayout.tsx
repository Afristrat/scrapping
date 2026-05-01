import { Sparkles } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

const GITHUB_URL = 'https://github.com/meydeey/theresa-scrap'

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

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>zlatan-scrap</span>
          </Link>

          <nav className="flex items-center gap-2">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm text-slate-600 hover:text-slate-900 sm:inline-flex"
            >
              <GithubIcon className="h-4 w-4" />
              GitHub
            </a>
            {session ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Aller au dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Se connecter</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup">Démarrer</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-white">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>zlatan-scrap</span>
              </Link>
              <p className="mt-3 max-w-sm text-sm text-slate-600">
                La veille IA qui comprend vos critères. Scoring LLM custom, cascade transversale,
                mémoire 90 jours — pour votre équipe ou votre organisation.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Produit
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
                <li>
                  <a href="/#pricing" className="hover:text-slate-900">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/#faq" className="hover:text-slate-900">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link to="/login" className="hover:text-slate-900">
                    Se connecter
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-slate-900">
                    Démarrer (essai 14 j)
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Ressources
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
                <li>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-slate-900"
                  >
                    <GithubIcon className="h-4 w-4" />
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="mailto:hello@zlatan-scrap.com" className="hover:text-slate-900">
                    Nous contacter
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} zlatan-scrap — Veille IA pour les équipes.</p>
            <p>Open source · MIT · Stack inspirée des best-practices Meydeey 2026</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
