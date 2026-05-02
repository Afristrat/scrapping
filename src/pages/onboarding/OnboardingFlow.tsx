import { Check } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 7.5 — Onboarding flow wrapper
// Layout partagé pour les écrans /onboarding/profile, /onboarding/configurator
// et /onboarding/first-run. Utilise le routing URL comme source de vérité de
// l'étape courante (pas de Zustand state) — chaque sous-page reste autonome
// et peut être bookmarked / revisitée. Plus simple à tester et à débugger.
// =============================================================================

type StepKey = 'signup' | 'profile' | 'configurator' | 'first-run'

interface Step {
  key: StepKey
  label: string
  /** Préfixe URL pour matcher l'étape courante. Vide pour signup (déjà passé). */
  pathPrefix: string | null
}

const STEPS: ReadonlyArray<Step> = [
  { key: 'signup', label: 'Inscription', pathPrefix: null },
  { key: 'profile', label: 'Profil', pathPrefix: '/onboarding/profile' },
  { key: 'configurator', label: 'Configuration', pathPrefix: '/onboarding/configurator' },
  { key: 'first-run', label: 'Premier run', pathPrefix: '/onboarding/first-run' },
]

function activeIndex(pathname: string): number {
  for (let i = 1; i < STEPS.length; i += 1) {
    const prefix = STEPS[i].pathPrefix
    if (prefix && pathname.startsWith(prefix)) return i
  }
  // Par défaut on considère qu'on est sur Profile (premier sous-écran).
  return 1
}

export default function OnboardingFlow(): React.ReactElement {
  const location = useLocation()
  const current = activeIndex(location.pathname)

  return (
    <main className="bg-surface text-on-surface min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-10 flex flex-col items-center gap-3">
          <KairosLogo className="h-10 w-10" />
          <span className="text-on-surface text-lg font-bold tracking-tight">Kairos</span>
        </header>

        <Stepper current={current} />

        <div className="bg-surface-container-lowest border-outline-variant mt-10 rounded-xl border p-8 shadow-md sm:p-10">
          <Outlet />
        </div>

        <p className="text-on-surface-variant mt-8 text-center text-xs">
          Étape {current} sur {STEPS.length - 1}. Vous pouvez revenir en arrière à tout moment.
        </p>
      </div>
    </main>
  )
}

interface StepperProps {
  current: number
}

function Stepper({ current }: StepperProps): React.ReactElement {
  return (
    <ol
      className="flex items-center justify-between gap-2"
      aria-label="Progression de l’onboarding"
    >
      {STEPS.map((step, idx) => {
        const completed = idx < current
        const active = idx === current
        return (
          <li key={step.key} className="flex flex-1 items-center gap-3 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  active &&
                    'border-primary bg-primary-fixed text-on-primary-fixed-variant shadow-sm',
                  completed && 'border-primary bg-primary text-on-primary',
                  !active &&
                    !completed &&
                    'border-outline-variant bg-surface-container text-on-surface-variant',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {completed ? <Check className="h-4 w-4" aria-hidden="true" /> : idx + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  active && 'text-primary',
                  completed && 'text-on-primary-fixed-variant',
                  !active && !completed && 'text-on-surface-variant',
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'mb-5 h-px flex-1 transition-colors',
                  idx < current ? 'bg-primary' : 'bg-outline-variant',
                )}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
